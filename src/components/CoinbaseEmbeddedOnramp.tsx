import { useState, useEffect, useCallback, useRef } from "react";
import { initOnRamp, type CBPayInstanceType } from "@coinbase/cbpay-js";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAccount } from "@particle-network/connectkit";
import { z } from "zod";

const amountSchema = z.number().positive("Amount must be positive").min(1, "Minimum amount is $1").max(10000, "Maximum amount is $10,000");
const walletAddressSchema = z.string().trim().min(26, "Invalid wallet address").max(128, "Invalid wallet address").regex(/^[a-zA-Z0-9]+$/, "Invalid wallet address format");

// Coinbase CDP Project ID - this is a publishable key
const COINBASE_APP_ID = "e7041872-c6f2-4de1-826a-8c20f4d26e7f";

interface CoinbaseEmbeddedOnrampProps {
  defaultAsset?: string;
  defaultNetwork?: string;
}

export function CoinbaseEmbeddedOnramp({ 
  defaultAsset = "USDC", 
  defaultNetwork = "solana" 
}: CoinbaseEmbeddedOnrampProps) {
  const { toast } = useToast();
  const { address, isConnected } = useAccount();
  const [amount, setAmount] = useState("");
  const [manualAddress, setManualAddress] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const onrampInstanceRef = useRef<CBPayInstanceType | null>(null);

  // Determine the destination address
  const destinationAddress = isConnected && address ? address : manualAddress;

  // Initialize the onramp instance when we have an address
  const initializeOnramp = useCallback(() => {
    // Clean up existing instance
    if (onrampInstanceRef.current) {
      onrampInstanceRef.current.destroy();
      onrampInstanceRef.current = null;
      setIsReady(false);
    }

    if (!destinationAddress) return;

    // Validate address
    const addressResult = walletAddressSchema.safeParse(destinationAddress);
    if (!addressResult.success) return;

    const parsedAmount = parseFloat(amount);
    
    // Build addresses object based on network
    const addresses: Record<string, string[]> = {};
    if (defaultNetwork === "solana") {
      addresses[destinationAddress] = ["solana"];
    } else {
      addresses[destinationAddress] = ["ethereum", "base", "polygon", "arbitrum"];
    }

    const options = {
      appId: COINBASE_APP_ID,
      widgetParameters: {
        addresses,
        assets: [defaultAsset],
        defaultAsset,
        defaultNetwork,
        presetFiatAmount: parsedAmount > 0 ? parsedAmount : undefined,
        fiatCurrency: "USD",
      },
      onSuccess: () => {
        console.log("Coinbase onramp success");
        toast({
          title: "Purchase Successful",
          description: "Your crypto purchase has been completed.",
        });
        setIsProcessing(false);
      },
      onExit: (error?: Error) => {
        console.log("Coinbase onramp exit", error);
        if (error) {
          toast({
            title: "Purchase Cancelled",
            description: error.message || "The purchase was cancelled.",
            variant: "destructive",
          });
        }
        setIsProcessing(false);
      },
      onEvent: (event: { eventName: string }) => {
        console.log("Coinbase onramp event", event);
        if (event.eventName === "open") {
          setIsProcessing(true);
        }
      },
      experienceLoggedIn: "embedded" as const,
      experienceLoggedOut: "embedded" as const,
      closeOnExit: true,
      closeOnSuccess: true,
    };

    initOnRamp(options, (error, instance) => {
      if (error) {
        console.error("Failed to initialize Coinbase onramp:", error);
        toast({
          title: "Initialization Error",
          description: "Failed to initialize payment widget. Please try again.",
          variant: "destructive",
        });
        return;
      }
      
      if (instance) {
        onrampInstanceRef.current = instance;
        setIsReady(true);
        console.log("Coinbase onramp initialized");
      }
    });
  }, [destinationAddress, amount, defaultAsset, defaultNetwork, toast]);

  // Re-initialize when address or amount changes
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      initializeOnramp();
    }, 500); // Debounce to avoid too many re-initializations

    return () => {
      clearTimeout(timeoutId);
    };
  }, [initializeOnramp]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (onrampInstanceRef.current) {
        onrampInstanceRef.current.destroy();
      }
    };
  }, []);

  const handleBuy = () => {
    if (!destinationAddress) {
      toast({
        title: "Address Required",
        description: "Please connect your wallet or enter a receiving address.",
        variant: "destructive",
      });
      return;
    }

    // Validate address
    if (!isConnected) {
      const addressResult = walletAddressSchema.safeParse(destinationAddress);
      if (!addressResult.success) {
        toast({
          title: "Invalid Address",
          description: addressResult.error.errors[0]?.message || "Please enter a valid wallet address.",
          variant: "destructive",
        });
        return;
      }
    }

    // Validate amount if provided
    if (amount) {
      const parsedAmount = parseFloat(amount);
      const amountResult = amountSchema.safeParse(parsedAmount);
      if (!amountResult.success) {
        toast({
          title: "Invalid Amount",
          description: amountResult.error.errors[0]?.message || "Please enter a valid amount.",
          variant: "destructive",
        });
        return;
      }
    }

    if (!onrampInstanceRef.current) {
      // Try to initialize and open
      initializeOnramp();
      setTimeout(() => {
        if (onrampInstanceRef.current) {
          onrampInstanceRef.current.open();
        } else {
          toast({
            title: "Not Ready",
            description: "Payment widget is still loading. Please try again.",
            variant: "destructive",
          });
        }
      }, 1000);
      return;
    }

    setIsProcessing(true);
    onrampInstanceRef.current.open();
  };

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="text-center space-y-4">
        <h1 className="text-2xl md:text-4xl font-bold tracking-tight">Buy {defaultAsset} with Coinbase</h1>
        <p className="text-lg md:text-xl text-muted-foreground">
          Purchase {defaultAsset} on {defaultNetwork.charAt(0).toUpperCase() + defaultNetwork.slice(1)} quickly and securely
        </p>
      </div>

      <div className="bg-card border border-border rounded-xl p-6 space-y-6">
        <div className="space-y-4">
          {isConnected && address ? (
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="text-xs text-muted-foreground mb-1">Connected Wallet</p>
              <p className="font-mono text-sm truncate">{address}</p>
            </div>
          ) : (
            <div className="space-y-2" data-tutorial="wallet-input">
              <Label htmlFor="manual-address">Receiving Address</Label>
              <Input
                id="manual-address"
                type="text"
                placeholder="Enter your wallet address"
                value={manualAddress}
                onChange={(e) => setManualAddress(e.target.value)}
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Or connect your wallet above to auto-fill this field
              </p>
            </div>
          )}

          <div className="space-y-2" data-tutorial="amount-input">
            <Label htmlFor="coinbase-amount">Amount (USD) - Optional</Label>
            <Input
              id="coinbase-amount"
              type="number"
              placeholder="Enter amount (optional)"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              min="1"
              max="10000"
            />
            <p className="text-xs text-muted-foreground">
              Leave empty to choose amount in the checkout
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Asset</Label>
              <div className="flex items-center h-10 px-3 bg-muted rounded-md border border-input">
                <span className="text-sm font-medium">{defaultAsset}</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Network</Label>
              <div className="flex items-center h-10 px-3 bg-muted rounded-md border border-input">
                <span className="text-sm font-medium">{defaultNetwork.charAt(0).toUpperCase() + defaultNetwork.slice(1)}</span>
              </div>
            </div>
          </div>
        </div>

        <Button 
          onClick={handleBuy}
          size="lg"
          className="w-full text-lg py-6 hover-scale"
          disabled={isProcessing || (!isConnected && !manualAddress)}
          data-tutorial="buy-button"
        >
          {isProcessing ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Processing...
            </>
          ) : (
            'Buy Crypto Now'
          )}
        </Button>

        {isReady && (
          <p className="text-xs text-center text-muted-foreground">
            ✓ Checkout ready - complete purchase without leaving this page
          </p>
        )}
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-muted-foreground pt-4">
        <div className="flex flex-col items-center space-y-2">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <span className="text-2xl">⚡</span>
          </div>
          <p className="font-medium">Fast Transactions</p>
        </div>
        <div className="flex flex-col items-center space-y-2">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <span className="text-2xl">🔒</span>
          </div>
          <p className="font-medium">Secure Processing</p>
        </div>
        <div className="flex flex-col items-center space-y-2">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <span className="text-2xl">🏠</span>
          </div>
          <p className="font-medium">Stay In App</p>
        </div>
      </div>
    </div>
  );
}
