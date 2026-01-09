import { useState, useEffect, useCallback, createContext, useContext, ReactNode } from "react";
import { loadStripeOnramp, type StripeOnramp as StripeOnrampType, type OnrampSession } from "@stripe/crypto";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import { useAccount } from '@particle-network/connectkit';

// CryptoElements context for StripeOnramp instance
interface CryptoElementsContextValue {
  onramp: StripeOnrampType | null;
}

const CryptoElementsContext = createContext<CryptoElementsContextValue>({ onramp: null });

interface CryptoElementsProps {
  stripeOnramp: Promise<StripeOnrampType | null>;
  children: ReactNode;
}

function CryptoElements({ stripeOnramp, children }: CryptoElementsProps) {
  const [ctx, setCtx] = useState<CryptoElementsContextValue>({ onramp: null });

  useEffect(() => {
    let mounted = true;
    stripeOnramp.then((onramp) => {
      if (mounted && onramp) {
        setCtx({ onramp });
      }
    });
    return () => { mounted = false; };
  }, [stripeOnramp]);

  return (
    <CryptoElementsContext.Provider value={ctx}>
      {children}
    </CryptoElementsContext.Provider>
  );
}

// OnrampElement component
interface OnrampElementProps {
  clientSecret: string;
  appearance?: { theme: "light" | "dark" };
  onReady?: () => void;
  onChange?: (status: string) => void;
}

function OnrampElement({ clientSecret, appearance, onReady, onChange }: OnrampElementProps) {
  const { onramp } = useContext(CryptoElementsContext);
  const [session, setSession] = useState<OnrampSession | null>(null);

  useEffect(() => {
    if (!onramp || !clientSecret) return;

    const onrampSession = onramp.createSession({
      clientSecret,
      appearance: appearance || { theme: "light" },
    });

    setSession(onrampSession);

    // Mount the session
    const container = document.getElementById("onramp-element");
    if (container) {
      onrampSession.mount("#onramp-element");
    }

    // Set up event listeners
    if (onReady) {
      onrampSession.addEventListener("onramp_ui_loaded", onReady);
    }
    if (onChange) {
      onrampSession.addEventListener("onramp_session_updated", (event) => {
        const status = event.payload?.session?.status;
        if (status) {
          onChange(status);
        }
      });
    }

    return () => {
      // Cleanup happens automatically when component unmounts
    };
  }, [onramp, clientSecret, appearance, onReady, onChange]);

  return <div id="onramp-element" className="min-h-[500px] w-full" />;
}

// Validate Solana address
const isSolanaAddress = (addr: string) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr);
const isEvmAddress = (addr: string) => /^0x[a-fA-F0-9]{40}$/.test(addr);

// Main StripeOnramp component
interface StripeOnrampComponentProps {
  defaultAsset?: string;
  defaultNetwork?: string;
}

