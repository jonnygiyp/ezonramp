import { useState, useEffect, useCallback, useRef } from "react";
import { generateOnRampURL } from "@coinbase/cbpay-js";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Loader2, ExternalLink, LogIn, Check, X, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAccount, useModal } from "@/hooks/useParticle";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { AuthGatedButton } from "./AuthGatedButton";

interface CoinbaseOnrampWidgetProps {
  defaultAsset?: string;
  defaultNetwork?: string;
  subtitle?: string;
  defaultAmount?: string;
  hideHeader?: boolean;
  checkoutDescription?: string;
}

/**
 * Coinbase Global (hosted) Onramp widget.
 *
 * Status flow (mirrors Coinbase US headless + Stripe):
 *   waiting       -> popup opened, user paying on Coinbase
 *   initialized   -> Coinbase order accepted (set via webhook or status sync)
 *   processing    -> on-chain processing (status sync from Coinbase)
 *   completed     -> success (webhook or status sync)
 *   failed        -> Coinbase reported failure
 *   incomplete    -> popup closed quickly with no order created
 *   delayed       -> 30 min timeout reached without terminal state
 *
 * Because the hosted flow does not emit reliable client postMessage events,
 * we rely entirely on backend polling using a `partnerUserId` we generate
 * client-side and persist into `purchase_attempts.partner_user_ref`. The
 * `coinbase-headless` edge function's `pollTransactionStatus` action and
 * the `coinbase-webhook` handler already key off this same field, so this
 * widget reuses the exact same status pipeline as the US headless flow.
 */

type TxState =
  | "idle"
  | "waiting"
  | "checking"
  | "pending"
  | "incomplete"
  | "abandoned"
  | "expired"
  | "initialized"
  | "processing"
  | "completed"
  | "failed"
  | "delayed";

const POLL_INTERVAL_MS = 10_000;
const TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes — overall delayed cutoff
const CLOSE_GRACE_MS = 90_000; // 90s after popup close to confirm via webhook/poll
const RESUME_MAX_AGE_MS = 5 * 60 * 1000; // 5 min — older pending sessions are expired

// Terminal states cannot be downgraded.
const TERMINAL: TxState[] = ["completed", "failed", "delayed", "incomplete", "abandoned", "expired"];
// States considered "in progress" that should advance forward only.
const IN_PROGRESS: TxState[] = ["waiting", "checking", "pending", "initialized", "processing"];

const START_AGAIN_STATES: TxState[] = ["waiting", "checking", "pending", "incomplete", "abandoned", "expired"];

