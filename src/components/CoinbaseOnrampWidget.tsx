import { useState, useEffect, useCallback } from "react";
import { generateOnRampURL } from "@coinbase/cbpay-js";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Loader2, ExternalLink, Globe } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAccount } from "@particle-network/connectkit";
import { supabase } from "@/integrations/supabase/client";

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
  
  const [isLoading, setIsLoading] = useState(false);
  const [manualAddress, setManualAddress] = useState("");
  const [amount, setAmount] = useState("100");
  const [isLoadingConfig, setIsLoadingConfig] = useState(true);
  const [appId, setAppId] = useState<string | null>(null);
  
  const destinationAddress = isConnected && address ? address : manualAddress;

  // Fetch the App ID from the edge function
  useEffect(() => {
    const fetchAppId = async () => {
      try {
        const { data, error } = await supabase.functions.invoke("coinbase-config");
        if (error) throw error;
        if (data?.appId) {
          setAppId(data.appId);
        }
      } catch (err) {
        console.error("Failed to fetch Coinbase config:", err);
      } finally {
        setIsLoadingConfig(false);
      }
    };
    fetchAppId();
  }, []);

  // Handle the buy action - get session token and open URL
  const handleBuy = useCallback(async () => {
    if (!destinationAddress) {
      toast({
        title: "Wallet Required",
        description: "Please connect your wallet or enter a wallet address.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      console.log("Fetching session token for:", destinationAddress.slice(0, 10) + "...");
      
      // Get session token from the backend
      const { data, error } = await supabase.functions.invoke("coinbase-headless", {
        body: {
          action: "getSessionToken",
          destinationAddress,
          destinationNetwork: defaultNetwork,
          assets: [defaultAsset],
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      
      const sessionToken = data.sessionToken;
      if (!sessionToken) {
        throw new Error("Failed to get session token");
      }

      console.log("Session token obtained, generating URL...");

      // Build addresses for the URL
      const addresses: Record<string, string[]> = {};
      addresses[destinationAddress] = [defaultNetwork];

      // Generate the onramp URL with the session token and addresses
      const onrampURL = generateOnRampURL({
        sessionToken,
        addresses,
        assets: [defaultAsset],
        presetFiatAmount: parseFloat(amount) || 100,
        defaultNetwork,
        defaultAsset,
      });

      console.log("Opening Coinbase Onramp...");
      
      // Open in a popup window
      const popup = window.open(onrampURL, '_blank', 'width=460,height=700');
      
      if (!popup) {
        // Popup blocked, redirect instead
        window.location.href = onrampURL;
      }
    } catch (err) {
      console.error("Failed to initiate purchase:", err);
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to initiate purchase. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [destinationAddress, defaultNetwork, defaultAsset, amount, toast]);

  if (isLoadingConfig) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

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
        <h1 className="text-xl md:text-4xl font-bold tracking-tight">
          Purchase {defaultAsset} with Coinbase
        </h1>
        <p className="text-sm md:text-xl text-muted-foreground">
          Buy USDC using credit card, debit card, or bank transfer from anywhere!
        </p>
      </div>

      <div className="bg-card border border-border rounded-xl p-6 space-y-6">
        {/* Amount Input */}
        <div className="space-y-2">
          <Label htmlFor="amount-global">Amount (USD)</Label>
          <Input
            id="amount-global"
            type="number"
            placeholder="100"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            min="1"
            className="text-lg"
          />
        </div>

        {/* Wallet Address */}
        {!isConnected && (
          <div className="space-y-2">
            <Label htmlFor="wallet-global">Receiving Wallet Address</Label>
            <Input
              id="wallet-global"
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

        {/* Buy Button */}
        <Button
          onClick={handleBuy}
          size="lg"
          className="w-full"
          disabled={isLoading || !destinationAddress}
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading...
            </>
          ) : !destinationAddress ? (
            "Enter Wallet Address"
          ) : (
            <>
              Buy {defaultAsset} with Coinbase
              <ExternalLink className="ml-2 h-4 w-4" />
            </>
          )}
        </Button>

        <p className="text-xs text-center text-muted-foreground">
          A Coinbase window will open to complete your purchase. <br />
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
