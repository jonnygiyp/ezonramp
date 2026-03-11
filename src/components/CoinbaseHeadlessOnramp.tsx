import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Loader2, Mail, Phone, ArrowRight, ArrowLeft, Check, RefreshCw, ShieldCheck, X, Clock, AlertCircle } from "lucide-react";
import { Skeleton } from "./ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useAccount } from "@/hooks/useParticle";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { z } from "zod";
import { AuthGatedButton } from "./AuthGatedButton";

const emailSchema = z.string().trim().email("Invalid email address").max(255);
const phoneSchema = z.string().trim().regex(/^\d{10}$/, "Enter your 10-digit US phone number");
const codeSchema = z.string().trim().regex(/^\d{4,8}$/, "Enter a valid verification code");

type Step = 'identity' | 'verify' | 'amount' | 'result';
type TxState = 'waiting' | 'incomplete' | 'initialized' | 'processing' | 'completed' | 'failed' | 'delayed';

interface QuoteData {
  purchaseAmount: string;
  fee: string;
  networkFee: string;
  total: string;
  quoteId: string;
}

type QuoteState = 'idle' | 'loading' | 'ready' | 'error';
type VerifyChannel = 'sms' | 'email';

// Verification storage key and validity period (60 days in milliseconds)
const VERIFICATION_STORAGE_KEY = 'coinbase_onramp_verification';
const VERIFICATION_VALIDITY_MS = 60 * 24 * 60 * 60 * 1000; // 60 days

interface StoredVerification {
  channel: VerifyChannel;
  value: string; // email or phone
  verifiedAt: number; // timestamp
}

function getStoredVerification(): StoredVerification | null {
  try {
    const stored = localStorage.getItem(VERIFICATION_STORAGE_KEY);
    if (!stored) return null;
    
    const parsed: StoredVerification = JSON.parse(stored);
    const now = Date.now();
    
    // Check if verification is still valid (within 60 days)
    if (now - parsed.verifiedAt < VERIFICATION_VALIDITY_MS) {
      return parsed;
    }
    
    // Expired, remove it
    localStorage.removeItem(VERIFICATION_STORAGE_KEY);
    return null;
  } catch {
    return null;
  }
}

