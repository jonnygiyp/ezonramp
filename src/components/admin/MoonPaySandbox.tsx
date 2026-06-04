import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Moon, RefreshCw, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const CONTAINER_ID = "moonpay-admin-sandbox-container";

type EnvOverride = "auto" | "sandbox" | "production";

interface EventLogEntry {
  ts: string;
  type: string;
  payload: unknown;
}

/**
 * Admin-only dev environment for testing the MoonPay headless onramp.
 * Allows overriding wallet, amount, currency, and environment without
 * going through the public funnel. Captures SDK events for inspection.
 */
export default function MoonPaySandbox() {
  const publishableKey = import.meta.env.VITE_MOONPAY_PUBLISHABLE_KEY || "";

  const [walletAddress, setWalletAddress] = useState("");
  const [amount, setAmount] = useState("30");
  const [currencyCode, setCurrencyCode] = useState("usdc_sol");
  const [baseCurrency, setBaseCurrency] = useState("usd");
  const [envOverride, setEnvOverride] = useState<EnvOverride>("auto");
  const [running, setRunning] = useState(false);
  const [sdkReady, setSdkReady] = useState(
    typeof window !== "undefined" && !!window.MoonPayWebSdk
  );
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<EventLogEntry[]>([]);
  const widgetRef = useRef<MoonPayWebSdkInstance | null>(null);

  const autoEnvironment: "sandbox" | "production" = publishableKey.startsWith("pk_live_")
    ? "production"
    : "sandbox";
  const environment: "sandbox" | "production" =
    envOverride === "auto" ? autoEnvironment : envOverride;

  // Poll for SDK script.
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
        setError("MoonPay SDK failed to load. Refresh and try again.");
        return;
      }
      setTimeout(tick, 150);
    };
    tick();
    return () => {
      cancelled = true;
    };
  }, [sdkReady]);

  const pushEvent = useCallback((type: string, payload: unknown) => {
    setEvents((prev) => [
      { ts: new Date().toISOString(), type, payload },
      ...prev,
    ].slice(0, 50));
  }, []);

  const handleSignature = useCallback(async (url: string): Promise<string> => {
    pushEvent("urlSignatureRequested", { url });
    const { data, error } = await supabase.functions.invoke("moonpay-sign", {
      body: { urlForSigning: url },
    });
    if (error) {
      pushEvent("urlSignatureError", { message: error.message });
      throw error;
    }
    return data.signature as string;
  }, [pushEvent]);

  useEffect(() => {
    if (!running || !sdkReady || !publishableKey) return;
    if (!window.MoonPayWebSdk) return;

    try {
      const widget = window.MoonPayWebSdk.init({
        flow: "buy",
        environment,
        variant: "embedded",
        containerNodeSelector: `#${CONTAINER_ID}`,
        useWarnBeforeRefresh: false,
        params: {
          apiKey: publishableKey,
          currencyCode,
          walletAddress,
          baseCurrencyCode: baseCurrency,
          baseCurrencyAmount: amount,
          colorCode: "#6366f1",
        },
        handlers: {
          onUrlSignatureRequested: handleSignature,
          onTransactionCompleted: (props) => pushEvent("transactionCompleted", props),
          onTransactionCreated: (props) => pushEvent("transactionCreated", props),
        },
      });
      widgetRef.current = widget;
      widget.show();
      pushEvent("widgetMounted", { environment, currencyCode, amount, baseCurrency });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to initialize MoonPay";
      setError(msg);
      pushEvent("initError", { message: msg });
    }

    return () => {
      try {
        widgetRef.current?.close();
      } catch {
        // ignore
      }
      widgetRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, sdkReady, publishableKey, environment]);

  const handleStart = () => {
    setError(null);
    if (!walletAddress) {
      setError("Wallet address is required.");
      return;
    }
    setRunning(true);
  };

  const handleStop = () => {
    try {
      widgetRef.current?.close();
    } catch {
      // ignore
    }
    setRunning(false);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Moon className="h-5 w-5" />
            MoonPay Sandbox
            <Badge variant={environment === "sandbox" ? "secondary" : "destructive"}>
              {environment}
            </Badge>
          </CardTitle>
          <CardDescription>
            Internal dev environment for testing the MoonPay headless onramp. Uses the same
            edge functions and publishable key as the live widget. Set{" "}
            <code>VITE_MOONPAY_PUBLISHABLE_KEY</code> to a <code>pk_test_…</code> key to
            target sandbox.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="sandbox-wallet">Wallet address</Label>
              <Input
                id="sandbox-wallet"
                value={walletAddress}
                onChange={(e) => setWalletAddress(e.target.value)}
                placeholder="Recipient wallet (e.g. Solana address)"
                className="font-mono text-sm"
                disabled={running}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="sandbox-amount">Base amount</Label>
              <Input
                id="sandbox-amount"
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                min="1"
                disabled={running}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="sandbox-base">Base currency</Label>
              <Select value={baseCurrency} onValueChange={setBaseCurrency} disabled={running}>
                <SelectTrigger id="sandbox-base">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="usd">USD</SelectItem>
                  <SelectItem value="eur">EUR</SelectItem>
                  <SelectItem value="gbp">GBP</SelectItem>
                  <SelectItem value="cad">CAD</SelectItem>
                  <SelectItem value="aud">AUD</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="sandbox-currency">Crypto currency</Label>
              <Select value={currencyCode} onValueChange={setCurrencyCode} disabled={running}>
                <SelectTrigger id="sandbox-currency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="usdc_sol">USDC (Solana)</SelectItem>
                  <SelectItem value="usdc">USDC (Ethereum)</SelectItem>
                  <SelectItem value="sol">SOL</SelectItem>
                  <SelectItem value="eth">ETH</SelectItem>
                  <SelectItem value="btc">BTC</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="sandbox-env">Environment</Label>
              <Select
                value={envOverride}
                onValueChange={(v) => setEnvOverride(v as EnvOverride)}
                disabled={running}
              >
                <SelectTrigger id="sandbox-env">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto ({autoEnvironment})</SelectItem>
                  <SelectItem value="sandbox">Sandbox</SelectItem>
                  <SelectItem value="production">Production</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {!publishableKey && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              VITE_MOONPAY_PUBLISHABLE_KEY is not set. Configure it in Project Settings →
              Environment Variables.
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="flex gap-2">
            {!running ? (
              <Button onClick={handleStart} disabled={!sdkReady || !publishableKey}>
                {!sdkReady ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Loading SDK…
                  </>
                ) : (
                  <>
                    <Moon className="h-4 w-4 mr-2" /> Launch widget
                  </>
                )}
              </Button>
            ) : (
              <Button variant="outline" onClick={handleStop}>
                <RefreshCw className="h-4 w-4 mr-2" /> Reset
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {running && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Embedded widget</CardTitle>
          </CardHeader>
          <CardContent>
            <div id={CONTAINER_ID} className="min-h-[600px] rounded-lg border border-border" />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Event log</CardTitle>
            <CardDescription>Last 50 SDK events captured locally.</CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setEvents([])}>
            <Trash2 className="h-4 w-4 mr-1" /> Clear
          </Button>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground">No events yet.</p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {events.map((e, i) => (
                <div key={i} className="rounded-md border border-border p-2 text-xs">
                  <div className="flex items-center justify-between mb-1">
                    <Badge variant="outline">{e.type}</Badge>
                    <span className="text-muted-foreground">{e.ts}</span>
                  </div>
                  <pre className="font-mono text-[11px] whitespace-pre-wrap break-words text-muted-foreground">
                    {JSON.stringify(e.payload, null, 2)}
                  </pre>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
