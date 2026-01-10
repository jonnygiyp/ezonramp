import { useState, useCallback } from "react";
import { MoonPayProvider, MoonPayBuyWidget } from "@moonpay/moonpay-react";
import { useAccount } from "@particle-network/connectkit";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Button } from "./ui/button";
import { Loader2, Moon, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface MoonPayOnrampProps {
  defaultAsset?: string;
  defaultNetwork?: string;
}

export function MoonPayOnramp({ 
  defaultAsset = "usdc_sol", 
  defaultNetwork = "solana" 
}: MoonPayOnrampProps) {
  const { address: particleAddress, isConnected } = useAccount();
  const [walletAddress, setWalletAddress] = useState(particleAddress || "");
  const [amount, setAmount] = useState("100");
  const [showWidget, setShowWidget] = useState(false);

  // Get the publishable key from environment
  const publishableKey = import.meta.env.VITE_MOONPAY_PUBLISHABLE_KEY || "";

  // Update wallet address when particle connects
  useState(() => {
    if (particleAddress) {
      setWalletAddress(particleAddress);
    }
  });

  const handleGetSignature = useCallback(async (url: string): Promise<string> => {
    try {
      const { data, error } = await supabase.functions.invoke('moonpay-sign', {
        body: { urlForSigning: url }
      });
      
      if (error) throw error;
      return data.signature;
    } catch (error) {
      console.error('Error getting signature:', error);
      throw error;
    }
  }, []);

  const handleBuyClick = () => {
    if (!walletAddress) {
      return;
    }
    setShowWidget(true);
  };

  const getCurrencyCode = () => {
    // Map network + asset to MoonPay currency code
    if (defaultNetwork === "solana" && defaultAsset === "USDC") {
      return "usdc_sol";
    }
    if (defaultNetwork === "ethereum" && defaultAsset === "USDC") {
      return "usdc";
    }
    return defaultAsset.toLowerCase();
  };

  if (!publishableKey) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2">
            <Moon className="h-6 w-6 md:h-8 md:w-8 text-primary" />
            <h1 className="text-lg md:text-2xl font-bold tracking-tight">MoonPay</h1>
          </div>
          <p className="text-xs md:text-sm text-muted-foreground">
            Buy crypto with credit card, debit card, or bank transfer
          </p>
        </div>

        <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-6 text-center">
          <p className="text-destructive font-medium">
            MoonPay is not configured. Please add your MoonPay publishable key.
          </p>
        </div>
      </div>
    );
  }

  return (
    <MoonPayProvider apiKey={publishableKey}>
      <div className="space-y-6 animate-fade-in">
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2">
            <Moon className="h-6 w-6 md:h-8 md:w-8 text-primary" />
            <h1 className="text-lg md:text-2xl font-bold tracking-tight">MoonPay</h1>
          </div>
          <p className="text-xs md:text-sm text-muted-foreground">
            Buy crypto with credit card, debit card, or bank transfer
          </p>
        </div>

        {!showWidget ? (
          <div className="bg-card border border-border rounded-xl p-6 space-y-6">
            <div className="space-y-4">
              <div className="space-y-2" data-tutorial="moonpay-wallet-input">
                <Label htmlFor="moonpay-wallet-address">
                  {defaultNetwork === 'solana' ? 'Wallet address to receive Solana USDC' : 'Wallet Address'}
                </Label>
                <Input
                  id="moonpay-wallet-address"
                  type="text"
                  placeholder={defaultNetwork === 'solana' ? 'Enter your Solana wallet address' : 'Enter your wallet address'}
                  value={walletAddress}
                  onChange={(e) => setWalletAddress(e.target.value)}
                  readOnly={isConnected && !!particleAddress}
                  disabled={isConnected && !!particleAddress}
                  className={`font-mono text-sm ${isConnected && particleAddress ? "bg-muted cursor-not-allowed" : ""}`}
                />
                {isConnected && particleAddress && (
                  <p className="text-xs text-muted-foreground">
                    Connected wallet detected: {particleAddress.slice(0, 8)}...{particleAddress.slice(-6)}
                  </p>
                )}
              </div>

              <div className="space-y-2">
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

            <Button
              onClick={handleBuyClick}
              size="lg"
              className="w-full text-lg py-6 hover-scale"
              disabled={!walletAddress}
              data-tutorial="moonpay-buy-button"
            >
              <Moon className="mr-2 h-5 w-5" />
              Buy Crypto with MoonPay
            </Button>

            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <ExternalLink className="h-4 w-4" />
              <span>Powered by MoonPay</span>
            </div>
          </div>
        ) : (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="h-[600px]">
              <MoonPayBuyWidget
                variant="embedded"
                baseCurrencyCode="usd"
                baseCurrencyAmount={amount}
                defaultCurrencyCode={getCurrencyCode()}
                walletAddress={walletAddress}
                onUrlSignatureRequested={handleGetSignature}
                colorCode="#6366f1"
              />
            </div>
            <div className="p-4 border-t border-border">
              <Button
                variant="outline"
                onClick={() => setShowWidget(false)}
                className="w-full"
              >
                Cancel
              </Button>
            </div>
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
    </MoonPayProvider>
  );
}
