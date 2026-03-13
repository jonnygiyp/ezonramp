import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "./ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, RefreshCw, Wallet } from "lucide-react";
import { useAccount } from '@/hooks/useParticle';
import { useSupabaseSession } from "@/hooks/useSupabaseSession";
import { loadStripeOnramp, StripeOnramp as StripeOnrampType } from "@stripe/crypto";

const isSolanaAddress = (addr: string) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr);
const isEvmAddress = (addr: string) => /^0x[a-fA-F0-9]{40}$/.test(addr);

interface StripeOnrampProps {
  defaultAsset?: string;
  defaultNetwork?: string;
}

type LoadState = 'idle' | 'loading' | 'ready' | 'error';

export function StripeOnramp({ defaultAsset = "usdc", defaultNetwork = "solana" }: StripeOnrampProps) {
  const { toast } = useToast();
  const { address, isConnected } = useAccount();
  const { getAccessToken, isLoading: isSessionLoading } = useSupabaseSession();

  const [loadState, setLoadState] = useState<LoadState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const onrampContainerRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(false);
  const sessionInitiatedRef = useRef(false);

  const connectedAddressValid = isConnected && address && (
    defaultNetwork === 'solana' ? isSolanaAddress(address) : isEvmAddress(address)
  );

  const walletAddress = connectedAddressValid ? address : '';

  const initStripeOnramp = useCallback(async () => {
    if (!walletAddress) return;
    if (loadState === 'loading') return;

    setLoadState('loading');
    setErrorMessage(null);

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error("Unable to establish a session. Please refresh the page and try again.");
      }

      // Create session and get config in parallel
      const [sessionResult, configResult] = await Promise.all([
        supabase.functions.invoke('stripe-onramp', {
          body: {
            walletAddress: walletAddress.trim(),
            destinationCurrency: defaultAsset.toLowerCase(),
            destinationNetwork: defaultNetwork.toLowerCase(),
          },
          headers: { authorization: `Bearer ${accessToken}` },
        }),
        supabase.functions.invoke('stripe-config'),
      ]);

      if (sessionResult.error) throw sessionResult.error;
      if (sessionResult.data?.error) throw new Error(sessionResult.data.error);
      if (configResult.error) throw configResult.error;

      const { clientSecret } = sessionResult.data;
      const publishableKey = configResult.data?.publishableKey;

      if (!clientSecret) throw new Error("No client secret received");
      if (!publishableKey) throw new Error("Stripe publishable key not configured");

      const stripeOnramp = await loadStripeOnramp(publishableKey);
      if (!stripeOnramp) throw new Error("Failed to load Stripe Onramp SDK");

      setLoadState('ready');

      // Mount after state update
      requestAnimationFrame(() => {
        if (onrampContainerRef.current && mountedRef.current) {
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
      });
    } catch (err) {
      console.error("Stripe onramp error:", err);
      setErrorMessage(err instanceof Error ? err.message : "Failed to start onramp session");
      setLoadState('error');
    }
  }, [walletAddress, defaultAsset, defaultNetwork, toast, getAccessToken, loadState]);

  // Track mount state
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Auto-initialize when wallet is connected and session is ready
  useEffect(() => {
    if (walletAddress && !isSessionLoading && loadState === 'idle' && !sessionInitiatedRef.current) {
      sessionInitiatedRef.current = true;
      initStripeOnramp();
    }
  }, [walletAddress, isSessionLoading, loadState, initStripeOnramp]);

  // Reset if wallet changes
  useEffect(() => {
    sessionInitiatedRef.current = false;
    setLoadState('idle');
  }, [walletAddress]);

  return (
    <div className="space-y-5 animate-fade-in max-w-lg mx-auto">
      {/* Header */}
      <div className="text-center space-y-1">
        <h1 className="text-lg md:text-2xl font-bold tracking-tight">Buy Crypto with Stripe</h1>
        <p className="text-xs md:text-sm text-muted-foreground">
          Secure fiat-to-crypto purchases powered by Stripe
        </p>
      </div>

      {/* Wallet Address Card */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-1.5">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Wallet className="h-4 w-4 text-primary" />
          <span>{defaultNetwork === 'solana' ? 'Wallet address to receive Solana USDC' : 'EVM Wallet Address'}</span>
        </div>
        {connectedAddressValid ? (
          <>
            <div className="p-2.5 bg-muted/50 rounded-lg border border-border">
              <p className="font-mono text-sm truncate">{walletAddress}</p>
            </div>
            <p className="text-xs text-muted-foreground">Connected wallet detected</p>
          </>
        ) : (
          <>
            <div className="p-2.5 bg-muted/50 rounded-lg border border-border">
              <p className="text-sm text-muted-foreground">Sign Up / Sign In to populate address</p>
            </div>
            <p className="text-xs text-muted-foreground">Sign in to automatically populate your wallet address</p>
          </>
        )}
      </div>

      {/* Stripe Widget Area */}
      {loadState === 'loading' && (
        <div className="bg-card border border-border rounded-xl p-12 flex flex-col items-center justify-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading Stripe checkout…</p>
        </div>
      )}

      {loadState === 'error' && (
        <div className="bg-card border border-destructive/30 rounded-xl p-8 flex flex-col items-center justify-center space-y-4 text-center">
          <p className="text-sm text-destructive font-medium">
            {errorMessage || "Unable to load Stripe onramp. Please try again."}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              sessionInitiatedRef.current = false;
              setLoadState('idle');
            }}
            className="gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Retry
          </Button>
        </div>
      )}

      {loadState === 'ready' && (
        <div
          ref={onrampContainerRef}
          className="rounded-xl overflow-hidden border border-border min-h-[500px]"
        />
      )}

      {loadState === 'idle' && !connectedAddressValid && (
        <div className="bg-card border border-border rounded-xl p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Sign in to start your purchase
          </p>
        </div>
      )}

      {/* Feature badges */}
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
