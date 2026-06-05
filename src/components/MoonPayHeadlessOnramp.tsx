import { useState, useEffect, useRef, useCallback } from "react";
import { useAccount } from "@/hooks/useParticle";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Button } from "./ui/button";
import { Loader2, Moon, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AuthGatedButton } from "./AuthGatedButton";

interface MoonPayHeadlessOnrampProps {
  defaultAsset?: string;
  defaultNetwork?: string;
}

const CONTAINER_ID = "moonpay-embedded-container";

/**
 * MoonPay Web SDK integration loaded via the global <script> tag
 * (see index.html → window.MoonPayWebSdk). Replaces the legacy
 * @moonpay/moonpay-react widget on the main onramp surface.
 */
export function MoonPayHeadlessOnramp({
  defaultAsset = "USDC",
  defaultNetwork = "solana",
}: MoonPayHeadlessOnrampProps) {
  const { address: particleAddress, isConnected } = useAccount();
  const [walletAddress, setWalletAddress] = useState(particleAddress || "");
  const [amount, setAmount] = useState("100");
  const [showWidget, setShowWidget] = useState(false);
  const [sdkReady, setSdkReady] = useState(typeof window !== "undefined" && !!window.MoonPayWebSdk);
  const [error, setError] = useState<string | null>(null);
  const widgetRef = useRef<MoonPayWebSdkInstance | null>(null);

  const publishableKey = import.meta.env.VITE_MOONPAY_PUBLISHABLE_KEY || "";
  const environment: "sandbox" | "production" = publishableKey.startsWith("pk_live_")
    ? "production"
    : "sandbox";

  useEffect(() => {
    if (particleAddress) setWalletAddress(particleAddress);
  }, [particleAddress]);

  // Poll briefly for the deferred SDK script.
  useEffect(() => {
    if (sdkReady) return;
    let cancelled = false;
    const start = Date.now();
    const tick = () => {
      if (cancelled) return;
      if (window.MoonPayWebSdk) {
        setSdkReady(true);
        return;
      }
      if (Date.now() - start > 10_000) {
        setError("MoonPay SDK failed to load. Please refresh and try again.");
        return;
      }
      setTimeout(tick, 150);
    };
    tick();
    return () => {
      cancelled = true;
    };
  }, [sdkReady]);

  const getCurrencyCode = useCallback(() => {
    if (defaultNetwork === "solana" && defaultAsset.toUpperCase() === "USDC") return "usdc_sol";
    if (defaultNetwork === "ethereum" && defaultAsset.toUpperCase() === "USDC") return "usdc";
    return defaultAsset.toLowerCase();
  }, [defaultAsset, defaultNetwork]);

  const handleSignature = useCallback(async (url: string): Promise<string> => {
    const { data, error } = await supabase.functions.invoke("moonpay-sign", {
      body: { urlForSigning: url },
    });
    if (error) throw error;
    return data.signature as string;
  }, []);

  // Launch SDK as an overlay (MoonPay-hosted modal). The embedded iframe
  // variant requires the current origin to be allowlisted in the MoonPay
  // dashboard; without that, buy.moonpay.com returns X-Frame-Options: DENY
  // ("refused to connect"). Overlay avoids that constraint entirely.
  useEffect(() => {
    if (!showWidget || !sdkReady || !publishableKey) return;
    if (!window.MoonPayWebSdk) return;

    let cancelled = false;
    try {
      const widget = window.MoonPayWebSdk.init({
        flow: "buy",
        environment,
        variant: "overlay",
        useWarnBeforeRefresh: false,
        params: {
          apiKey: publishableKey,
          currencyCode: getCurrencyCode(),
          walletAddress,
          baseCurrencyCode: "usd",
          baseCurrencyAmount: amount,
          colorCode: "#6366f1",
        },
        handlers: {
          onUrlSignatureRequested: handleSignature,
          onTransactionCompleted: (props) => {
            console.log("[MoonPay] transaction completed", props);
          },
          onTransactionCreated: (props) => {
            console.log("[MoonPay] transaction created", props);
          },
          onCloseOverlay: () => setShowWidget(false),
        },
      });
      widgetRef.current = widget;
      widget.show();
    } catch (e: unknown) {
      if (!cancelled) {
        const msg = e instanceof Error ? e.message : "Failed to initialize MoonPay";
        setError(msg);
        setShowWidget(false);
      }
    }

    return () => {
      cancelled = true;
      try {
        widgetRef.current?.close();
      } catch {
        // ignore
      }
      widgetRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showWidget, sdkReady, publishableKey, environment]);

  const handleBuyClick = () => {
    if (!walletAddress) return;
    setError(null);
    void import("@/lib/tracking").then((m) =>
      m.trackOnrampStart("moonpay", { wallet: walletAddress })
    );
    setShowWidget(true);
  };

  if (!publishableKey) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-6 text-center">
          <p className="text-destructive font-medium">
            MoonPay is not configured. Please add your MoonPay publishable key.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="text-center space-y-2">
        <div className="flex items-center justify-center gap-2">
          <Moon className="h-6 w-6 md:h-8 md:w-8 text-primary" />
          <h1 className="text-lg md:text-2xl font-bold tracking-tight">MoonPay</h1>
        </div>
        <p className="text-xs md:text-sm text-muted-foreground">
          Buy USDC with credit card, debit card, or bank transfer
        </p>
      </div>

      {!showWidget ? (
        <div className="bg-card border border-border rounded-xl p-6 space-y-6">
          <div className="space-y-4">
            <div className="space-y-2" data-tutorial="moonpay-wallet-input">
              <Label htmlFor="moonpay-wallet-address">
                {defaultNetwork === "solana"
                  ? "Wallet address to receive Solana USDC"
                  : "Wallet Address"}
              </Label>
              {isConnected && particleAddress ? (
                <>
                  <div className="p-3 bg-muted/50 rounded-lg border border-border">
                    <p className="font-mono text-sm truncate">{walletAddress}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">Connected wallet detected</p>
                </>
              ) : (
                <>
                  <Input
                    id="moonpay-wallet-address"
                    type="text"
                    placeholder="Sign Up / Sign In To Populate Address"
                    value=""
                    disabled
                    className="font-mono text-sm bg-muted/50 cursor-not-allowed text-muted-foreground"
                  />
                  <p className="text-xs text-muted-foreground">
                    Sign in to automatically populate your wallet address
                  </p>
                </>
              )}
            </div>

            <div className="space-y-2" data-tutorial="moonpay-amount-input">
              <Label htmlFor="moonpay-amount">Amount (USD)</Label>
              <Input
                id="moonpay-amount"
                type="number"
                placeholder="100"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                min="20"
                max="10000"
              />
              <p className="text-xs text-muted-foreground">Minimum: $20</p>
            </div>
          </div>

          {error && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <AuthGatedButton
            onClick={handleBuyClick}
            size="lg"
            className="w-full text-lg py-6 hover-scale"
            disabled={!walletAddress || !sdkReady}
            data-tutorial="moonpay-buy-button"
          >
            {!sdkReady ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Loading MoonPay...
              </>
            ) : (
              <>
                <Moon className="mr-2 h-5 w-5" />
                Buy USDC with MoonPay
              </>
            )}
          </AuthGatedButton>

          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <ExternalLink className="h-4 w-4" />
            <span>Powered by MoonPay {environment === "sandbox" ? "(Sandbox)" : ""}</span>
          </div>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl p-6 text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-sm text-muted-foreground">
            Opening MoonPay checkout… complete your purchase in the overlay.
          </p>
          <Button
            variant="outline"
            onClick={() => {
              try {
                widgetRef.current?.close();
              } catch {
                // ignore
              }
              setShowWidget(false);
            }}
          >
            Cancel
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-muted-foreground">
        <div className="flex flex-col items-center space-y-2">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <span className="text-2xl">💳</span>
          </div>
          <p className="font-medium">Cards & Bank Transfers</p>
        </div>
        <div className="flex flex-col items-center space-y-2">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <span className="text-2xl">🌍</span>
          </div>
          <p className="font-medium">160+ Countries</p>
        </div>
        <div className="flex flex-col items-center space-y-2">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <span className="text-2xl">⚡</span>
          </div>
          <p className="font-medium">Fast & Secure</p>
        </div>
      </div>
    </div>
  );
}
