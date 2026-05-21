import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Skeleton } from "./ui/skeleton";
import { Loader2, Mail, Phone, ArrowRight, ArrowLeft, Check, RefreshCw, ShieldCheck, X, Clock, AlertCircle, LogIn } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAccount, useModal } from "@/hooks/useParticle";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { z } from "zod";
import { AuthGatedButton } from "./AuthGatedButton";

const emailSchema = z.string().trim().email("Invalid email address").max(255);
const phoneSchema = z.string().trim().regex(/^\d{10}$/, "Enter your 10-digit US phone number");
const codeSchema = z.string().trim().regex(/^\d{4,8}$/, "Enter a valid verification code");

type Step = 'identity' | 'verify' | 'amount' | 'result';
type TxState = 'waiting' | 'incomplete' | 'initialized' | 'processing' | 'completed' | 'failed' | 'delayed';
type VerifyChannel = 'sms' | 'email';
type QuoteState = 'idle' | 'loading' | 'ready' | 'error';

interface QuoteData {
  purchaseAmount: string;
  fee: string;
  networkFee: string;
  total: string;
  quoteId: string;
}

// Verification storage key and validity period (60 days in milliseconds)
const VERIFICATION_STORAGE_KEY = 'coinbase_onramp_verification';
const VERIFICATION_VALIDITY_MS = 60 * 24 * 60 * 60 * 1000; // 60 days
const QUOTE_DEBOUNCE_MS = 500;
const MIN_AMOUNT = 1;
const MAX_AMOUNT = 500;

interface StoredVerification {
  channel: VerifyChannel;
  displayHint: string;
  verifiedAt: number;
}

function maskValue(channel: VerifyChannel, value: string): string {
  if (channel === 'email') {
    const [local, domain] = value.split('@');
    if (!domain) return '***@***';
    return `${local.slice(0, 2)}***@${domain}`;
  }
  // Phone: show last 4 digits
  return `***${value.slice(-4)}`;
}

function getStoredVerification(): StoredVerification | null {
  try {
    const stored = localStorage.getItem(VERIFICATION_STORAGE_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored);
    // Migrate old format: if 'value' field exists, convert to new format
    if (parsed.value && !parsed.displayHint) {
      const migrated: StoredVerification = {
        channel: parsed.channel,
        displayHint: maskValue(parsed.channel, parsed.value),
        verifiedAt: parsed.verifiedAt,
      };
      localStorage.setItem(VERIFICATION_STORAGE_KEY, JSON.stringify(migrated));
      return migrated;
    }
    const data: StoredVerification = parsed;
    const now = Date.now();
    if (now - data.verifiedAt < VERIFICATION_VALIDITY_MS) {
      return data;
    }
    localStorage.removeItem(VERIFICATION_STORAGE_KEY);
    return null;
  } catch {
    return null;
  }
}

function storeVerification(channel: VerifyChannel, value: string): void {
  const data: StoredVerification = {
    channel,
    displayHint: maskValue(channel, value),
    verifiedAt: Date.now(),
  };
  localStorage.setItem(VERIFICATION_STORAGE_KEY, JSON.stringify(data));
}

function clearStoredVerification(): void {
  localStorage.removeItem(VERIFICATION_STORAGE_KEY);
}

interface CoinbaseHeadlessOnrampProps {
  defaultAsset?: string;
  defaultNetwork?: string;
  presetAmounts?: string[];
  defaultAmount?: string;
  hideHeader?: boolean;
  transactionSource?: 'home' | 'express';
}

