import { useState, useEffect, useCallback } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, ExternalLink, AlertCircle } from "lucide-react";
import { useAccount } from '@particle-network/connectkit';

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
  const [error, setError] = useState<string | null>(null);
  const [redirectUrl, setRedirectUrl] = useState<string | null>(null);

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
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('stripe-onramp', {
        body: {
          walletAddress: walletAddress.trim(),
          destinationCurrency: defaultAsset.toLowerCase(),
          destinationNetwork: defaultNetwork.toLowerCase(),
        },
      });

      if (fnError) throw fnError;

      if (data.error) {
        // Check if this is the API access error
        if (data.error.includes("Unrecognized request URL")) {
          setError("Stripe Crypto Onramp requires account approval. Please submit an application at dashboard.stripe.com/crypto-onramp/get-started");
        } else {
          throw new Error(data.error);
        }
        return;
      }

      if (data.redirectUrl) {
        setRedirectUrl(data.redirectUrl);
        // Open in new tab
        window.open(data.redirectUrl, '_blank');
      } else if (data.clientSecret) {
        // For future: when embedded is available
        toast({
          title: "Session Created",
          description: "Redirecting to Stripe checkout...",
        });
      }
    } catch (err) {
      console.error("Onramp error:", err);
      const errorMessage = err instanceof Error ? err.message : "Failed to start onramp session";
      
      if (errorMessage.includes("Unrecognized request URL")) {
        setError("Stripe Crypto Onramp requires account approval. Please submit an application at dashboard.stripe.com/crypto-onramp/get-started");
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
  }, [walletAddress, defaultAsset, defaultNetwork, toast]);

  // Show error state
  if (error) {
    return (
      <div className="space-y-8 animate-fade-in">
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold tracking-tight">Stripe Crypto Onramp</h1>
          <p className="text-xl text-muted-foreground">
            Secure fiat-to-crypto purchases powered by Stripe
          </p>
        </div>

        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-6 space-y-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-6 w-6 text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="space-y-2">
              <h3 className="font-semibold text-amber-700 dark:text-amber-400">Approval Required</h3>
              <p className="text-sm text-muted-foreground">
                The Stripe Crypto Onramp is in public preview and requires account approval before use.
              </p>
              <p className="text-sm text-muted-foreground">
                To get started:
              </p>
              <ol className="text-sm text-muted-foreground list-decimal list-inside space-y-1">
                <li>Sign in to your Stripe Dashboard</li>
                <li>Navigate to the Crypto Onramp section</li>
                <li>Submit the onramp application</li>
                <li>Wait for approval (usually within 48 hours)</li>
              </ol>
            </div>
          </div>
          
          <Button
            variant="outline"
            className="w-full"
            onClick={() => window.open('https://dashboard.stripe.com/crypto-onramp/get-started', '_blank')}
          >
            <ExternalLink className="mr-2 h-4 w-4" />
            Apply for Crypto Onramp Access
          </Button>
          
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => setError(null)}
          >
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  // Show setup form
  return (
    <div className="space-y-8 animate-fade-in">
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold tracking-tight">Buy Crypto with Stripe</h1>
        <p className="text-xl text-muted-foreground">
          Secure fiat-to-crypto purchases powered by Stripe
        </p>
      </div>

      <div className="bg-card border border-border rounded-xl p-6 space-y-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="wallet-address">
              {defaultNetwork === 'solana' ? 'Solana' : 'EVM'} Wallet Address
            </Label>
            <Input
              id="wallet-address"
              type="text"
              placeholder={defaultNetwork === 'solana' 
                ? "Enter your Solana wallet address"
                : "Enter your EVM wallet address (0x...)"}
              value={walletAddress}
              onChange={(e) => setWalletAddress(e.target.value)}
            />
            {connectedAddressValid && (
              <p className="text-xs text-muted-foreground">
                Connected wallet detected
              </p>
            )}
          </div>
        </div>

        <Button
          onClick={handleStartOnramp}
          size="lg"
          className="w-full text-lg py-6 hover-scale"
          disabled={isLoading || !walletAddress}
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

        {redirectUrl && (
          <div className="text-center">
            <p className="text-sm text-muted-foreground mb-2">
              Payment window opened. If it didn't open, click below:
            </p>
            <Button
              variant="link"
              onClick={() => window.open(redirectUrl, '_blank')}
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              Open Payment Page
            </Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-muted-foreground">
        <div className="flex flex-col items-center space-y-2">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <span className="text-2xl">🔒</span>
          </div>
          <p className="font-medium">Secure Payments</p>
        </div>
        <div className="flex flex-col items-center space-y-2">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <span className="text-2xl">⚡</span>
          </div>
          <p className="font-medium">Instant Delivery</p>
        </div>
        <div className="flex flex-col items-center space-y-2">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <span className="text-2xl">🇺🇸</span>
          </div>
          <p className="font-medium">USA Supported</p>
        </div>
      </div>
    </div>
  );
}
