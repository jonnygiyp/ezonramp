import { useState, useEffect, useCallback } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAccount } from "@particle-network/connectkit";
import { supabase } from "@/integrations/supabase/client";
import { generateOnRampURL } from "@coinbase/cbpay-js";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { z } from "zod";

const amountSchema = z
  .number()
  .positive("Amount must be positive")
  .min(1, "Minimum amount is $1")
  .max(10000, "Maximum amount is $10,000");

const walletAddressSchema = z
  .string()
  .trim()
  .min(26, "Invalid wallet address")
  .max(128, "Invalid wallet address")
  .regex(/^[a-zA-Z0-9]+$/, "Invalid wallet address format");

interface CoinbaseEmbeddedOnrampProps {
  defaultAsset?: string;
  defaultNetwork?: string;
}

export function CoinbaseEmbeddedOnramp({
  defaultAsset = "USDC",
  defaultNetwork = "solana",
}: CoinbaseEmbeddedOnrampProps) {
  const { toast } = useToast();
  const { address, isConnected } = useAccount();

  const [amount, setAmount] = useState("");
  const [manualAddress, setManualAddress] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [appId, setAppId] = useState<string | null>(null);

  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);

  // Determine the destination address
  const destinationAddress = isConnected && address ? address : manualAddress;

  // Fetch App ID on mount
  useEffect(() => {
    const fetchAppId = async () => {
      try {
        const { data, error } = await supabase.functions.invoke("coinbase-onramp", {
          body: { getAppIdOnly: true },
        });
        if (error) throw error;
        if (data?.appId) {
          setAppId(data.appId);
        }
      } catch (err) {
        console.error("Failed to fetch Coinbase App ID:", err);
      }
    };
    fetchAppId();
  }, []);

  // Handle postMessage events from Coinbase iframe
  const handleMessage = useCallback((event: MessageEvent) => {
    // Only handle messages from Coinbase
    if (!event.origin.includes("coinbase.com")) return;

    try {
      const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
      console.log("Coinbase message:", data);

      if (data.eventName === "success" || data.event === "success") {
        toast({
          title: "Purchase Successful",
          description: "Your crypto purchase was completed successfully.",
        });
        setIsCheckoutOpen(false);
        setCheckoutUrl(null);
      } else if (data.eventName === "exit" || data.event === "exit") {
        setIsCheckoutOpen(false);
        setCheckoutUrl(null);
      } else if (data.eventName === "error" || data.event === "error") {
        toast({
          title: "Purchase Failed",
          description: data.error?.message || "Something went wrong with your purchase.",
          variant: "destructive",
        });
      }
    } catch {
      // Not a JSON message, ignore
    }
  }, [toast]);

  useEffect(() => {
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [handleMessage]);

  const startCheckout = async () => {
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
          description:
            addressResult.error.errors[0]?.message ||
            "Please enter a valid wallet address.",
          variant: "destructive",
        });
        return;
      }
    }

    // Validate amount if provided
    let presetFiatAmount: number | undefined;
    if (amount) {
      const parsedAmount = parseFloat(amount);
      const amountResult = amountSchema.safeParse(parsedAmount);
      if (!amountResult.success) {
        toast({
          title: "Invalid Amount",
          description:
            amountResult.error.errors[0]?.message ||
            "Please enter a valid amount.",
          variant: "destructive",
        });
        return;
      }
      presetFiatAmount = parsedAmount;
    }

    if (!appId) {
      toast({
        title: "Configuration Error",
        description: "Coinbase integration not configured. Please try again.",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);
    try {
      // Build network list for addresses
      const networks =
        defaultNetwork === "solana"
          ? ["solana"]
          : ["ethereum", "base", "polygon", "arbitrum"];

      // Generate the onramp URL using the SDK with App ID
      const url = generateOnRampURL({
        appId,
        addresses: { [destinationAddress]: networks },
        assets: [defaultAsset],
        presetFiatAmount: presetFiatAmount ? presetFiatAmount : undefined,
        defaultAsset,
        defaultNetwork,
      });

      console.log("Generated Coinbase URL:", url);
      setCheckoutUrl(url);
      setIsCheckoutOpen(true);
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to start checkout. Please try again.";

      toast({
        title: "Checkout Error",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="text-center space-y-4">
        <h1 className="text-2xl md:text-4xl font-bold tracking-tight">
          Buy {defaultAsset} with Coinbase
        </h1>
        <p className="text-lg md:text-xl text-muted-foreground">
          Purchase {defaultAsset} on{" "}
          {defaultNetwork.charAt(0).toUpperCase() + defaultNetwork.slice(1)} quickly
          and securely
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
                <span className="text-sm font-medium">
                  {defaultNetwork.charAt(0).toUpperCase() + defaultNetwork.slice(1)}
                </span>
              </div>
            </div>
          </div>
        </div>

        <Button
          onClick={startCheckout}
          size="lg"
          className="w-full text-lg py-6 hover-scale"
          disabled={isProcessing || (!isConnected && !manualAddress) || !appId}
          data-tutorial="buy-button"
        >
          {isProcessing ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Starting checkout...
            </>
          ) : (
            "Buy Crypto Now"
          )}
        </Button>

        <p className="text-xs text-center text-muted-foreground">
          Checkout opens here (embedded) — you won't be redirected away.
        </p>
      </div>

      <Dialog
        open={isCheckoutOpen}
        onOpenChange={(open) => {
          setIsCheckoutOpen(open);
          if (!open) setCheckoutUrl(null);
        }}
      >
        <DialogContent className="max-w-5xl w-[95vw] h-[85vh] p-0 overflow-hidden">
          <DialogHeader className="px-4 py-3 border-b border-border">
            <DialogTitle>Coinbase Checkout</DialogTitle>
          </DialogHeader>

          {checkoutUrl ? (
            <iframe
              title="Coinbase onramp checkout"
              src={checkoutUrl}
              className="w-full h-[calc(85vh-56px)]"
              allow="payment *; clipboard-read *; clipboard-write *"
            />
          ) : (
            <div className="flex items-center justify-center h-[calc(85vh-56px)]">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