function storeVerification(channel: VerifyChannel, value: string): void {
  const data: StoredVerification = {
    channel,
    value,
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
}

export function CoinbaseHeadlessOnramp({
  defaultAsset = "USDC",
  defaultNetwork = "solana",
}: CoinbaseHeadlessOnrampProps) {
  const { toast } = useToast();
  const { address, isConnected } = useAccount();
  const { session } = useAuth();

  // Check for existing verification on mount
  const storedVerification = getStoredVerification();
  const hasStoredVerification = !!storedVerification;

  // Step state - skip to 'amount' if already verified
  const [step, setStep] = useState<Step>(hasStoredVerification ? 'amount' : 'identity');

  // Identity state - prefill from stored verification
  const [verifyChannel, setVerifyChannel] = useState<VerifyChannel>(
    storedVerification?.channel || 'sms'
  );
  const [email, setEmail] = useState(
    storedVerification?.channel === 'email' ? storedVerification.value : ""
  );
  const [phone, setPhone] = useState(
    storedVerification?.channel === 'sms' ? storedVerification.value.replace(/^\+1/, '') : ""
  );
  const [manualAddress, setManualAddress] = useState("");

  // Verification state
  const [verificationCode, setVerificationCode] = useState("");
  const [isVerified, setIsVerified] = useState(hasStoredVerification);
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [codeSent, setCodeSent] = useState(false);

  // Quote state - inline auto-refresh
  const [amount, setAmount] = useState("100");
  const [quote, setQuote] = useState<QuoteData | null>(null);
  const [quoteState, setQuoteState] = useState<QuoteState>('idle');
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [isLoadingBuy, setIsLoadingBuy] = useState(false);
  const quoteDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Transaction state - event-driven
  const [txState, setTxState] = useState<TxState>('waiting');
  const [purchaseAttemptId, setPurchaseAttemptId] = useState<string | null>(null);
  const [coinbaseTxId, setCoinbaseTxId] = useState<string | null>(null);
  const txStateRef = useRef<TxState>('waiting');
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messageHandlerRef = useRef<((e: MessageEvent) => void) | null>(null);
  const windowCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Validate that connected wallet address matches the target network
  const isEvmAddress = (addr: string) => /^0x[a-fA-F0-9]{40}$/.test(addr);
  const isSolanaAddress = (addr: string) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr);
  
  const connectedAddressValid = isConnected && address && (
    defaultNetwork === 'solana' ? isSolanaAddress(address) : isEvmAddress(address)
  );
  
  // Use connected address only if it matches the target network, otherwise require manual input
  const destinationAddress = connectedAddressValid ? address : manualAddress;
  const identityValue = verifyChannel === 'email' ? email : `+1${phone}`;
  
  // Show warning if connected to wrong network type
  const showNetworkMismatch = isConnected && address && !connectedAddressValid;

  // Calculate days remaining on verification
  const getDaysRemaining = useCallback(() => {
    if (!storedVerification) return 0;
    const elapsed = Date.now() - storedVerification.verifiedAt;
    const remaining = VERIFICATION_VALIDITY_MS - elapsed;
    return Math.max(0, Math.ceil(remaining / (24 * 60 * 60 * 1000)));
  }, [storedVerification]);

  // Stop polling and cleanup timers
  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (windowCheckRef.current) {
      clearInterval(windowCheckRef.current);
      windowCheckRef.current = null;
    }
  }, []);

  // Update tx state helper
  const updateTxState = useCallback((state: TxState) => {
    txStateRef.current = state;
    setTxState(state);
    if (['completed', 'failed', 'delayed', 'incomplete'].includes(state)) {
      stopPolling();
    }
  }, [stopPolling]);

  // Start polling for transaction status
  const startPolling = useCallback((attemptId: string) => {
    if (pollingRef.current) return;
    
    pollingRef.current = setInterval(async () => {
      try {
        const { data, error } = await supabase.functions.invoke('coinbase-headless', {
          body: {
            action: 'pollTransactionStatus',
            partnerUserRef: attemptId,
          },
        });
        
        if (error) {
          console.error('[COINBASE-POLL] Error:', error);
          return;
        }
        
        if (data?.status) {
          const current = txStateRef.current;
          if (['completed', 'failed', 'delayed'].includes(current)) return;
          if (data.status !== current) {
            updateTxState(data.status as TxState);
          }
        }
      } catch (err) {
        console.error('[COINBASE-POLL] Error:', err);
      }
    }, 10000);

    // 30-minute timeout
    timeoutRef.current = setTimeout(() => {
      const current = txStateRef.current;
      if (current === 'initialized' || current === 'processing') {
        updateTxState('delayed');
        // Update DB
        (supabase as any).from('purchase_attempts')
          .update({ status: 'delayed' })
          .eq('partner_user_ref', attemptId);
      }
    }, 30 * 60 * 1000);
  }, [updateTxState]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopPolling();
      if (messageHandlerRef.current) {
        window.removeEventListener('message', messageHandlerRef.current);
      }
    };
  }, [stopPolling]);

  // Send verification code
  const sendVerificationCode = async () => {
    const validation = verifyChannel === 'email' 
      ? emailSchema.safeParse(email)
      : phoneSchema.safeParse(phone);

    if (!validation.success) {
      toast({
        title: "Invalid Input",
        description: validation.error.errors[0]?.message,
        variant: "destructive",
      });
      return;
    }

    setIsSendingCode(true);
    try {
      const { data, error } = await supabase.functions.invoke("twilio-verify", {
        body: {
          action: 'send',
          channel: verifyChannel,
          to: identityValue,
        },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Failed to send code');

      setCodeSent(true);
      setStep('verify');
      toast({
        title: "Code Sent",
        description: `Verification code sent to ${verifyChannel === 'email' ? 'your email' : 'your phone'}`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to send verification code';
      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsSendingCode(false);
    }
  };

  // Verify code
  const verifyCode = async () => {
    const validation = codeSchema.safeParse(verificationCode);
    if (!validation.success) {
      toast({
        title: "Invalid Code",
        description: validation.error.errors[0]?.message,
        variant: "destructive",
      });
      return;
    }

    setIsVerifying(true);
    try {
      const { data, error } = await supabase.functions.invoke("twilio-verify", {
        body: {
          action: 'check',
          channel: verifyChannel,
          to: identityValue,
          code: verificationCode,
        },
      });

      if (error) throw error;
      if (!data?.verified) {
        throw new Error('Invalid verification code');
      }

      // Store verification for 60 days
      storeVerification(verifyChannel, identityValue);
      
      setIsVerified(true);
      setStep('amount');
      toast({
        title: "Verified",
        description: "Your identity has been verified for 60 days",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to verify code';
      toast({
        title: "Verification Failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsVerifying(false);
    }
  };

  // Validate destination address matches the target network
  const isValidDestinationAddress = destinationAddress && (
    defaultNetwork === 'solana' ? isSolanaAddress(destinationAddress) : isEvmAddress(destinationAddress)
  );

  // Get quote and generate buy URL
  const getQuote = async () => {
    if (!session) {
      toast({
        title: "Authentication Required",
        description: "Please sign in to use Coinbase onramp",
        variant: "destructive",
      });
      return;
    }

    if (!amount || parseFloat(amount) < 1) {
      toast({
        title: "Invalid Amount",
        description: "Please enter an amount of at least $1",
        variant: "destructive",
      });
      return;
    }

    if (!destinationAddress) {
      toast({
        title: "Missing Wallet",
        description: "Please connect your wallet or enter an address",
        variant: "destructive",
      });
      return;
    }

    if (!isValidDestinationAddress) {
      toast({
        title: "Invalid Address",
        description: defaultNetwork === 'solana' 
          ? "Please enter a valid Solana wallet address (32-44 characters)" 
          : "Please enter a valid EVM wallet address (starts with 0x)",
        variant: "destructive",
      });
      return;
    }

    setIsLoadingQuote(true);
    try {
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
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const quoteData = data.quote || data;
      setQuote({
        purchaseAmount: quoteData.purchase_amount?.value || amount,
        fee: quoteData.coinbase_fee?.value || '0',
        total: quoteData.payment_total?.value || amount,
        quoteId: quoteData.quote_id || '',
        buyUrl: data.buyUrl || null,
      });
      setStep('confirm');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to get quote';
      toast({
        title: "Quote Error",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsLoadingQuote(false);
    }
  };

  // Execute buy - event-driven approach
  const executeBuy = async () => {
    if (!quote?.buyUrl || !session) {
      toast({
        title: "Error",
        description: "No payment URL available. Please try getting a new quote.",
        variant: "destructive",
      });
      return;
    }

    // Generate unique purchase attempt ID
    const attemptId = crypto.randomUUID();
    setPurchaseAttemptId(attemptId);
    updateTxState('waiting');
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
      });
    } catch (err) {
      console.error('[COINBASE] Failed to create purchase attempt:', err);
    }

    // Add partnerUserId to buy URL for tracking
    const url = new URL(quote.buyUrl);
    url.searchParams.set('partnerUserId', attemptId);

    const paymentWindow = window.open(url.toString(), '_blank', 'width=500,height=700');
    
    if (!paymentWindow) {
      // If popup blocked, redirect in same window
      window.location.href = url.toString();
      return;
    }

    toast({
      title: "Complete Payment",
      description: "Complete your card payment in the Coinbase window",
    });

    // Listen for postMessage events from Coinbase
    const handleMessage = (event: MessageEvent) => {
      // Only accept messages from Coinbase origins
      if (!event.origin.includes('coinbase.com')) return;
      
      const data = event.data;
      if (!data || typeof data !== 'object') return;
      
      const eventName = data.eventName || data.event || data.type;
      console.log('[COINBASE-EVENT]', eventName, data);

      switch (eventName) {
        case 'onramp_api.commit_success': {
          updateTxState('initialized');
          const txId = data.transactionId || data.data?.transactionId || data.orderId;
          if (txId) setCoinbaseTxId(txId);
          startPolling(attemptId);
          // Update purchase attempt in DB
          (supabase as any).from('purchase_attempts')
            .update({ 
              status: 'initialized', 
              coinbase_transaction_id: txId || null 
            })
            .eq('partner_user_ref', attemptId);
          break;
        }
        case 'onramp_api.cancel':
          updateTxState('incomplete');
          (supabase as any).from('purchase_attempts')
            .update({ status: 'incomplete' })
            .eq('partner_user_ref', attemptId);
          break;
        case 'onramp_api.polling_success':
          updateTxState('completed');
          (supabase as any).from('purchase_attempts')
            .update({ status: 'completed' })
            .eq('partner_user_ref', attemptId);
          break;
        case 'onramp_api.polling_error':
          updateTxState('failed');
          (supabase as any).from('purchase_attempts')
            .update({ status: 'failed' })
            .eq('partner_user_ref', attemptId);
          break;
      }
    };

    messageHandlerRef.current = handleMessage;
    window.addEventListener('message', handleMessage);

    // Monitor for window close - only mark incomplete if no events received
    windowCheckRef.current = setInterval(() => {
      if (paymentWindow.closed) {
        if (windowCheckRef.current) clearInterval(windowCheckRef.current);
        windowCheckRef.current = null;
        
        // Give events/webhooks a moment to arrive
        setTimeout(async () => {
          const current = txStateRef.current;
          if (current === 'waiting') {
            // No events received - user closed without completing
            updateTxState('incomplete');
            try {
              await (supabase as any).from('purchase_attempts')
                .update({ status: 'incomplete' })
                .eq('partner_user_ref', attemptId);
            } catch {}
          }
        }, 3000);
      }
    }, 1000);
  };

  // Reset flow (keeps verification)
  const resetFlow = () => {
    stopPolling();
    if (messageHandlerRef.current) {
      window.removeEventListener('message', messageHandlerRef.current);
      messageHandlerRef.current = null;
    }
    setStep(isVerified ? 'amount' : 'identity');
    setVerificationCode("");
    setCodeSent(false);
    setQuote(null);
    setPurchaseAttemptId(null);
    setCoinbaseTxId(null);
    updateTxState('waiting');
  };

  // Full reset including verification
  const resetVerification = () => {
    clearStoredVerification();
    setIsVerified(false);
    setEmail("");
    setPhone("");
    setStep('identity');
    setVerificationCode("");
    setCodeSent(false);
    setQuote(null);
    setPurchaseAttemptId(null);
    setCoinbaseTxId(null);
    updateTxState('waiting');
  };

  // Step indicators - adjust based on verification status
  const steps = isVerified && hasStoredVerification 
    ? ['amount', 'confirm', 'result'] 
    : ['identity', 'verify', 'amount', 'confirm', 'result'];
  const currentStepIndex = steps.indexOf(step);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="text-center space-y-2">
        <h1 className="text-lg md:text-2xl font-bold tracking-tight">
          Buy {defaultAsset} instantly with debit or Apple Pay
        </h1>
        <p className="text-xs md:text-sm text-muted-foreground">
          US users can purchase up to $500 per week - no Coinbase account required.
        </p>
      </div>

      {/* Progress indicator */}
      <div className="flex flex-col items-center gap-1" role="progressbar" aria-valuenow={currentStepIndex + 1} aria-valuemin={1} aria-valuemax={steps.length}>
        <div className="flex justify-center gap-2">
          {steps.map((s, i) => (
            <div
              key={s}
              className={`h-2 w-8 rounded-full transition-colors ${
                i <= currentStepIndex ? 'bg-primary' : 'bg-muted'
              }`}
            />
          ))}
        </div>
        <span className="text-[10px] text-muted-foreground/70">
          {step === 'result' ? 'Done!' : `Step ${currentStepIndex + 1} of ${steps.length - 1}`}
        </span>
      </div>

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

            {/* Channel selector */}
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

            {/* Input fields */}
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

            {/* Network mismatch warning */}
            {showNetworkMismatch && (
              <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg space-y-2">
                <p className="text-xs text-destructive font-medium">
                  Wrong wallet type connected
                </p>
                <p className="text-[10px] text-muted-foreground">
                  Your connected wallet ({address?.slice(0, 8)}...) is not compatible with {defaultNetwork}. 
                  Please enter a valid {defaultNetwork === 'solana' ? 'Solana' : 'EVM'} wallet address below.
                </p>
              </div>
            )}

            {/* Wallet address display */}
            <div className="space-y-2" data-tutorial="wallet-input">
              <Label htmlFor="wallet">
                {defaultNetwork === 'solana' ? 'Solana' : 'EVM'} wallet address to receive {defaultAsset}
              </Label>
              {isConnected && address && connectedAddressValid ? (
                <>
                  <div className="p-3 bg-muted/50 rounded-lg border border-border">
                    <p className="font-mono text-sm truncate">{address}</p>
                  </div>
                  <p className="text-[10px] text-muted-foreground/70">
                    Connected wallet detected
                  </p>
                </>
              ) : showNetworkMismatch ? (
                <>
                  <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg">
                    <p className="text-xs text-destructive font-medium">
                      Wrong wallet type connected
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Your connected wallet is not compatible with {defaultNetwork}. 
                      Please sign in with a {defaultNetwork === 'solana' ? 'Solana' : 'EVM'} wallet.
                    </p>
                  </div>
                </>
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
              disabled={
                isSendingCode || 
                !identityValue || 
                !destinationAddress
              }
              data-tutorial="send-verification"
            >
              {isSendingCode ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending Code...
                </>
              ) : (
                <>
                  Continue securely
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
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
              <Button
                variant="outline"
                onClick={() => setStep('identity')}
                className="flex-1"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <Button
                onClick={verifyCode}
                className="flex-1"
                disabled={isVerifying || verificationCode.length < 4}
              >
                {isVerifying ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  <>
                    Verify
                    <Check className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </div>

            <Button
              variant="ghost"
              onClick={sendVerificationCode}
              disabled={isSendingCode}
              className="w-full"
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${isSendingCode ? 'animate-spin' : ''}`} />
              Resend Code
            </Button>
          </div>
        )}

        {/* Step: Amount */}
        {step === 'amount' && (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <div className="inline-flex items-center gap-2 text-green-500 mb-2">
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
                  {storedVerification.channel === 'email' ? 'Email' : 'Phone'}: {storedVerification.value}
                  <Button 
                    variant="link" 
                    size="sm" 
                    className="text-xs p-0 h-auto ml-2"
                    onClick={resetVerification}
                  >
                    Change
                  </Button>
                </p>
              )}
              <h2 className="text-xl font-semibold">How much do you want to buy?</h2>
            </div>

            <div className="space-y-2">
              <Label htmlFor="amount">Amount (USD)</Label>
              <Input
                id="amount"
                type="number"
                placeholder="100"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                min="1"
                max="10000"
                className="text-2xl"
              />
            </div>

            <div className="grid grid-cols-4 gap-2">
              {['50', '100', '250', '500'].map((preset) => (
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

            <div className="flex gap-2">
              {!hasStoredVerification && (
                <Button
                  variant="outline"
                  onClick={() => setStep('identity')}
                  className="flex-1"
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back
                </Button>
              )}
              <AuthGatedButton
                onClick={getQuote}
                className="flex-1"
                disabled={isLoadingQuote || !amount || parseFloat(amount) < 1}
              >
                {isLoadingQuote ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Getting Quote...
                  </>
                ) : (
                  <>
                    Get Quote
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </AuthGatedButton>
            </div>
          </div>
        )}

        {/* Step: Confirm */}
        {step === 'confirm' && quote && (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <h2 className="text-xl font-semibold">Confirm Your Purchase</h2>
            </div>

            <div className="space-y-3 p-4 bg-muted/50 rounded-lg">
              <div className="flex justify-between">
                <span className="text-muted-foreground">You Pay</span>
                <span className="font-medium">${amount} USD</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Fee</span>
                <span className="font-medium">${quote.fee}</span>
              </div>
              <div className="border-t border-border pt-3 flex justify-between">
                <span className="text-muted-foreground">You Receive</span>
                <span className="font-bold text-lg">
                  {quote.purchaseAmount} {defaultAsset}
                </span>
              </div>
            </div>

            <div className="p-3 bg-muted/30 rounded-lg">
              <p className="text-xs text-muted-foreground mb-1">Destination</p>
              <p className="font-mono text-sm truncate">{destinationAddress}</p>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setStep('amount')}
                className="flex-1"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <Button
                onClick={executeBuy}
                className="flex-1"
              >
                Confirm Purchase
                <Check className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Step: Result - event-driven transaction states */}
        {step === 'result' && (
          <div className="py-8 text-center space-y-6">
            {/* Waiting: popup open, no events yet */}
            {txState === 'waiting' && (
              <>
                <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary" />
                <div className="space-y-2">
                  <h2 className="text-xl font-semibold">Complete Your Purchase</h2>
                  <p className="text-muted-foreground">
                    Please complete your payment in the Coinbase window.
                  </p>
                </div>
              </>
            )}

            {/* Incomplete: user cancelled or exited */}
            {txState === 'incomplete' && (
              <>
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-destructive/10">
                  <X className="h-8 w-8 text-destructive" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-xl font-semibold">Incomplete Transaction!</h2>
                  <p className="text-muted-foreground">
                    You exited the process before completing your purchase.
                  </p>
                </div>
                <Button onClick={resetFlow} className="w-full">
                  Try Again
                </Button>
              </>
            )}

            {/* Initialized or Processing: transaction in progress */}
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
                <p className="text-xs text-muted-foreground">
                  Status will automatically update every 10 seconds.
                </p>
              </>
            )}

            {/* Completed: transaction successful */}
            {txState === 'completed' && (
              <>
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-500/10">
                  <Check className="h-8 w-8 text-green-500" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-xl font-semibold">Purchase Initiated!</h2>
                  <p className="text-lg font-medium text-green-500">
                    Transaction Status: Completed
                  </p>
                </div>
                {coinbaseTxId && (
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="text-xs text-muted-foreground mb-1">Transaction ID</p>
                    <p className="font-mono text-sm truncate">{coinbaseTxId}</p>
                  </div>
                )}
                <Button onClick={resetFlow} variant="outline" className="w-full">
                  Make Another Purchase
                </Button>
              </>
            )}

            {/* Failed: transaction failed */}
            {txState === 'failed' && (
              <>
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-destructive/10">
                  <X className="h-8 w-8 text-destructive" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-xl font-semibold">Purchase Initiated!</h2>
                  <p className="text-lg font-medium text-destructive">
                    Transaction Status: Failed
                  </p>
                </div>
                <Button onClick={resetFlow} className="w-full">
                  Try Again
                </Button>
              </>
            )}

            {/* Delayed: timeout reached */}
            {txState === 'delayed' && (
              <>
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-yellow-500/10">
                  <Clock className="h-8 w-8 text-yellow-500" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-xl font-semibold">Purchase Initiated!</h2>
                  <p className="text-lg font-medium text-yellow-500">
                    Transaction Status: Delayed
                  </p>
                  <p className="text-muted-foreground">
                    Your transaction is taking longer than expected. Please check again later.
                  </p>
                </div>
                <Button onClick={resetFlow} variant="outline" className="w-full">
                  Make Another Purchase
                </Button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
