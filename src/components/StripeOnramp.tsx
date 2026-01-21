import { useState, useEffect, useCallback } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, ExternalLink } from "lucide-react";
import { useAccount } from '@/hooks/useParticle';

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
  
  const [walletAddress, setWalletAddress] = useState("");
  const [isLoading, setIsLoading] = useState(false);

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

      // Open onramp in new window (required - Stripe Crypto Onramp cannot run in iframes)
      const onrampUrl = `/stripe-onramp?client_secret=${encodeURIComponent(clientSecret)}&pk=${encodeURIComponent(publishableKey)}`;
      
      const newWindow = window.open(onrampUrl, '_blank', 'noopener,noreferrer');
      
      if (!newWindow) {
        // Fallback: redirect current page if popup blocked
        toast({
          title: "Opening Stripe Onramp",
          description: "If a new window didn't open, please allow popups for this site.",
        });
        window.location.href = onrampUrl;
      } else {
        toast({
          title: "Stripe Onramp Opened",
          description: "Complete your purchase in the new window.",
        });
      }

    } catch (err) {
      console.error("Onramp error:", err);
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to start onramp session",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [walletAddress, defaultAsset, defaultNetwork, toast]);

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
            <>
              <ExternalLink className="mr-2 h-5 w-5" />
              Buy Crypto with Stripe
            </>
          )}
        </Button>
        
        <p className="text-xs text-center text-muted-foreground">
          Opens in a new window for security
        </p>
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
