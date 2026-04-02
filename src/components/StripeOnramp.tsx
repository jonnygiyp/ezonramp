import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "./ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, RefreshCw, Wallet, LogIn } from "lucide-react";
import { useAccount, useModal } from '@/hooks/useParticle';
import { useSupabaseSession } from "@/hooks/useSupabaseSession";
import { loadStripeOnramp } from "@stripe/crypto";

const LOG_PREFIX = "[StripeOnramp]";
const log = (msg: string, ...args: unknown[]) => console.log(`${LOG_PREFIX} ${msg}`, ...args);
const logWarn = (msg: string, ...args: unknown[]) => console.warn(`${LOG_PREFIX} ${msg}`, ...args);
const logError = (msg: string, ...args: unknown[]) => console.error(`${LOG_PREFIX} ${msg}`, ...args);

const WATCHDOG_TIMEOUT_MS = 8000;

const isSolanaAddress = (addr: string) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr);
const isEvmAddress = (addr: string) => /^0x[a-fA-F0-9]{40}$/.test(addr);

interface StripeOnrampProps {
  defaultAsset?: string;
  defaultNetwork?: string;
  theme?: 'light' | 'dark';
}

type LoadState = 'idle' | 'loading' | 'mounted' | 'ready' | 'error';

export function StripeOnramp({ defaultAsset = "usdc", defaultNetwork = "solana" }: StripeOnrampProps) {
  const { toast } = useToast();
  const { address, isConnected } = useAccount();
  const { setOpen } = useModal();
  const { getAccessToken, isLoading: isSessionLoading } = useSupabaseSession();

  const [loadState, setLoadState] = useState<LoadState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const onrampContainerRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(false);
  const initLockRef = useRef(false);
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recoveryAttemptedRef = useRef(false);
  const currentSessionRef = useRef<any>(null);

  const connectedAddressValid = isConnected && address && (
    defaultNetwork === 'solana' ? isSolanaAddress(address) : isEvmAddress(address)
  );
  const walletAddress = connectedAddressValid ? address : '';

  const clearWatchdog = useCallback(() => {
    if (watchdogRef.current) {
      clearTimeout(watchdogRef.current);
      watchdogRef.current = null;
    }
  }, []);

  const destroySession = useCallback(() => {
    clearWatchdog();
    if (currentSessionRef.current) {
      try {
        // Stripe sessions don't have a destroy method, but we clear our ref
        currentSessionRef.current = null;
      } catch { /* ignore */ }
    }
    // Clear the container
    if (onrampContainerRef.current) {
      onrampContainerRef.current.innerHTML = '';
    }
    log("Session destroyed and container cleared");
  }, [clearWatchdog]);

  const initStripeOnramp = useCallback(async (isRecovery = false) => {
    // Guard against duplicate init
    if (initLockRef.current) {
      log("Init already in progress, skipping");
      return;
    }
    if (!walletAddress) {
      log("No wallet address, skipping init");
      return;
    }
    if (!mountedRef.current) {
      log("Component unmounted, skipping init");
      return;
    }

    initLockRef.current = true;
    log(isRecovery ? "Recovery attempt started" : "Init started", { walletAddress: walletAddress.slice(0, 10) });
    
    setLoadState('loading');
    setErrorMessage(null);

    try {
      log("Auth state resolving...");
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error("Unable to establish a session. Please refresh the page and try again.");
      }
      if (!mountedRef.current) { initLockRef.current = false; return; }
      log("Auth resolved");

      log("Requesting Stripe session and config...");
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

      if (!mountedRef.current) { initLockRef.current = false; return; }

      if (sessionResult.error) throw sessionResult.error;
      if (sessionResult.data?.error) throw new Error(sessionResult.data.error);
      if (configResult.error) throw configResult.error;

      const { clientSecret } = sessionResult.data;
      const publishableKey = configResult.data?.publishableKey;

      if (!clientSecret) throw new Error("No client secret received");
      if (!publishableKey) throw new Error("Stripe publishable key not configured");
      log("Client secret received:", clientSecret.slice(0, 20) + "...");

      const stripeOnramp = await loadStripeOnramp(publishableKey);
      if (!stripeOnramp) throw new Error("Failed to load Stripe Onramp SDK");
      if (!mountedRef.current) { initLockRef.current = false; return; }
      log("Stripe SDK loaded");

      // Transition to mounted state - container will render
      setLoadState('mounted');

      // Wait for container to be in DOM
      await new Promise<void>((resolve) => {
        const check = () => {
          if (onrampContainerRef.current && onrampContainerRef.current.offsetHeight > 0) {
            resolve();
          } else if (mountedRef.current) {
            requestAnimationFrame(check);
          } else {
            resolve(); // unmounted, bail
          }
        };
        requestAnimationFrame(check);
      });

      if (!mountedRef.current || !onrampContainerRef.current) {
        initLockRef.current = false;
        return;
      }

      log("Container ready, creating session and mounting...");
      const onrampSession = stripeOnramp.createSession({ clientSecret });
      currentSessionRef.current = onrampSession;

      // Listen for session updates
      onrampSession.addEventListener('onramp_session_updated', (event: any) => {
        log("Session updated:", event.payload?.session?.status);
        if (event.payload?.session?.status === 'fulfillment_complete') {
          toast({
            title: "Success!",
            description: "Your crypto purchase was successful.",
          });
        }
      });

      // Mount
      onrampSession.mount(onrampContainerRef.current);
      log("Mount called");

      // Start watchdog
      clearWatchdog();
      watchdogRef.current = setTimeout(() => {
        if (!mountedRef.current) return;

        // Check if iframe loaded content
        const container = onrampContainerRef.current;
        const iframe = container?.querySelector('iframe');
        const hasVisibleContent = iframe && iframe.offsetHeight > 50;

        if (hasVisibleContent) {
          log("Watchdog: iframe detected with content, treating as loaded");
          setLoadState('ready');
          initLockRef.current = false;
          return;
        }

        logWarn("Watchdog: Stripe did not render within timeout");

        if (!recoveryAttemptedRef.current && !isRecovery) {
          log("Attempting automatic recovery...");
          recoveryAttemptedRef.current = true;
          destroySession();
          initLockRef.current = false;
          initStripeOnramp(true);
        } else {
          logError("Recovery failed or already attempted, showing error UI");
          destroySession();
          setErrorMessage("Unable to load Stripe onramp. Please try again.");
          setLoadState('error');
          initLockRef.current = false;
        }
      }, WATCHDOG_TIMEOUT_MS);

      // Also poll for iframe presence as a success signal
      const pollInterval = setInterval(() => {
        if (!mountedRef.current) { clearInterval(pollInterval); return; }
        const container = onrampContainerRef.current;
        const iframe = container?.querySelector('iframe');
        if (iframe && iframe.offsetHeight > 50) {
          log("Widget loaded successfully (iframe detected)");
          clearInterval(pollInterval);
          clearWatchdog();
          setLoadState('ready');
          initLockRef.current = false;
        }
      }, 500);

      // Clear poll after watchdog timeout + buffer
      setTimeout(() => clearInterval(pollInterval), WATCHDOG_TIMEOUT_MS + 1000);

    } catch (err) {
      logError("Init error:", err);
      destroySession();
      setErrorMessage(err instanceof Error ? err.message : "Failed to start onramp session");
      setLoadState('error');
      initLockRef.current = false;
    }
  }, [walletAddress, defaultAsset, defaultNetwork, toast, getAccessToken, clearWatchdog, destroySession]);

  // Track component mount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearWatchdog();
      destroySession();
      initLockRef.current = false;
      log("Component unmounted, cleaned up");
    };
  }, [clearWatchdog, destroySession]);

  // Auto-initialize when wallet is connected and session is ready
  useEffect(() => {
    if (walletAddress && !isSessionLoading && loadState === 'idle') {
      log("Prerequisites met, starting init");
      recoveryAttemptedRef.current = false;
      initStripeOnramp();
    }
  }, [walletAddress, isSessionLoading, loadState, initStripeOnramp]);

  // Full reset if wallet changes
  useEffect(() => {
    log("Wallet changed, resetting");
    destroySession();
    initLockRef.current = false;
    recoveryAttemptedRef.current = false;
    setLoadState('idle');
  }, [walletAddress, destroySession]);

  const handleRetry = useCallback(() => {
    log("Manual retry triggered");
    destroySession();
    initLockRef.current = false;
    recoveryAttemptedRef.current = false;
    setLoadState('idle');
  }, [destroySession]);

  return (
    <div className="space-y-5 animate-fade-in max-w-lg mx-auto" data-tutorial="stripe-content">
      {/* Header */}
      <div className="text-center space-y-1">
        <h1 className="text-lg md:text-2xl font-bold tracking-tight">Buy USDC with Stripe</h1>
        <p className="text-xs md:text-sm text-muted-foreground">
          US residents with a Stripe account can buy instantly.
        </p>
      </div>

      {/* Loading state */}
      {loadState === 'loading' && (
        <div className="bg-card border border-border rounded-xl p-12 flex flex-col items-center justify-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading Stripe checkout…</p>
          <p className="text-xs text-muted-foreground/70">Please wait while secure checkout loads.</p>
        </div>
      )}

      {/* Error state */}
      {loadState === 'error' && (
        <div className="bg-card border border-destructive/30 rounded-xl p-8 flex flex-col items-center justify-center space-y-4 text-center">
          <p className="text-sm font-semibold text-foreground">Unable to load Stripe onramp</p>
          <p className="text-sm text-destructive font-medium">
            {errorMessage || "Please try again."}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRetry}
            className="gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Retry
          </Button>
        </div>
      )}

      {/* Stripe container - visible during mounted and ready states */}
      {(loadState === 'mounted' || loadState === 'ready') && (
        <div className="relative" data-tutorial="stripe-checkout">
          {loadState === 'mounted' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-card/80 rounded-xl">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <p className="text-xs text-muted-foreground mt-2">Rendering checkout…</p>
            </div>
          )}
          <div
            ref={onrampContainerRef}
            className="rounded-xl overflow-hidden border border-border min-h-[500px]"
          />
        </div>
      )}

      {/* Logged-out sign-in state */}
      {loadState === 'idle' && !connectedAddressValid && (
        <div className="bg-card border border-border rounded-xl p-12 flex flex-col items-center justify-center space-y-4 text-center" data-tutorial="stripe-sign-in">
          <Button
            onClick={() => setOpen(true)}
            className="gap-2 px-6"
            size="lg"
          >
            <LogIn className="h-4 w-4" />
            Sign In
          </Button>
          <p className="text-sm text-muted-foreground">
            to start your purchase
          </p>
        </div>
      )}

      {/* Wallet Address Card */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-1.5" data-tutorial="stripe-wallet-card">
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