export function CoinbaseHeadlessOnramp({
  defaultAsset = "USDC",
  defaultNetwork = "solana",
  presetAmounts = ['50', '100', '250', '500'],
  defaultAmount = "0",
  hideHeader = false,
  transactionSource = 'home',
}: CoinbaseHeadlessOnrampProps) {
  const { toast } = useToast();
  const { address, isConnected } = useAccount();
  const { setOpen } = useModal();
  const { session } = useAuth();

  const storedVerification = getStoredVerification();
  const hasStoredVerification = !!storedVerification;

  const [step, setStep] = useState<Step>(hasStoredVerification ? 'amount' : 'identity');

  // Identity state
  const [verifyChannel, setVerifyChannel] = useState<VerifyChannel>(
    storedVerification?.channel || 'sms'
  );
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [manualAddress, setManualAddress] = useState("");

  // Verification state
  const [verificationCode, setVerificationCode] = useState("");
  const [isVerified, setIsVerified] = useState(hasStoredVerification);
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [codeSent, setCodeSent] = useState(false);

  // Quote state - inline auto-refresh
  const [amount, setAmount] = useState(defaultAmount);
  const [quote, setQuote] = useState<QuoteData | null>(null);
  const [quoteState, setQuoteState] = useState<QuoteState>('idle');
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [isLoadingBuy, setIsLoadingBuy] = useState(false);
  const quoteDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Transaction state
  const [txState, setTxState] = useState<TxState>('waiting');
  const [purchaseAttemptId, setPurchaseAttemptId] = useState<string | null>(null);
  const [coinbaseTxId, setCoinbaseTxId] = useState<string | null>(null);
  const txStateRef = useRef<TxState>('waiting');
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messageHandlerRef = useRef<((e: MessageEvent) => void) | null>(null);
  const windowCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Address validation
  const isEvmAddress = (addr: string) => /^0x[a-fA-F0-9]{40}$/.test(addr);
  const isSolanaAddress = (addr: string) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr);

  const connectedAddressValid = isConnected && address && (
    defaultNetwork === 'solana' ? isSolanaAddress(address) : isEvmAddress(address)
  );

  const destinationAddress = connectedAddressValid ? address : manualAddress;
  const identityValue = verifyChannel === 'email' ? email : `+1${phone}`;
  const showNetworkMismatch = isConnected && address && !connectedAddressValid;

  const isValidDestinationAddress = destinationAddress && (
    defaultNetwork === 'solana' ? isSolanaAddress(destinationAddress) : isEvmAddress(destinationAddress)
  );

  const getDaysRemaining = useCallback(() => {
    if (!storedVerification) return 0;
    const elapsed = Date.now() - storedVerification.verifiedAt;
    const remaining = VERIFICATION_VALIDITY_MS - elapsed;
    return Math.max(0, Math.ceil(remaining / (24 * 60 * 60 * 1000)));
  }, [storedVerification]);

  // Realtime subscription cleanup
  const realtimeChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // --- Polling & cleanup ---
  const stopPolling = useCallback(() => {
    if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
    if (windowCheckRef.current) { clearInterval(windowCheckRef.current); windowCheckRef.current = null; }
  }, []);

  // State priority — higher wins. Terminal success cannot be downgraded.
  // 0: unknown, 1: pending-ish, 2: non-success terminal, 3: success terminal
  const STATE_PRIORITY: Record<TxState, number> = {
    waiting: 1,
    initialized: 1,
    processing: 1,
    delayed: 1,        // delayed is informational, can still be upgraded by webhook
    incomplete: 2,
    failed: 2,
    completed: 3,
  };

  const updateTxState = useCallback((next: TxState, source: string = 'unknown') => {
    const current = txStateRef.current;
    const currentP = STATE_PRIORITY[current] ?? 0;
    const nextP = STATE_PRIORITY[next] ?? 0;

    // Never downgrade a terminal success state.
    if (currentP === 3 && next !== 'completed') {
      console.log('[COINBASE-STATE] blocked downgrade', { from: current, to: next, source });
      return;
    }
    // Don't move backward into "incomplete" once we've moved into initialized/processing.
    if (next === 'incomplete' && (current === 'initialized' || current === 'processing')) {
      console.log('[COINBASE-STATE] blocked incomplete after init', { from: current, source });
      return;
    }
    if (next === current) return;
    // Allow upgrades, allow lateral moves within same priority only if going forward.
    if (nextP < currentP) {
      console.log('[COINBASE-STATE] blocked lower-priority transition', { from: current, to: next, source });
      return;
    }

    console.log('[COINBASE-STATE] transition', { from: current, to: next, source });
    txStateRef.current = next;
    setTxState(next);
    if (next === 'completed' || next === 'failed') {
      stopPolling();
    }
  }, [stopPolling]);

  // Map DB status string -> TxState
  const mapDbStatus = (s: string | null | undefined): TxState | null => {
    if (!s) return null;
    switch (s) {
      case 'completed':
      case 'success':
      case 'fulfilled':
        return 'completed';
      case 'failed':
      case 'canceled':
      case 'expired':
        return 'failed';
      case 'incomplete':
        return 'incomplete';
      case 'processing':
        return 'processing';
      case 'initialized':
      case 'idle':
        return 'initialized';
      case 'delayed':
        return 'delayed';
      default:
        return null;
    }
  };

  // Subscribe to realtime updates on the purchase attempt so webhook-driven
  // status changes flow into the UI even after the Coinbase popup closes.
  const subscribeToAttempt = useCallback((attemptId: string) => {
    if (realtimeChannelRef.current) return;
    console.log('[COINBASE-RT] subscribing to attempt', attemptId);
    const channel = supabase
      .channel(`purchase_attempt_${attemptId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'purchase_attempts',
          filter: `partner_user_ref=eq.${attemptId}`,
        },
        (payload: any) => {
          const newRow = payload?.new || {};
          console.log('[COINBASE-RT] update received', { status: newRow.status, txId: newRow.coinbase_transaction_id });
          if (newRow.coinbase_transaction_id) {
            setCoinbaseTxId((prev) => prev || newRow.coinbase_transaction_id);
          }
          const mapped = mapDbStatus(newRow.status);
          if (mapped) updateTxState(mapped, 'realtime');
        }
      )
      .subscribe((status) => {
        console.log('[COINBASE-RT] channel status', status);
      });
    realtimeChannelRef.current = channel;
  }, [updateTxState]);

  // One-shot fetch in case we missed the realtime event (e.g. subscription
  // hadn't connected when webhook landed).
  const fetchAttemptStatus = useCallback(async (attemptId: string) => {
    try {
      const { data } = await (supabase as any)
        .from('purchase_attempts')
        .select('status, coinbase_transaction_id')
        .eq('partner_user_ref', attemptId)
        .maybeSingle();
      if (data) {
        if (data.coinbase_transaction_id) {
          setCoinbaseTxId((prev) => prev || data.coinbase_transaction_id);
        }
        const mapped = mapDbStatus(data.status);
        if (mapped) updateTxState(mapped, 'fetch');
      }
    } catch (err) {
      console.error('[COINBASE-RT] fetchAttemptStatus error', err);
    }
  }, [updateTxState]);

  const startPolling = useCallback((attemptId: string) => {
    if (pollingRef.current) return;
    console.log('[COINBASE-POLL] starting polling for', attemptId);

    pollingRef.current = setInterval(async () => {
      try {
        const { data, error } = await supabase.functions.invoke('coinbase-headless', {
          body: { action: 'pollTransactionStatus', partnerUserRef: attemptId },
        });
        if (error) { console.error('[COINBASE-POLL] Error:', error); return; }
        if (data?.status) {
          const mapped = mapDbStatus(data.status);
          if (mapped) updateTxState(mapped, 'poll');
        }
      } catch (err) { console.error('[COINBASE-POLL] Error:', err); }
    }, 10000);

    timeoutRef.current = setTimeout(() => {
      const current = txStateRef.current;
      if (current === 'initialized' || current === 'processing' || current === 'waiting') {
        updateTxState('delayed', 'timeout');
        (supabase as any).from('purchase_attempts')
          .update({ status: 'delayed' })
          .eq('partner_user_ref', attemptId);
      }
    }, 30 * 60 * 1000);
  }, [updateTxState]);

  useEffect(() => {
    return () => {
      stopPolling();
      if (messageHandlerRef.current) window.removeEventListener('message', messageHandlerRef.current);
      if (quoteDebounceRef.current) clearTimeout(quoteDebounceRef.current);
      if (realtimeChannelRef.current) {
        supabase.removeChannel(realtimeChannelRef.current);
        realtimeChannelRef.current = null;
      }
    };
  }, [stopPolling]);

  // --- Debounced quote fetching ---
  const fetchQuote = useCallback(async (amt: string) => {
    const numAmount = parseFloat(amt);
    if (!amt || isNaN(numAmount) || numAmount < MIN_AMOUNT || numAmount > MAX_AMOUNT) {
      setQuote(null);
      setQuoteState('idle');
      setQuoteError(null);
      return;
    }

    setQuoteState('loading');
    setQuoteError(null);

    try {
      const { data, error } = await supabase.functions.invoke('coinbase-headless', {
        body: {
          action: 'getQuote',
          purchaseCurrency: defaultAsset,
          purchaseNetwork: defaultNetwork,
          paymentAmount: amt,
          paymentCurrency: 'USD',
          paymentMethod: 'CARD',
          country: 'US',
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setQuote({
        purchaseAmount: data.purchase_amount?.value || amt,
        fee: data.coinbase_fee?.value || '0',
        networkFee: data.network_fee?.value || '0',
        total: data.payment_total?.value || amt,
        quoteId: data.quote_id || '',
      });
      setQuoteState('ready');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to get quote';
      setQuoteError(message);
      setQuoteState('error');
      setQuote(null);
    }
  }, [defaultAsset, defaultNetwork]);

  // Trigger debounced quote on amount change (only when on amount step and authenticated)
  useEffect(() => {
    if (step !== 'amount' || !session) return;

    if (quoteDebounceRef.current) clearTimeout(quoteDebounceRef.current);

    const numAmount = parseFloat(amount);
    if (!amount || isNaN(numAmount) || numAmount < MIN_AMOUNT || numAmount > MAX_AMOUNT) {
      setQuote(null);
      setQuoteState('idle');
      setQuoteError(null);
      return;
    }

    quoteDebounceRef.current = setTimeout(() => {
      fetchQuote(amount);
    }, QUOTE_DEBOUNCE_MS);

    return () => {
      if (quoteDebounceRef.current) clearTimeout(quoteDebounceRef.current);
    };
  }, [amount, step, session, fetchQuote]);

  // --- Verification ---
  const sendVerificationCode = async () => {
    const validation = verifyChannel === 'email'
      ? emailSchema.safeParse(email)
      : phoneSchema.safeParse(phone);

    if (!validation.success) {
      toast({ title: "Invalid Input", description: validation.error.errors[0]?.message, variant: "destructive" });
      return;
    }

    setIsSendingCode(true);
    try {
      const { data, error } = await supabase.functions.invoke("twilio-verify", {
        body: { action: 'send', channel: verifyChannel, to: identityValue },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Failed to send code');

      setCodeSent(true);
      setStep('verify');
      toast({ title: "Code Sent", description: `Verification code sent to ${verifyChannel === 'email' ? 'your email' : 'your phone'}` });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to send verification code';
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      setIsSendingCode(false);
    }
  };

  const verifyCode = async () => {
    const validation = codeSchema.safeParse(verificationCode);
    if (!validation.success) {
      toast({ title: "Invalid Code", description: validation.error.errors[0]?.message, variant: "destructive" });
      return;
    }

    setIsVerifying(true);
    try {
      const { data, error } = await supabase.functions.invoke("twilio-verify", {
        body: { action: 'check', channel: verifyChannel, to: identityValue, code: verificationCode },
      });
      if (error) throw error;
      if (!data?.verified) throw new Error('Invalid verification code');

      storeVerification(verifyChannel, identityValue);
      setIsVerified(true);
      setStep('amount');
      toast({ title: "Verified", description: "Your identity has been verified for 60 days" });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to verify code';
      toast({ title: "Verification Failed", description: message, variant: "destructive" });
    } finally {
      setIsVerifying(false);
    }
  };

  // --- Continue to Purchase: generate buy URL and open popup ---
  const continueToPurchase = async () => {
    if (!session) {
      toast({ title: "Authentication Required", description: "Please sign in to use Coinbase onramp", variant: "destructive" });
      return;
    }
    if (!amount || parseFloat(amount) < MIN_AMOUNT) {
      toast({ title: "Invalid Amount", description: `Please enter an amount of at least $${MIN_AMOUNT}`, variant: "destructive" });
      return;
    }
    if (!destinationAddress || !isValidDestinationAddress) {
      toast({ title: "Missing Wallet", description: "Please connect your wallet or enter a valid address", variant: "destructive" });
      return;
    }

    setIsLoadingBuy(true);

    try {
      // partnerUserRef tied to the authenticated Supabase user + this attempt.
      // Format: u<userIdShort>_a<uuidNoDashes> (<= 49 chars for Coinbase).
      const userIdShort = session.user.id.replace(/-/g, "").slice(0, 8);
      const attemptShort = crypto.randomUUID().replace(/-/g, "");
      const attemptId = `u${userIdShort}_a${attemptShort}`;

      const { data, error } = await supabase.functions.invoke("coinbase-headless", {
        body: {
          action: 'generateBuyUrl',
          purchaseCurrency: defaultAsset,
          purchaseNetwork: defaultNetwork,
          paymentAmount: amount,
          paymentCurrency: 'USD',
          paymentMethod: 'CARD',
          country: 'US',
          destinationAddress,
          connectedWalletAddress: isConnected && address ? address : undefined,
          partnerUserId: attemptId,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const buyUrl = data.buyUrl;
      if (!buyUrl) throw new Error('No payment URL received');

      // Set state and switch to result view
      setPurchaseAttemptId(attemptId);
      updateTxState('waiting', 'continueToPurchase');
      setStep('result');

      // Insert purchase attempt record
      try {
        await (supabase as any).from('purchase_attempts').insert({
          user_id: session.user.id,
          wallet_address: destinationAddress,
          amount: parseFloat(amount),
          currency: 'USD',
          crypto_currency: defaultAsset,
          network: defaultNetwork,
          partner_user_ref: attemptId,
          status: 'idle',
          source: transactionSource,
        });
      } catch (err) {
        console.error('[COINBASE] Failed to create purchase attempt:', err);
      }

      // Subscribe to realtime updates immediately so webhook-driven status
      // changes reach the UI even if Coinbase postMessage events never fire
      // (e.g. user closes the popup right after a successful payment).
      subscribeToAttempt(attemptId);

      // Open payment window
      console.log('[COINBASE-FLOW] opening payment window', { attemptId });
      void import("@/lib/tracking").then((m) => m.trackOnrampStart("coinbase", { partnerUserId: attemptId }));
      const paymentWindow = window.open(buyUrl, '_blank', 'width=500,height=700');

      if (!paymentWindow) {
        window.location.href = buyUrl;
        return;
      }

      toast({ title: "Complete Payment", description: "Complete your card payment in the Coinbase window" });

      // Listen for postMessage events from Coinbase
      const handleMessage = (event: MessageEvent) => {
        if (!event.origin.includes('coinbase.com')) return;
        const msgData = event.data;
        if (!msgData || typeof msgData !== 'object') return;

        const eventName = msgData.eventName || msgData.event || msgData.type;
        console.log('[COINBASE-EVENT]', eventName, msgData);

        switch (eventName) {
          case 'onramp_api.commit_success': {
            const txId = msgData.transactionId || msgData.data?.transactionId || msgData.orderId;
            if (txId) setCoinbaseTxId(txId);
            updateTxState('initialized', 'postMessage:commit_success');
            startPolling(attemptId);
            (supabase as any).from('purchase_attempts')
              .update({ status: 'initialized', coinbase_transaction_id: txId || null })
              .eq('partner_user_ref', attemptId);
            if (txId) void import("@/lib/tracking").then((m) => m.attachPurchase({ provider: "coinbase", transactionId: txId, status: "initialized" }));
            break;
          }
          case 'onramp_api.cancel':
            updateTxState('incomplete', 'postMessage:cancel');
            (supabase as any).from('purchase_attempts')
              .update({ status: 'incomplete' })
              .eq('partner_user_ref', attemptId);
            break;
          case 'onramp_api.polling_success': {
            updateTxState('completed', 'postMessage:polling_success');
            (supabase as any).from('purchase_attempts')
              .update({ status: 'completed' })
              .eq('partner_user_ref', attemptId);
            const txId = msgData.transactionId || msgData.data?.transactionId || msgData.orderId;
            if (txId) void import("@/lib/tracking").then((m) => m.attachPurchase({ provider: "coinbase", transactionId: txId, status: "completed" }));
            break;
          }
          case 'onramp_api.polling_error': {
            updateTxState('failed', 'postMessage:polling_error');
            (supabase as any).from('purchase_attempts')
              .update({ status: 'failed' })
              .eq('partner_user_ref', attemptId);
            const txId = msgData.transactionId || msgData.data?.transactionId || msgData.orderId;
            if (txId) void import("@/lib/tracking").then((m) => m.attachPurchase({ provider: "coinbase", transactionId: txId, status: "failed" }));
            break;
          }
        }
      };

      messageHandlerRef.current = handleMessage;
      window.addEventListener('message', handleMessage);

      // Monitor window close. Closing the popup is NOT proof the user abandoned
      // payment — Coinbase often closes itself after a successful purchase before
      // the success postMessage reaches us. We therefore:
      //   1. Never overwrite a terminal success status (guarded in updateTxState).
      //   2. Move to 'processing' (a neutral pending state) instead of 'incomplete'.
      //   3. Re-fetch the latest DB status (webhook may have already landed).
      //   4. Start polling so we converge on Coinbase's reported status.
      // The 30-minute polling timeout will eventually fall back to 'delayed' if
      // no confirmation ever arrives.
      windowCheckRef.current = setInterval(() => {
        if (paymentWindow.closed) {
          if (windowCheckRef.current) clearInterval(windowCheckRef.current);
          windowCheckRef.current = null;
          console.log('[COINBASE-FLOW] payment window closed', { attemptId, currentState: txStateRef.current });
          setTimeout(async () => {
            const current = txStateRef.current;
            // Only nudge into a neutral pending state — never mark incomplete here.
            if (current === 'waiting') {
              updateTxState('processing', 'window-close');
            }
            // Always check the DB in case the webhook beat us.
            await fetchAttemptStatus(attemptId);
            // Make sure polling is running even if commit_success never fired.
            startPolling(attemptId);
          }, 1500);
        }
      }, 1000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to initiate purchase';
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      setIsLoadingBuy(false);
    }
  };

  // --- Reset ---
  const resetFlow = () => {
    stopPolling();
    if (messageHandlerRef.current) {
      window.removeEventListener('message', messageHandlerRef.current);
      messageHandlerRef.current = null;
    }
    if (realtimeChannelRef.current) {
      supabase.removeChannel(realtimeChannelRef.current);
      realtimeChannelRef.current = null;
    }
    setStep(isVerified ? 'amount' : 'identity');
    setVerificationCode("");
    setCodeSent(false);
    setQuote(null);
    setQuoteState('idle');
    setQuoteError(null);
    setPurchaseAttemptId(null);
    setCoinbaseTxId(null);
    // Reset must clear terminal status — bypass priority guard.
    txStateRef.current = 'waiting';
    setTxState('waiting');
  };

  const resetVerification = () => {
    clearStoredVerification();
    setIsVerified(false);
    setEmail("");
    setPhone("");
    setStep('identity');
    setVerificationCode("");
    setCodeSent(false);
    setQuote(null);
    setQuoteState('idle');
    setQuoteError(null);
    setPurchaseAttemptId(null);
    setCoinbaseTxId(null);
    txStateRef.current = 'waiting';
    setTxState('waiting');
  };

  // Amount validation
  const numAmount = parseFloat(amount);
  const amountValid = !isNaN(numAmount) && numAmount >= MIN_AMOUNT && numAmount <= MAX_AMOUNT;
  const amountTooLow = amount !== '' && !isNaN(numAmount) && numAmount < MIN_AMOUNT;
  const amountTooHigh = amount !== '' && !isNaN(numAmount) && numAmount > MAX_AMOUNT;

  return (
    <div className="space-y-6 animate-fade-in">
      {!hideHeader && (
      <div className="text-center space-y-2">
        <h1 className="text-lg md:text-2xl font-bold tracking-tight">
          Buy USDC with debit or Apple Pay
        </h1>
        <p className="text-xs md:text-sm text-muted-foreground">
          Up to $500 per week - no Coinbase account required.
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

      {isConnected && (
      <div className="bg-card border border-border rounded-xl p-6 space-y-6">
        {/* Step: Identity */}
        {step === 'identity' && (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <h2 className="text-lg md:text-xl font-semibold">Get Started</h2>
              <p className="text-xs md:text-sm text-muted-foreground">
                We'll send a one-time verification code to confirm your purchase.
              </p>
            </div>

            <div className="flex gap-2" data-tutorial="verification-method">
              <Button
                variant={verifyChannel === 'sms' ? 'default' : 'outline'}
                className="flex-1"
                onClick={() => setVerifyChannel('sms')}
              >
                <Phone className="mr-2 h-4 w-4" />
                Phone (SMS)
              </Button>
              <Button
                variant={verifyChannel === 'email' ? 'default' : 'outline'}
                className="flex-1"
                onClick={() => setVerifyChannel('email')}
              >
                <Mail className="mr-2 h-4 w-4" />
                Email
              </Button>
            </div>

            {verifyChannel === 'email' ? (
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <p className="text-[10px] text-muted-foreground/70">
                  Used only to send your verification code. No marketing messages.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="phone">Mobile Phone Number</Label>
                <div className="flex">
                  <div className="flex items-center justify-center px-3 bg-muted border border-r-0 border-input rounded-l-md text-sm text-muted-foreground">
                    +1
                  </div>
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="4155551234"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    className="rounded-l-none"
                    maxLength={10}
                  />
                </div>
                <p className="text-[10px] text-muted-foreground/70">
                  Used only to send your verification code. No marketing messages.
                </p>
              </div>
            )}

            {showNetworkMismatch && (
              <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg space-y-2">
                <p className="text-xs text-destructive font-medium">Wrong wallet type connected</p>
                <p className="text-[10px] text-muted-foreground">
                  Your connected wallet ({address?.slice(0, 8)}...) is not compatible with {defaultNetwork}.
                  Please enter a valid {defaultNetwork === 'solana' ? 'Solana' : 'EVM'} wallet address below.
                </p>
              </div>
            )}

            <div className="space-y-2" data-tutorial="wallet-input">
              <Label htmlFor="wallet">Wallet address to receive USDC</Label>
              {isConnected && address && connectedAddressValid ? (
                <>
                  <div className="p-3 bg-muted/50 rounded-lg border border-border">
                    <p className="font-mono text-sm truncate">{address}</p>
                  </div>
                  <p className="text-[10px] text-muted-foreground/70">Connected wallet detected</p>
                </>
              ) : showNetworkMismatch ? (
                <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg">
                  <p className="text-xs text-destructive font-medium">Wrong wallet type connected</p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Your connected wallet is not compatible with {defaultNetwork}.
                    Please sign in with a {defaultNetwork === 'solana' ? 'Solana' : 'EVM'} wallet.
                  </p>
                </div>
              ) : (
                <>
                  <Input
                    id="wallet"
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

            <AuthGatedButton
              onClick={sendVerificationCode}
              size="lg"
              className="w-full"
              disabled={isSendingCode || !identityValue || !destinationAddress}
              data-tutorial="send-verification"
            >
              {isSendingCode ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Sending Code...</>
              ) : (
                <>Continue<ArrowRight className="ml-2 h-4 w-4" /></>
              )}
            </AuthGatedButton>

            <p className="text-[10px] text-muted-foreground text-center">
              Powered by trusted third-party providers. EZOnRamp never stores your payment details.
            </p>
          </div>
        )}

        {/* Step: Verify */}
        {step === 'verify' && (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <h2 className="text-xl font-semibold">Enter Verification Code</h2>
              <p className="text-sm text-muted-foreground">
                We sent a code to {verifyChannel === 'email' ? email : phone}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="code">Verification Code</Label>
              <Input
                id="code"
                type="text"
                placeholder="Enter 6-digit code"
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
                className="text-center text-2xl tracking-widest"
                maxLength={8}
              />
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep('identity')} className="flex-1">
                <ArrowLeft className="mr-2 h-4 w-4" />Back
              </Button>
              <Button onClick={verifyCode} className="flex-1" disabled={isVerifying || verificationCode.length < 4}>
                {isVerifying ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Verifying...</>
                ) : (
                  <>Verify<Check className="ml-2 h-4 w-4" /></>
                )}
              </Button>
            </div>

            <Button variant="ghost" onClick={sendVerificationCode} disabled={isSendingCode} className="w-full">
              <RefreshCw className={`mr-2 h-4 w-4 ${isSendingCode ? 'animate-spin' : ''}`} />
              Resend Code
            </Button>
          </div>
        )}

        {/* Step: Amount - single-page purchase experience */}
        {step === 'amount' && (
          <div className="space-y-5">
            {/* Verified badge */}
            <div className="text-center space-y-2">
              <div className="inline-flex items-center gap-2 text-primary mb-1">
                <ShieldCheck className="h-5 w-5" />
                <span className="text-sm font-medium">
                  {hasStoredVerification
                    ? `Verified (${getDaysRemaining()} days remaining)`
                    : 'Identity Verified'
                  }
                </span>
              </div>
              {hasStoredVerification && storedVerification && (
                <p className="text-xs text-muted-foreground">
                  {storedVerification.channel === 'email' ? 'Email' : 'Phone'}: {storedVerification.displayHint}
                  <Button variant="link" size="sm" className="text-xs p-0 h-auto ml-2" onClick={resetVerification}>
                    Change
                  </Button>
                </p>
              )}
              <h2 className="text-base font-semibold text-muted-foreground">How much do you want to buy?</h2>
            </div>

            {/* Amount input */}
            <div className="space-y-2">
              <Label htmlFor="amount">Amount (USD)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xl text-muted-foreground font-medium">$</span>
                <Input
                  id="amount"
                  type="number"
                  placeholder="100"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  min={MIN_AMOUNT}
                  max={MAX_AMOUNT}
                  className="text-2xl pl-8"
                />
              </div>
              {amountTooLow && (
                <p className="text-xs text-destructive">Minimum purchase amount is ${MIN_AMOUNT}</p>
              )}
              {amountTooHigh && (
                <p className="text-xs text-destructive">Maximum purchase amount is ${MAX_AMOUNT}</p>
              )}
            </div>

            {/* Preset amounts */}
            <div className="grid grid-cols-4 gap-2">
              {presetAmounts.map((preset) => (
                <Button
                  key={preset}
                  variant={amount === preset ? 'default' : 'outline'}
                  onClick={() => setAmount(preset)}
                  size="sm"
                >
                  ${preset}
                </Button>
              ))}
            </div>

            {/* Inline quote summary */}
            <div className="rounded-lg border border-border overflow-hidden">
              {quoteState === 'idle' && (
                <div className="p-4 text-center">
                  <p className="text-sm text-muted-foreground">Enter an amount to see estimated fees</p>
                </div>
              )}

              {quoteState === 'loading' && (
                <div className="p-4 space-y-3">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-5 w-1/2 ml-auto" />
                </div>
              )}

              {quoteState === 'error' && (
                <div className="p-4 flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm text-destructive font-medium">Unable to load quote</p>
                    <p className="text-xs text-muted-foreground mt-1">{quoteError || 'Please try again.'}</p>
                    <Button variant="link" size="sm" className="text-xs p-0 h-auto mt-1" onClick={() => fetchQuote(amount)}>
                      Retry
                    </Button>
                  </div>
                </div>
              )}

              {quoteState === 'ready' && quote && (
                <div className="p-4 space-y-2.5">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">You pay</span>
                    <span className="font-medium">${amount} USD</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Coinbase fee</span>
                    <span className="font-medium">${quote.fee}</span>
                  </div>
                  {parseFloat(quote.networkFee) > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Network fee</span>
                      <span className="font-medium">${quote.networkFee}</span>
                    </div>
                  )}
                  <div className="border-t border-border pt-2.5 flex justify-between">
                    <span className="text-sm text-muted-foreground">Est. {defaultAsset} received</span>
                    <span className="font-bold text-base">
                      {quote.purchaseAmount} {defaultAsset}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground/70 pt-1">
                    Final fees and received amount may vary slightly before payment is completed.
                  </p>
                </div>
              )}
            </div>

            {/* Destination preview */}
            {destinationAddress && isValidDestinationAddress && (
              <div className="p-3 bg-muted/30 rounded-lg">
                <p className="text-xs text-muted-foreground mb-1">Destination</p>
                <p className="font-mono text-sm truncate">{destinationAddress}</p>
              </div>
            )}

            {/* CTA */}
            <div className="flex gap-2">
              {!hasStoredVerification && (
                <Button variant="outline" onClick={() => setStep('identity')} className="flex-1">
                  <ArrowLeft className="mr-2 h-4 w-4" />Back
                </Button>
              )}
              <AuthGatedButton
                onClick={continueToPurchase}
                size="lg"
                className="flex-1"
                disabled={
                  isLoadingBuy ||
                  !amountValid ||
                  quoteState !== 'ready' ||
                  !destinationAddress ||
                  !isValidDestinationAddress
                }
              >
                {isLoadingBuy ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Preparing...</>
                ) : (
                  <>Continue<ArrowRight className="ml-2 h-4 w-4" /></>
                )}
              </AuthGatedButton>
            </div>
          </div>
        )}

        {/* Step: Result - event-driven transaction states */}
        {step === 'result' && (
          <div className="py-8 text-center space-y-6">
            {txState === 'waiting' && (
              <>
                <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary" />
                <div className="space-y-2">
                  <h2 className="text-xl font-semibold">Complete Your Purchase</h2>
                  <p className="text-muted-foreground">Please complete your payment in the Coinbase window.</p>
                </div>
              </>
            )}

            {txState === 'incomplete' && (
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

            {(txState === 'initialized' || txState === 'processing') && (
              <>
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-xl font-semibold">Purchase Initiated!</h2>
                  <p className="text-lg font-medium">
                    Transaction Status: {txState === 'initialized' ? 'Initialized' : 'Processing'}
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

            {txState === 'completed' && (
              <>
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10">
                  <Check className="h-8 w-8 text-primary" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-xl font-semibold">Purchase Initiated!</h2>
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

            {txState === 'failed' && (
              <>
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-destructive/10">
                  <X className="h-8 w-8 text-destructive" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-xl font-semibold">Purchase Initiated!</h2>
                  <p className="text-lg font-medium text-destructive">Transaction Status: Failed</p>
                </div>
                <Button onClick={resetFlow} className="w-full">Try Again</Button>
              </>
            )}

            {txState === 'delayed' && (
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
        )}
      </div>
      )}
    </div>
  );
}
