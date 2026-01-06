import { useState, useEffect, useCallback } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Loader2, Mail, Phone, ArrowRight, ArrowLeft, Check, RefreshCw, ShieldCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAccount } from "@particle-network/connectkit";
import { supabase } from "@/integrations/supabase/client";
import { z } from "zod";

const emailSchema = z.string().trim().email("Invalid email address").max(255);
const phoneSchema = z.string().trim().regex(/^\+[1-9]\d{6,14}$/, "Use E.164 format (e.g., +14155551234)");
const codeSchema = z.string().trim().regex(/^\d{4,8}$/, "Enter a valid verification code");

type Step = 'identity' | 'verify' | 'amount' | 'confirm' | 'processing' | 'complete';
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

  // Check for existing verification on mount
  const storedVerification = getStoredVerification();
  const hasStoredVerification = !!storedVerification;

  // Step state - skip to 'amount' if already verified
  const [step, setStep] = useState<Step>(hasStoredVerification ? 'amount' : 'identity');

  // Identity state - prefill from stored verification
  const [verifyChannel, setVerifyChannel] = useState<VerifyChannel>(
    storedVerification?.channel || 'email'
  );
  const [email, setEmail] = useState(
    storedVerification?.channel === 'email' ? storedVerification.value : ""
  );
  const [phone, setPhone] = useState(
    storedVerification?.channel === 'sms' ? storedVerification.value : ""
  );
  const [manualAddress, setManualAddress] = useState("");

  // Verification state
  const [verificationCode, setVerificationCode] = useState("");
  const [isVerified, setIsVerified] = useState(hasStoredVerification);
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [codeSent, setCodeSent] = useState(false);

  // Quote state
  const [amount, setAmount] = useState("100");
  const [quote, setQuote] = useState<{
    purchaseAmount: string;
    fee: string;
    total: string;
    quoteId: string;
    buyUrl: string | null;
  } | null>(null);
  const [isLoadingQuote, setIsLoadingQuote] = useState(false);

  // Transaction state
  const [isProcessing, setIsProcessing] = useState(false);
  const [transactionId, setTransactionId] = useState<string | null>(null);
  const [transactionStatus, setTransactionStatus] = useState<string | null>(null);

  const destinationAddress = isConnected && address ? address : manualAddress;
  const identityValue = verifyChannel === 'email' ? email : phone;

  // Calculate days remaining on verification
  const getDaysRemaining = useCallback(() => {
    if (!storedVerification) return 0;
    const elapsed = Date.now() - storedVerification.verifiedAt;
    const remaining = VERIFICATION_VALIDITY_MS - elapsed;
    return Math.max(0, Math.ceil(remaining / (24 * 60 * 60 * 1000)));
  }, [storedVerification]);

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

  // Get quote and generate buy URL
  const getQuote = async () => {
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

    setIsLoadingQuote(true);
    try {
      // Use generateBuyUrl action which includes destination_address to get one-click-buy URL
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

  // Redirect to Coinbase payment page
  const executeBuy = async () => {
    if (!quote?.buyUrl) {
      toast({
        title: "Error",
        description: "No payment URL available. Please try getting a new quote.",
        variant: "destructive",
      });
      return;
    }

    // Open Coinbase payment page in a new window
    const paymentWindow = window.open(quote.buyUrl, '_blank', 'width=500,height=700');
    
    if (paymentWindow) {
      setStep('processing');
      toast({
        title: "Complete Payment",
        description: "Complete your card payment in the Coinbase window",
      });
      
      // Monitor for window close
      const checkWindow = setInterval(() => {
        if (paymentWindow.closed) {
          clearInterval(checkWindow);
          setStep('complete');
          setTransactionStatus('pending');
          toast({
            title: "Payment Window Closed",
            description: "Check your wallet for the transaction status",
          });
        }
      }, 1000);
    } else {
      // If popup blocked, redirect in same window
      window.location.href = quote.buyUrl;
    }
  };

  // Reset flow (keeps verification)
  const resetFlow = () => {
    setStep(isVerified ? 'amount' : 'identity');
    setVerificationCode("");
    setCodeSent(false);
    setQuote(null);
    setTransactionId(null);
    setTransactionStatus(null);
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
    setTransactionId(null);
    setTransactionStatus(null);
  };

  // Step indicators - adjust based on verification status
  const steps = isVerified && hasStoredVerification 
    ? ['amount', 'confirm', 'complete'] 
    : ['identity', 'verify', 'amount', 'confirm', 'complete'];
  const currentStepIndex = steps.indexOf(step === 'processing' ? 'complete' : step);

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="text-center space-y-4">
        <h1 className="text-2xl md:text-4xl font-bold tracking-tight">
          Buy {defaultAsset} with Card
        </h1>
        <p className="text-lg md:text-xl text-muted-foreground">
          Headless checkout with identity verification
        </p>
      </div>

      {/* Progress indicator */}
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

      <div className="bg-card border border-border rounded-xl p-6 space-y-6">
        {/* Step: Identity */}
        {step === 'identity' && (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <h2 className="text-xl font-semibold">Verify Your Identity</h2>
              <p className="text-sm text-muted-foreground">
                Choose how you'd like to receive your verification code
              </p>
            </div>

            {/* Channel selector */}
            <div className="flex gap-2">
              <Button
                variant={verifyChannel === 'email' ? 'default' : 'outline'}
                className="flex-1"
                onClick={() => setVerifyChannel('email')}
              >
                <Mail className="mr-2 h-4 w-4" />
                Email
              </Button>
              <Button
                variant={verifyChannel === 'sms' ? 'default' : 'outline'}
                className="flex-1"
                onClick={() => setVerifyChannel('sms')}
              >
                <Phone className="mr-2 h-4 w-4" />
                Phone
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
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number</Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="+14155551234"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Enter in E.164 format with country code
                </p>
              </div>
            )}

            {/* Wallet address */}
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

            <Button
              onClick={sendVerificationCode}
              size="lg"
              className="w-full"
              disabled={
                isSendingCode || 
                !identityValue || 
                (!isConnected && !manualAddress)
              }
            >
              {isSendingCode ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending Code...
                </>
              ) : (
                <>
                  Send Verification Code
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
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
              <Button
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
              </Button>
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
                disabled={isProcessing}
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    Confirm Purchase
                    <Check className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Step: Processing */}
        {step === 'processing' && (
          <div className="py-12 text-center space-y-4">
            <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary" />
            <h2 className="text-xl font-semibold">Processing Your Purchase</h2>
            <p className="text-muted-foreground">Please wait while we process your transaction...</p>
          </div>
        )}

        {/* Step: Complete */}
        {step === 'complete' && (
          <div className="py-8 text-center space-y-6">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-500/10">
              <Check className="h-8 w-8 text-green-500" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-semibold">Purchase Initiated!</h2>
              <p className="text-muted-foreground">
                Your {defaultAsset} purchase is being processed
              </p>
            </div>

            {transactionId && (
              <div className="p-3 bg-muted/50 rounded-lg">
                <p className="text-xs text-muted-foreground mb-1">Transaction ID</p>
                <p className="font-mono text-sm truncate">{transactionId}</p>
              </div>
            )}

            <Button onClick={resetFlow} variant="outline" className="w-full">
              Make Another Purchase
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