export function CoinbaseOnrampWidget({
  defaultAsset = "USDC",
  defaultNetwork = "solana",
  subtitle,
  defaultAmount = "0",
  hideHeader = false,
  checkoutDescription,
}: CoinbaseOnrampWidgetProps) {
  const { toast } = useToast();
  const { address, isConnected } = useAccount();
  const { setOpen } = useModal();
  const { session } = useAuth();

  const [isLoading, setIsLoading] = useState(false);
  const [manualAddress, setManualAddress] = useState("");
  const [amount, setAmount] = useState(defaultAmount);
  const [isLoadingConfig, setIsLoadingConfig] = useState(true);
  const [appId, setAppId] = useState<string | null>(null);

  // Transaction tracking state
  const [txState, setTxState] = useState<TxState>("idle");
  const [partnerUserRef, setPartnerUserRef] = useState<string | null>(null);
  const [coinbaseTxId, setCoinbaseTxId] = useState<string | null>(null);
  const txStateRef = useRef<TxState>("idle");
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const windowCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const destinationAddress = isConnected && address ? address : manualAddress;

  // Fetch the Global App ID from the edge function
  useEffect(() => {
    const fetchAppId = async () => {
      try {
        const { data, error } = await supabase.functions.invoke("coinbase-config", {
          body: { variant: "global" },
        });
        if (error) throw error;
        if (data?.appId) setAppId(data.appId);
      } catch (err) {
        console.error("[COINBASE-GLOBAL] Failed to fetch config:", err);
      } finally {
        setIsLoadingConfig(false);
      }
    };
    fetchAppId();
  }, []);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
    if (windowCheckRef.current) { clearInterval(windowCheckRef.current); windowCheckRef.current = null; }
  }, []);

  const updateTxState = useCallback((state: TxState) => {
    const current = txStateRef.current;
    // Never downgrade a terminal state. Completed/success is sticky.
    if (TERMINAL.includes(current)) {
      if (current === "completed") return;
      // Allow other terminals to be replaced only by "completed".
      if (state !== "completed") return;
    }
    txStateRef.current = state;
    setTxState(state);
    if (TERMINAL.includes(state)) {
      stopPolling();
    }
  }, [stopPolling]);

  const startPolling = useCallback((attemptId: string) => {
    if (pollingRef.current) return;
    console.log("[COINBASE-GLOBAL] polling started for", attemptId);

    pollingRef.current = setInterval(async () => {
      try {
        const { data, error } = await supabase.functions.invoke("coinbase-headless", {
          body: { action: "pollTransactionStatus", partnerUserRef: attemptId },
        });
        if (error) {
          console.error("[COINBASE-GLOBAL] Poll error:", error);
          return;
        }
        if (data?.status) {
          const current = txStateRef.current;
          if (TERMINAL.includes(current) && current !== "completed") {
            // Allow webhook-confirmed completion to override prior incomplete/failed/delayed.
            if (data.status !== "completed") return;
          }
          const next = data.status as TxState;
          if (next !== current && next !== "idle") {
            console.log("[COINBASE-GLOBAL] webhook/status update received:", current, "->", next);
            updateTxState(next);
          }
        }
      } catch (err) {
        console.error("[COINBASE-GLOBAL] Poll exception:", err);
      }
    }, POLL_INTERVAL_MS);

    timeoutRef.current = setTimeout(() => {
      const current = txStateRef.current;
      if (IN_PROGRESS.includes(current)) {
        console.log("[COINBASE-GLOBAL] timeout reached, marking as delayed");
        updateTxState("delayed");
        (supabase as any)
          .from("purchase_attempts")
          .update({ status: "delayed" })
          .eq("partner_user_ref", attemptId);
      }
    }, TIMEOUT_MS);
  }, [updateTxState]);

  // Cleanup on unmount
  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  // Resume polling if user returns mid-flow with a non-terminal attempt for this session.
  // Older-than-15-min sessions are expired (marked incomplete) instead of resumed,
  // so the spinner cannot persist forever across logout/login.
  useEffect(() => {
    if (!session?.user?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await (supabase as any)
          .from("purchase_attempts")
          .select("partner_user_ref, status, coinbase_transaction_id, created_at")
          .eq("user_id", session.user.id)
          .eq("provider", "coinbase")
          .in("status", ["idle", "waiting", "initialized", "processing"])
          .order("created_at", { ascending: false })
          .limit(5);

        if (cancelled || !data || data.length === 0) return;

        // Expire any pending attempts older than the resume window. We never
        // revive these as active spinners.
        const now = Date.now();
        const stale = data.filter((r: any) => now - new Date(r.created_at).getTime() > RESUME_MAX_AGE_MS);
        if (stale.length > 0) {
          console.log("[COINBASE-GLOBAL] old pending session(s) expired:", stale.map((r: any) => r.partner_user_ref));
          await (supabase as any)
            .from("purchase_attempts")
            .update({ status: "incomplete" })
            .in("partner_user_ref", stale.map((r: any) => r.partner_user_ref));
        }

        const fresh = data.find((r: any) => now - new Date(r.created_at).getTime() <= RESUME_MAX_AGE_MS);
        if (!fresh) return;
        if (txStateRef.current !== "idle") return; // user already started a new flow

        console.log("[COINBASE-GLOBAL] old pending session found on login, resuming:", fresh.partner_user_ref);
        setPartnerUserRef(fresh.partner_user_ref);
        if (fresh.coinbase_transaction_id) setCoinbaseTxId(fresh.coinbase_transaction_id);
        // On resume the popup is already gone — surface as "checking" rather than a
        // forever "Complete your purchase" spinner.
        const resumed: TxState = fresh.status === "idle" || fresh.status === "waiting"
          ? "checking"
          : (fresh.status as TxState);
        updateTxState(resumed);
        startPolling(fresh.partner_user_ref);

        // Bound the resumed "checking" window — if no progress arrives soon, mark incomplete.
        if (resumed === "checking") {
          setTimeout(async () => {
            if (txStateRef.current === "checking") {
              console.log("[COINBASE-GLOBAL] resumed pending session marked incomplete after grace window");
              updateTxState("incomplete");
              try {
                await (supabase as any)
                  .from("purchase_attempts")
                  .update({ status: "incomplete" })
                  .eq("partner_user_ref", fresh.partner_user_ref);
              } catch {}
            }
          }, CLOSE_GRACE_MS);
        }
      } catch (err) {
        console.error("[COINBASE-GLOBAL] Resume check failed:", err);
      }
    })();
    return () => { cancelled = true; };
  }, [session?.user?.id, startPolling, updateTxState]);

  const resetFlow = useCallback(() => {
    stopPolling();
    setPartnerUserRef(null);
    setCoinbaseTxId(null);
    updateTxState("idle");
  }, [stopPolling, updateTxState]);

  // Handle the buy action - get session token and open URL with partnerUserId tracking
  const handleBuy = useCallback(async () => {
    if (!session) {
      toast({
        title: "Authentication Required",
        description: "Please sign in to use Coinbase onramp",
        variant: "destructive",
      });
      return;
    }

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
      // Generate a stable, unique partnerUserRef tied to this attempt.
      // Format: coinbase_global_<uuid> — kept under Coinbase's 49-char partnerUserId limit.
      const attemptId = `cbg_${crypto.randomUUID()}`;

      console.log("[COINBASE-GLOBAL] Creating session for", destinationAddress.slice(0, 10) + "...", "ref:", attemptId);

      // Get session token from the backend
      const { data, error } = await supabase.functions.invoke("coinbase-headless", {
        body: {
          action: "getSessionToken",
          destinationAddress,
          destinationNetwork: defaultNetwork,
          assets: [defaultAsset],
          connectedWalletAddress: isConnected && address ? address : undefined,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const sessionToken = data.sessionToken;
      if (!sessionToken) throw new Error("Failed to get session token");

      // Insert purchase attempt row BEFORE opening popup, so webhooks arriving
      // mid-flow can locate it by partner_user_ref.
      try {
        await (supabase as any).from("purchase_attempts").insert({
          user_id: session.user.id,
          wallet_address: destinationAddress,
          amount: parseFloat(amount) || 0,
          currency: "USD",
          crypto_currency: defaultAsset,
          network: defaultNetwork,
          partner_user_ref: attemptId,
          provider: "coinbase",
          status: "waiting",
        });
      } catch (err) {
        console.error("[COINBASE-GLOBAL] Failed to insert purchase attempt:", err);
      }

      // Build addresses for the URL
      const addresses: Record<string, string[]> = {};
      addresses[destinationAddress] = [defaultNetwork];

      // Generate the onramp URL with sessionToken AND partnerUserId for tracking
      const onrampURL = generateOnRampURL({
        sessionToken,
        addresses,
        assets: [defaultAsset],
        presetFiatAmount: parseFloat(amount) || 100,
        defaultNetwork,
        defaultAsset,
        partnerUserId: attemptId,
      });

      setPartnerUserRef(attemptId);
      updateTxState("waiting");

      console.log("[COINBASE-GLOBAL] Coinbase Global opened");
      const popup = window.open(onrampURL, "_blank", "width=460,height=700");

      if (!popup) {
        // Popup blocked, redirect instead - user will return to a polling-resume on remount
        window.location.href = onrampURL;
        return;
      }

      // Start polling immediately — webhook + Coinbase status API drives state changes
      startPolling(attemptId);

      // Detect popup close. As soon as it closes, surface a neutral "checking"
      // state and bound the wait — never leave the spinner forever.
      windowCheckRef.current = setInterval(() => {
        if (!popup.closed) return;
        if (windowCheckRef.current) clearInterval(windowCheckRef.current);
        windowCheckRef.current = null;
        console.log("[COINBASE-GLOBAL] Coinbase Global closed");

        // If the user closed the window while still in waiting (no Coinbase
        // order yet), flip to a brief "checking" state so the UI stops saying
        // "Complete your purchase".
        if (txStateRef.current === "waiting") {
          updateTxState("checking");
        }

        // After the grace window, if no webhook/poll progressed us past the
        // checking/waiting state, mark this attempt incomplete.
        setTimeout(async () => {
          const s = txStateRef.current;
          if (s === "waiting" || s === "checking") {
            console.log("[COINBASE-GLOBAL] pending session marked incomplete after close grace");
            updateTxState("incomplete");
            try {
              await (supabase as any)
                .from("purchase_attempts")
                .update({ status: "incomplete" })
                .eq("partner_user_ref", attemptId);
            } catch {}
          }
        }, CLOSE_GRACE_MS);
      }, 1000);

      toast({
        title: "Complete Payment",
        description: "Complete your purchase in the Coinbase window. Status will update here automatically.",
      });
    } catch (err) {
      console.error("[COINBASE-GLOBAL] Failed to initiate purchase:", err);
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to initiate purchase. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [destinationAddress, defaultNetwork, defaultAsset, amount, toast, session, isConnected, address, startPolling, updateTxState]);

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

  // Show transaction status view once a flow is in progress
  const showStatusView = txState !== "idle";

  return (
    <div className="space-y-8 animate-fade-in">
      {!hideHeader && (
      <div className="text-center space-y-2">
        <h1 className="text-lg md:text-2xl font-bold tracking-tight">
          Buy USDC with Coinbase
        </h1>
        <p className="text-xs md:text-sm text-muted-foreground">
          {subtitle ?? "International users can buy USDC with credit card, debit card, or bank transfer through Coinbase. May require KYC."}
        </p>
      </div>
      )}

      {/* Sign-in gate for logged-out users */}
      {!isConnected && (
        <div className="bg-card border border-border rounded-xl p-12 flex flex-col items-center justify-center space-y-4 text-center">
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

      {isConnected && !showStatusView && (
      <div className="bg-card border border-border rounded-xl p-6 space-y-6">
        {/* Amount Input */}
        <div className="space-y-2" data-tutorial="global-amount-input">
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
        <div className="space-y-2" data-tutorial="global-wallet-input">
          <Label htmlFor="wallet-global">Wallet address to receive USDC</Label>
          {isConnected && address ? (
            <>
              <div className="p-3 bg-muted/50 rounded-lg border border-border">
                <p className="font-mono text-sm truncate">{address}</p>
              </div>
              <p className="text-[10px] text-muted-foreground/70">
                Connected wallet detected
              </p>
            </>
          ) : (
            <>
              <Input
                id="wallet-global"
                type="text"
                placeholder="Sign Up / Sign In To Populate Address"
                value=""
                disabled
                className="font-mono bg-muted/50 cursor-not-allowed text-muted-foreground"
              />
              <p className="text-[10px] text-muted-foreground/70">
                Sign in to automatically populate your wallet address
              </p>
            </>
          )}
        </div>

        {/* Buy Button */}
        <AuthGatedButton
          onClick={handleBuy}
          size="lg"
          className="w-full"
          disabled={isLoading || !destinationAddress}
          data-tutorial="global-buy-button"
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
              Continue
              <ExternalLink className="ml-2 h-4 w-4" />
            </>
          )}
        </AuthGatedButton>

        <p className="text-xs text-center text-muted-foreground">
          {checkoutDescription ?? (<>A Coinbase window will open to complete your purchase. <br />
          Available worldwide with support for multiple payment methods.</>)}
        </p>
      </div>
      )}

      {/* Transaction status view — same UX pattern as Coinbase US headless flow */}
      {isConnected && showStatusView && (
        <div className="bg-card border border-border rounded-xl p-6">
          <div className="py-8 text-center space-y-6">
            {txState === "waiting" && (
              <>
                <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary" />
                <div className="space-y-2">
                  <h2 className="text-xl font-semibold">Complete Your Purchase</h2>
                  <p className="text-muted-foreground">Please complete your payment in the Coinbase window.</p>
                  <p className="text-xs text-muted-foreground">Status will update automatically every 10 seconds.</p>
                </div>
              </>
            )}

            {txState === "checking" && (
              <>
                <Loader2 className="h-12 w-12 animate-spin mx-auto text-muted-foreground" />
                <div className="space-y-2">
                  <h2 className="text-xl font-semibold">Checking transaction status...</h2>
                  <p className="text-muted-foreground">Confirming whether your purchase went through.</p>
                </div>
              </>
            )}

            {txState === "incomplete" && (
              <>
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-destructive/10">
                  <X className="h-8 w-8 text-destructive" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-xl font-semibold">Incomplete Transaction!</h2>
                  <p className="text-muted-foreground">You exited the process before completing your purchase.</p>
                </div>
                <Button onClick={resetFlow} className="w-full">Try Again</Button>
              </>
            )}

            {(txState === "initialized" || txState === "processing") && (
              <>
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-xl font-semibold">Purchase Initiated!</h2>
                  <p className="text-lg font-medium">
                    Transaction Status: {txState === "initialized" ? "Initialized" : "Processing"}
                  </p>
                </div>
                {coinbaseTxId && (
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="text-xs text-muted-foreground mb-1">Transaction ID</p>
                    <p className="font-mono text-sm truncate">{coinbaseTxId}</p>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">Status will automatically update every 10 seconds.</p>
              </>
            )}

            {txState === "completed" && (
              <>
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10">
                  <Check className="h-8 w-8 text-primary" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-xl font-semibold">Purchase Complete!</h2>
                  <p className="text-lg font-medium text-primary">Transaction Status: Completed</p>
                </div>
                {coinbaseTxId && (
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="text-xs text-muted-foreground mb-1">Transaction ID</p>
                    <p className="font-mono text-sm truncate">{coinbaseTxId}</p>
                  </div>
                )}
                <Button onClick={resetFlow} variant="outline" className="w-full">Make Another Purchase</Button>
              </>
            )}

            {txState === "failed" && (
              <>
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-destructive/10">
                  <X className="h-8 w-8 text-destructive" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-xl font-semibold">Transaction Failed</h2>
                  <p className="text-muted-foreground">Your purchase could not be completed. Please try again.</p>
                </div>
                <Button onClick={resetFlow} className="w-full">Try Again</Button>
              </>
            )}

            {txState === "delayed" && (
              <>
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-accent">
                  <Clock className="h-8 w-8 text-accent-foreground" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-xl font-semibold">Purchase Initiated!</h2>
                  <p className="text-lg font-medium text-muted-foreground">Transaction Status: Delayed</p>
                  <p className="text-muted-foreground">Your transaction is taking longer than expected. Please check again later.</p>
                </div>
                <Button onClick={resetFlow} variant="outline" className="w-full">Make Another Purchase</Button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Features (hidden during status view to keep focus) */}
      {!showStatusView && (
      <div className="grid grid-cols-3 gap-2 md:gap-4 text-sm text-muted-foreground">
        <div className="flex flex-col items-center space-y-1 md:space-y-2">
          <div className="w-8 h-8 md:w-12 md:h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <span className="text-base md:text-2xl">🌍</span>
          </div>
          <p className="font-medium text-xs md:text-sm">Global Coverage</p>
          <p className="text-center text-[10px] md:text-xs hidden md:block">Available in 100+ countries</p>
        </div>
        <div className="flex flex-col items-center space-y-1 md:space-y-2">
          <div className="w-8 h-8 md:w-12 md:h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <span className="text-base md:text-2xl">💳</span>
          </div>
          <p className="font-medium text-xs md:text-sm text-center">Multiple Methods</p>
          <p className="text-center text-[10px] md:text-xs hidden md:block">Cards, bank transfers & more</p>
        </div>
        <div className="flex flex-col items-center space-y-1 md:space-y-2">
          <div className="w-8 h-8 md:w-12 md:h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <span className="text-base md:text-2xl">🔒</span>
          </div>
          <p className="font-medium text-xs md:text-sm">Secure & Trusted</p>
          <p className="text-center text-[10px] md:text-xs hidden md:block">Powered by Coinbase</p>
        </div>
      </div>
      )}
    </div>
  );
}