export function StripeOnramp({ defaultAsset = "usdc", defaultNetwork = "solana" }: StripeOnrampComponentProps) {
  const { toast } = useToast();
  const { address, isConnected } = useAccount();
  
  const [stripeOnrampPromise, setStripeOnrampPromise] = useState<Promise<StripeOnrampType | null> | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [walletAddress, setWalletAddress] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showOnramp, setShowOnramp] = useState(false);
  const [sessionStatus, setSessionStatus] = useState<string | null>(null);

  // Validate wallet address matches the target network
  const connectedAddressValid = isConnected && address && (
    defaultNetwork === 'solana' ? isSolanaAddress(address) : isEvmAddress(address)
  );

  // Auto-populate wallet address from connected wallet if valid
  useEffect(() => {
    if (connectedAddressValid && address && !walletAddress) {
      setWalletAddress(address);
    }
  }, [connectedAddressValid, address, walletAddress]);

  // Initialize Stripe Onramp
  useEffect(() => {
    const initStripeOnramp = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('stripe-config');
        if (error) throw error;
        
        const { publishableKey } = data;
        if (!publishableKey) {
          throw new Error("Failed to get Stripe publishable key");
        }

        const promise = loadStripeOnramp(publishableKey);
        setStripeOnrampPromise(promise);
      } catch (error) {
        console.error("Failed to initialize Stripe Onramp:", error);
        toast({
          title: "Configuration Error",
          description: "Failed to initialize Stripe. Please try again later.",
          variant: "destructive",
        });
      }
    };

    initStripeOnramp();
  }, [toast]);

  const handleStartOnramp = useCallback(async () => {
    if (!walletAddress.trim()) {
      toast({
        title: "Wallet Required",
        description: "Please enter a wallet address",
        variant: "destructive",
      });
      return;
    }

    // Validate address format
    const isValid = defaultNetwork === 'solana' 
      ? isSolanaAddress(walletAddress.trim())
      : isEvmAddress(walletAddress.trim());
    
    if (!isValid) {
      toast({
        title: "Invalid Address",
        description: defaultNetwork === 'solana' 
          ? "Please enter a valid Solana wallet address"
          : "Please enter a valid EVM wallet address",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('stripe-onramp', {
        body: {
          walletAddress: walletAddress.trim(),
          destinationCurrency: defaultAsset.toLowerCase(),
          destinationNetwork: defaultNetwork.toLowerCase(),
        },
      });

      if (error) throw error;

      if (!data.clientSecret) {
        throw new Error("Failed to create onramp session");
      }

      setClientSecret(data.clientSecret);
      setShowOnramp(true);
    } catch (error) {
      console.error("Onramp error:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to start onramp session",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [walletAddress, defaultAsset, defaultNetwork, toast]);

  const handleSessionChange = useCallback((status: string) => {
    setSessionStatus(status);
    
    if (status === "fulfillment_complete") {
      toast({
        title: "Success!",
        description: "Your crypto purchase was successful!",
      });
      // Reset after successful purchase
      setTimeout(() => {
        setShowOnramp(false);
        setClientSecret(null);
        setSessionStatus(null);
      }, 3000);
    } else if (status === "rejected") {
      toast({
        title: "Transaction Rejected",
        description: "Your transaction could not be completed.",
        variant: "destructive",
      });
    }
  }, [toast]);

  // Show onramp widget
  if (showOnramp && clientSecret && stripeOnrampPromise) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Complete Your Purchase</h2>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setShowOnramp(false);
              setClientSecret(null);
            }}
          >
            Cancel
          </Button>
        </div>
        
        {sessionStatus && (
          <div className="text-sm text-muted-foreground">
            Status: {sessionStatus.replace(/_/g, " ")}
          </div>
        )}

        <CryptoElements stripeOnramp={stripeOnrampPromise}>
          <OnrampElement
            clientSecret={clientSecret}
            appearance={{ theme: "light" }}
            onChange={handleSessionChange}
          />
        </CryptoElements>
      </div>
    );
  }

  // Show setup form
  return (
    <div className="space-y-8 animate-fade-in">
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold tracking-tight">Buy Crypto with Stripe</h1>
        <p className="text-xl text-muted-foreground">
          Secure fiat-to-crypto purchases powered by Stripe
        </p>
      </div>

      <div className="bg-card border border-border rounded-xl p-6 space-y-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="wallet-address">
              {defaultNetwork === 'solana' ? 'Solana' : 'EVM'} Wallet Address
            </Label>
            <Input
              id="wallet-address"
              type="text"
              placeholder={defaultNetwork === 'solana' 
                ? "Enter your Solana wallet address"
                : "Enter your EVM wallet address (0x...)"}
              value={walletAddress}
              onChange={(e) => setWalletAddress(e.target.value)}
            />
            {connectedAddressValid && (
              <p className="text-xs text-muted-foreground">
                Connected wallet detected
              </p>
            )}
          </div>
        </div>

        <Button
          onClick={handleStartOnramp}
          size="lg"
          className="w-full text-lg py-6 hover-scale"
          disabled={isLoading || !walletAddress}
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Initializing...
            </>
          ) : (
            "Buy Crypto with Stripe"
          )}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-muted-foreground">
        <div className="flex flex-col items-center space-y-2">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <span className="text-2xl">🔒</span>
          </div>
          <p className="font-medium">Secure Payments</p>
        </div>
        <div className="flex flex-col items-center space-y-2">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <span className="text-2xl">⚡</span>
          </div>
          <p className="font-medium">Instant Delivery</p>
        </div>
        <div className="flex flex-col items-center space-y-2">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <span className="text-2xl">🇺🇸</span>
          </div>
          <p className="font-medium">USA Supported</p>
        </div>
      </div>
    </div>
  );
}
