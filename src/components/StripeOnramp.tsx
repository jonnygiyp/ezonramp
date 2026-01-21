import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import { useAccount } from '@/hooks/useParticle';
import { useAuth } from "@/hooks/useAuth";
import { loadStripeOnramp, StripeOnramp as StripeOnrampType } from "@stripe/crypto";

// Validate Solana address
const isSolanaAddress = (addr: string) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr);
const isEvmAddress = (addr: string) => /^0x[a-fA-F0-9]{40}$/.test(addr);

// Main StripeOnramp component
interface StripeOnrampProps {
  defaultAsset?: string;
  defaultNetwork?: string;
}

export function StripeOnramp({ defaultAsset = "usdc", defaultNetwork = "solana" }: StripeOnrampProps) {
  const { toast } = useToast();
  const { address, isConnected } = useAccount();
  const { session, loading: authLoading } = useAuth();
  
  const [walletAddress, setWalletAddress] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showWidget, setShowWidget] = useState(false);
  const onrampContainerRef = useRef<HTMLDivElement>(null);
  const onrampInstanceRef = useRef<StripeOnrampType | null>(null);

  // Validate wallet address matches the target network
  const connectedAddressValid = isConnected && address && (
    defaultNetwork === 'solana' ? isSolanaAddress(address) : isEvmAddress(address)
  );

  // Auto-populate wallet address from connected wallet if valid
  useEffect(() => {
    if (connectedAddressValid && address && !walletAddress) {
      setWalletAddress(address);
    }
  }, [connectedAddressValid, address, walletAddress]);

  const handleStartOnramp = useCallback(async () => {
    // Check if auth is still loading
    if (authLoading) {
      toast({
        title: "Please Wait",
        description: "Loading authentication state...",
      });
      return;
    }
    
    // Check for valid Supabase session (no wallet verification required)
    if (!session) {
      toast({
        title: "Authentication Required",
        description: "Please sign in to continue",
        variant: "destructive",
      });
      return;
    }

    // Explicitly retrieve the access token from the session
    const accessToken = session.access_token;
    if (!accessToken) {
      toast({
        title: "Authentication Error",
        description: "Session token not available. Please sign in again.",
        variant: "destructive",
      });
      return;
    }

    if (!walletAddress.trim()) {
      toast({
        title: "Wallet Required",
        description: "Please enter a wallet address",
        variant: "destructive",
      });
      return;
    }

    // Validate address format
    const isValid = defaultNetwork === 'solana' 
      ? isSolanaAddress(walletAddress.trim())
      : isEvmAddress(walletAddress.trim());
    
    if (!isValid) {
      toast({
        title: "Invalid Address",
        description: defaultNetwork === 'solana' 
          ? "Please enter a valid Solana wallet address"
          : "Please enter a valid EVM wallet address",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      // Get client secret from edge function with explicit JWT in Authorization header
      console.log("[StripeOnramp] Invoking stripe-onramp with explicit JWT auth");
      const { data, error: fnError } = await supabase.functions.invoke('stripe-onramp', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: {
          walletAddress: walletAddress.trim(),
          destinationCurrency: defaultAsset.toLowerCase(),
          destinationNetwork: defaultNetwork.toLowerCase(),
        },
      });

      if (fnError) throw fnError;
      if (data.error) throw new Error(data.error);

      const { clientSecret } = data;
      if (!clientSecret) throw new Error("No client secret received");

      // Get publishable key from config with explicit JWT
      console.log("[StripeOnramp] Invoking stripe-config with explicit JWT auth");
      const { data: configData, error: configError } = await supabase.functions.invoke('stripe-config', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      if (configError) throw configError;
      
      const publishableKey = configData?.publishableKey;
      if (!publishableKey) throw new Error("Stripe publishable key not configured");

      // Load Stripe Onramp
      console.log("Loading Stripe Onramp with key:", publishableKey.substring(0, 20) + "...");
      let stripeOnramp;
      try {
        stripeOnramp = await loadStripeOnramp(publishableKey);
      } catch (loadError) {
        console.error("Stripe Onramp load error:", loadError);
        throw new Error(`Failed to load Stripe Onramp SDK: ${loadError instanceof Error ? loadError.message : 'Unknown error'}`);
      }
      
      if (!stripeOnramp) {
        throw new Error("Stripe Onramp SDK returned null - check if crypto onramp is enabled for your Stripe account");
      }

      onrampInstanceRef.current = stripeOnramp;
      setShowWidget(true);

      // Mount the onramp widget
      setTimeout(() => {
        if (onrampContainerRef.current && stripeOnramp) {
          const onrampSession = stripeOnramp.createSession({ clientSecret });
          
          onrampSession.addEventListener('onramp_session_updated', (event) => {
            console.log('Onramp session updated:', event.payload);
            if (event.payload.session.status === 'fulfillment_complete') {
              toast({
                title: "Success!",
                description: "Your crypto purchase was successful.",
              });
            }
          });

          onrampSession.mount(onrampContainerRef.current);
        }
      }, 100);

    } catch (err) {
      console.error("Stripe onramp error:", err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to start onramp';
      
      // Check for auth-related errors
      if (errorMessage.includes('401') || errorMessage.includes('Unauthorized') || errorMessage.includes('expired')) {
        toast({
          title: "Session Expired",
          description: "Please sign in again to continue.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Error",
          description: errorMessage,
          variant: "destructive",
        });
      }
    } finally {
      setIsLoading(false);
    }
  }, [authLoading, session, walletAddress, defaultNetwork, defaultAsset, toast]);

  const handleCloseWidget = useCallback(() => {
    setShowWidget(false);
    onrampInstanceRef.current = null;
  }, []);

  // Determine if user can interact with the form
  const isAuthenticated = !!session;
  const isReady = !authLoading && isAuthenticated;

  if (showWidget) {
    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold text-foreground">Complete Your Purchase</h3>
          <Button variant="outline" onClick={handleCloseWidget}>
            Cancel
          </Button>
        </div>
        <div 
          ref={onrampContainerRef} 
          className="min-h-[500px] border border-border rounded-lg bg-card"
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="wallet-address" className="text-foreground">
          Receive Address ({defaultNetwork === 'solana' ? 'Solana' : 'EVM'})
        </Label>
        <Input
          id="wallet-address"
          type="text"
          placeholder={isReady ? `Enter your ${defaultNetwork} wallet address` : "Sign in to enter address"}
          value={walletAddress}
          onChange={(e) => setWalletAddress(e.target.value)}
          disabled={!isReady}
          className="font-mono text-sm"
        />
        {connectedAddressValid && address && (
          <p className="text-xs text-muted-foreground">
            Using connected wallet: {address.slice(0, 8)}...{address.slice(-6)}
          </p>
        )}
      </div>

      <Button
        onClick={handleStartOnramp}
        disabled={isLoading || !isReady || !walletAddress.trim()}
        className="w-full"
      >
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Starting...
          </>
        ) : authLoading ? (
          "Loading..."
        ) : !isAuthenticated ? (
          "Sign in to Buy"
        ) : (
          "Buy Crypto"
        )}
      </Button>

      {!isAuthenticated && !authLoading && (
        <p className="text-sm text-muted-foreground text-center">
          Please sign in to purchase crypto
        </p>
      )}
    </div>
  );
}

export default StripeOnramp;
