import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, ExternalLink } from "lucide-react";
import { useAccount } from '@/hooks/useParticle';
import { loadStripeOnramp, StripeOnramp as StripeOnrampType } from "@stripe/crypto";

// Validate Solana address
const isSolanaAddress = (addr: string) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr);
const isEvmAddress = (addr: string) => /^0x[a-fA-F0-9]{40}$/.test(addr);

// Check if running inside an iframe
const isInIframe = () => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
};

// Main StripeOnramp component
interface StripeOnrampProps {
  defaultAsset?: string;
  defaultNetwork?: string;
}

export function StripeOnramp({ defaultAsset = "usdc", defaultNetwork = "solana" }: StripeOnrampProps) {
  const { toast } = useToast();
  const { address, isConnected } = useAccount();
  
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
      // Get client secret from edge function
      const { data, error: fnError } = await supabase.functions.invoke('stripe-onramp', {
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

      // Get publishable key from config
      const { data: configData, error: configError } = await supabase.functions.invoke('stripe-config');
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
      console.error("Onramp error:", err);
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to start onramp session",
        variant: "destructive",
      });
      setShowWidget(false);
    } finally {
      setIsLoading(false);
    }
  }, [walletAddress, defaultAsset, defaultNetwork, toast]);

  // Show embedded widget
  if (showWidget) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold tracking-tight">Complete Your Purchase</h2>
          <p className="text-muted-foreground">
            Follow the steps below to buy crypto
          </p>
        </div>
        
        <div 
          ref={onrampContainerRef} 
          className="min-h-[500px] rounded-xl overflow-hidden border border-border"
        />
        
        <Button
          variant="ghost"
          className="w-full"
          onClick={() => setShowWidget(false)}
        >
          Cancel
        </Button>
      </div>
    );
  }

  // Show iframe warning in development
  if (isInIframe()) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="text-center space-y-2">
          <h1 className="text-lg md:text-2xl font-bold tracking-tight">Buy Crypto with Stripe</h1>
          <p className="text-xs md:text-sm text-muted-foreground">
            Secure fiat-to-crypto purchases powered by Stripe
          </p>
        </div>

        <div className="bg-card border border-border rounded-xl p-6 space-y-4">
          <div className="text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              <ExternalLink className="w-6 h-6 text-primary" />
            </div>
            <h3 className="font-semibold">Open in New Tab Required</h3>
            <p className="text-sm text-muted-foreground">
              Stripe Onramp requires a full browser window and cannot run in the preview iframe.
            </p>
          </div>
          
          <Button
            onClick={() => window.open(window.location.href, '_blank')}
            size="lg"
            className="w-full text-lg py-6"
          >
            <ExternalLink className="mr-2 h-5 w-5" />
            Open in New Tab
          </Button>
        </div>
      </div>
    );
  }

  // Show setup form
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="text-center space-y-2">
        <h1 className="text-lg md:text-2xl font-bold tracking-tight">Buy Crypto with Stripe</h1>
        <p className="text-xs md:text-sm text-muted-foreground">
          Secure fiat-to-crypto purchases powered by Stripe
        </p>
      </div>

      <div className="bg-card border border-border rounded-xl p-6 space-y-6">
        <div className="space-y-4">
          <div className="space-y-2" data-tutorial="stripe-wallet-input">
            <Label htmlFor="wallet-address">
              {defaultNetwork === 'solana' ? 'Wallet address to receive Solana USDC' : 'EVM Wallet Address'}
            </Label>
            {connectedAddressValid ? (
              <>
                <div className="p-3 bg-muted/50 rounded-lg border border-border">
                  <p className="font-mono text-sm truncate">{walletAddress}</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  Connected wallet detected
                </p>
              </>
            ) : (
              <>
                <Input
                  id="wallet-address"
                  type="text"
                  placeholder="Sign Up / Sign In To Populate Address"
                  value=""
                  disabled
                  className="bg-muted/50 cursor-not-allowed text-muted-foreground"
                />
                <p className="text-xs text-muted-foreground">
                  Sign in to automatically populate your wallet address
                </p>
              </>
            )}
          </div>
        </div>

        <Button
          onClick={handleStartOnramp}
          size="lg"
          className="w-full text-lg py-6 hover-scale"
          disabled={isLoading || !walletAddress}
          data-tutorial="stripe-buy-button"
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Initializing...
            </>
          ) : (
            "Buy Crypto with Stripe"
          )}
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-2 md:gap-4 text-sm text-muted-foreground">
        <div className="flex flex-col items-center space-y-1 md:space-y-2">
          <div className="w-8 h-8 md:w-12 md:h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <span className="text-base md:text-2xl">🔒</span>
          </div>
          <p className="font-medium text-xs md:text-sm">Secure Payments</p>
        </div>
        <div className="flex flex-col items-center space-y-1 md:space-y-2">
          <div className="w-8 h-8 md:w-12 md:h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <span className="text-base md:text-2xl">⚡</span>
          </div>
          <p className="font-medium text-xs md:text-sm">Instant Delivery</p>
        </div>
        <div className="flex flex-col items-center space-y-1 md:space-y-2">
          <div className="w-8 h-8 md:w-12 md:h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <span className="text-base md:text-2xl">🇺🇸</span>
          </div>
          <p className="font-medium text-xs md:text-sm">USA Supported</p>
        </div>
      </div>
    </div>
  );
}
