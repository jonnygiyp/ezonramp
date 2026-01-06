import { useState, useEffect, useCallback } from "react";
import { CBPayInstanceType, initOnRamp } from "@coinbase/cbpay-js";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Loader2, ExternalLink, Globe } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAccount } from "@particle-network/connectkit";

interface CoinbaseOnrampWidgetProps {
  defaultAsset?: string;
  defaultNetwork?: string;
}

export function CoinbaseOnrampWidget({
  defaultAsset = "USDC",
  defaultNetwork = "solana",
}: CoinbaseOnrampWidgetProps) {
  const { toast } = useToast();
  const { address, isConnected } = useAccount();
  
  const [onrampInstance, setOnrampInstance] = useState<CBPayInstanceType | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [manualAddress, setManualAddress] = useState("");
  const [amount, setAmount] = useState("100");
  
  const destinationAddress = isConnected && address ? address : manualAddress;
  
  // Get the Coinbase Onramp App ID from environment
  const appId = import.meta.env.VITE_COINBASE_ONRAMP_APP_ID || "";

  // Initialize the Coinbase Onramp instance
  useEffect(() => {
    if (!destinationAddress || !appId) {
      setIsInitializing(false);
      return;
    }

    // Build addresses object for the widget
    const addresses: Record<string, string[]> = {};
    addresses[destinationAddress] = [defaultNetwork];

    initOnRamp(
      {
        appId,
        widgetParameters: {
          addresses,
          assets: [defaultAsset],
          defaultAsset,
          defaultNetwork,
          presetFiatAmount: parseFloat(amount) || 100,
          fiatCurrency: "USD",
        },
        onSuccess: () => {
          console.log("Coinbase Onramp: Success");
          toast({
            title: "Purchase Complete",
            description: `Your ${defaultAsset} purchase was successful!`,
          });
        },
        onExit: () => {
          console.log("Coinbase Onramp: User exited");
        },
        onEvent: (event) => {
          console.log("Coinbase Onramp Event:", event);
        },
        experienceLoggedIn: "popup",
        experienceLoggedOut: "popup",
        closeOnExit: true,
        closeOnSuccess: true,
      },
      (error, instance) => {
        if (error) {
          console.error("Failed to initialize Coinbase Onramp:", error);
          toast({
            title: "Initialization Error",
            description: "Failed to initialize Coinbase Onramp. Please try again.",
            variant: "destructive",
          });
        }
        setOnrampInstance(instance || null);
        setIsInitializing(false);
      }
    );

    return () => {
      onrampInstance?.destroy();
    };
  }, [destinationAddress, appId, defaultAsset, defaultNetwork]);

  // Reinitialize when amount changes
  const reinitializeWithAmount = useCallback(() => {
    if (!destinationAddress || !appId) return;
    
    onrampInstance?.destroy();
    setIsInitializing(true);

    const addresses: Record<string, string[]> = {};
    addresses[destinationAddress] = [defaultNetwork];

    initOnRamp(
      {
        appId,
        widgetParameters: {
          addresses,
          assets: [defaultAsset],
          defaultAsset,
          defaultNetwork,
          presetFiatAmount: parseFloat(amount) || 100,
          fiatCurrency: "USD",
        },
        onSuccess: () => {
          toast({
            title: "Purchase Complete",
            description: `Your ${defaultAsset} purchase was successful!`,
          });
        },
        onExit: () => {
          console.log("Coinbase Onramp: User exited");
        },
        onEvent: (event) => {
          console.log("Coinbase Onramp Event:", event);
        },
        experienceLoggedIn: "popup",
        experienceLoggedOut: "popup",
        closeOnExit: true,
        closeOnSuccess: true,
      },
      (error, instance) => {
        if (error) {
          console.error("Failed to reinitialize Coinbase Onramp:", error);
        }
        setOnrampInstance(instance || null);
        setIsInitializing(false);
      }
    );
  }, [destinationAddress, appId, defaultAsset, defaultNetwork, amount, onrampInstance, toast]);

  const handleOpenWidget = () => {
    if (!onrampInstance) {
      toast({
        title: "Not Ready",
        description: "Please wait for the widget to initialize or enter a wallet address.",
        variant: "destructive",
      });
      return;
    }
    onrampInstance.open();
  };

  if (!appId) {
    return (
      <div className="space-y-8 animate-fade-in">
        <div className="text-center space-y-4">
          <h1 className="text-2xl md:text-4xl font-bold tracking-tight">
            Coinbase Onramp Unavailable
          </h1>
          <p className="text-lg text-muted-foreground">
            The Coinbase Onramp App ID is not configured. Please contact support.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="text-center space-y-4">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent text-accent-foreground text-sm">
          <Globe className="h-4 w-4" />
          International Users
        </div>
        <h1 className="text-2xl md:text-4xl font-bold tracking-tight">
          Purchase {defaultAsset} with Coinbase
        </h1>
        <p className="text-lg md:text-xl text-muted-foreground">
          Buy crypto using credit card, debit card, or bank transfer
        </p>
      </div>

      <div className="bg-card border border-border rounded-xl p-6 space-y-6">
        {/* Amount Input */}
        <div className="space-y-2">
          <Label htmlFor="amount">Amount (USD)</Label>
          <div className="flex gap-2">
            <Input
              id="amount"
              type="number"
              placeholder="100"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              min="1"
              className="text-lg"
            />
            <Button 
              variant="outline" 
              onClick={reinitializeWithAmount}
              disabled={isInitializing}
            >
              Update
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Enter the amount and click Update to set preset value
          </p>
        </div>

        {/* Wallet Address */}
        {!isConnected && (
          <div className="space-y-2">
            <Label htmlFor="wallet">Receiving Wallet Address</Label>
            <Input
              id="wallet"
              type="text"
              placeholder="Enter your wallet address"
              value={manualAddress}
              onChange={(e) => setManualAddress(e.target.value)}
              className="font-mono"
            />
          </div>
        )}

        {isConnected && address && (
          <div className="p-3 bg-muted/50 rounded-lg">
            <p className="text-xs text-muted-foreground mb-1">Connected Wallet</p>
            <p className="font-mono text-sm truncate">{address}</p>
          </div>
        )}

        {/* Open Widget Button */}
        <Button
          onClick={handleOpenWidget}
          size="lg"
          className="w-full"
          disabled={isInitializing || !onrampInstance || !destinationAddress}
        >
          {isInitializing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Initializing...
            </>
          ) : (
            <>
              Buy {defaultAsset} with Coinbase
              <ExternalLink className="ml-2 h-4 w-4" />
            </>
          )}
        </Button>

        <p className="text-xs text-center text-muted-foreground">
          A Coinbase popup will open to complete your purchase. <br />
          Available worldwide with support for multiple payment methods.
        </p>
      </div>

      {/* Features */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-muted-foreground">
        <div className="flex flex-col items-center space-y-2">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <span className="text-2xl">🌍</span>
          </div>
          <p className="font-medium">Global Coverage</p>
          <p className="text-center text-xs">Available in 100+ countries</p>
        </div>
        <div className="flex flex-col items-center space-y-2">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <span className="text-2xl">💳</span>
          </div>
          <p className="font-medium">Multiple Payment Methods</p>
          <p className="text-center text-xs">Cards, bank transfers & more</p>
        </div>
        <div className="flex flex-col items-center space-y-2">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <span className="text-2xl">🔒</span>
          </div>
          <p className="font-medium">Secure & Trusted</p>
          <p className="text-center text-xs">Powered by Coinbase</p>
        </div>
      </div>
    </div>
  );
}
