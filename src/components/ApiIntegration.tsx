import { useState, useEffect } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { ChevronLeft, ChevronRight, CreditCard, Wallet, Zap, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { CoinflowCheckout } from "./CoinflowCheckout";
import { CoinbaseEmbeddedOnramp } from "./CoinbaseEmbeddedOnramp";
import { z } from "zod";
import { useOnrampProviders } from "@/hooks/useOnrampProviders";

// Input validation schemas
const emailSchema = z.string().trim().email("Invalid email address").max(254);
const amountSchema = z.number().positive("Amount must be positive").max(10000, "Maximum amount is $10,000");

interface ApiConfig {
  id: string;
  name: string;
  appId: string;
}

interface ApiIntegrationProps {
  apis: ApiConfig[];
}

const CARD2CRYPTO_PROVIDERS = [
  { id: 'moonpay', name: 'MoonPay', minAmount: 20 },
  { id: 'coinbase', name: 'Coinbase', minAmount: 2 },
  { id: 'transak', name: 'Transak', minAmount: 15 },
  { id: 'banxa', name: 'Banxa', minAmount: 20 },
  { id: 'rampnetwork', name: 'Ramp Network', minAmount: 4 },
  { id: 'stripe', name: 'Stripe (USA)', minAmount: 2 },
  { id: 'mercuryo', name: 'Mercuryo', minAmount: 30 },
  { id: 'simplex', name: 'Simplex', minAmount: 50 },
  { id: 'revolut', name: 'Revolut', minAmount: 15 },
];


const getTabIcon = (name: string) => {
  switch (name) {
    case 'coinbase':
      return Wallet;
    case 'card2crypto':
      return CreditCard;
    case 'coinflow':
      return Zap;
    default:
      return CreditCard;
  }
};

const ApiIntegration = ({ apis }: ApiIntegrationProps) => {
  const { toast } = useToast();
  const { data: providers, isLoading: providersLoading } = useOnrampProviders();
  const [activeTab, setActiveTab] = useState<string>('');
  
  // Card2Crypto state
  const [amount, setAmount] = useState('');
  const [email, setEmail] = useState('');
  const [selectedProvider, setSelectedProvider] = useState('moonpay');
  const [isProcessing, setIsProcessing] = useState(false);

  // Set initial tab when providers load
  useEffect(() => {
    if (providers && providers.length > 0 && !activeTab) {
      setActiveTab(providers[0].name);
    }
  }, [providers, activeTab]);

  const enabledTabs = providers?.map(p => p.name) || [];
  const currentIndex = enabledTabs.indexOf(activeTab);

  const handleCard2CryptoPayment = async () => {
    const emailResult = emailSchema.safeParse(email);
    if (!emailResult.success) {
      toast({
        title: "Invalid Email",
        description: emailResult.error.errors[0]?.message || "Please enter a valid email address.",
        variant: "destructive",
      });
      return;
    }

    const parsedAmount = parseFloat(amount);
    const amountResult = amountSchema.safeParse(parsedAmount);
    if (!amountResult.success) {
      toast({
        title: "Invalid Amount",
        description: amountResult.error.errors[0]?.message || "Please enter a valid amount.",
        variant: "destructive",
      });
      return;
    }

    const provider = CARD2CRYPTO_PROVIDERS.find(p => p.id === selectedProvider);
    if (provider && parsedAmount < provider.minAmount) {
      toast({
        title: "Amount Too Low",
        description: `Minimum amount for ${provider.name} is $${provider.minAmount}`,
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);

    try {
      const { data, error } = await supabase.functions.invoke('card2crypto', {
        body: {
          amount: parsedAmount,
          provider: selectedProvider,
          email: emailResult.data,
          currency: 'USD',
          orderId: `order_${Date.now()}`,
        },
      });

      if (error) throw error;

      if (data?.paymentUrl) {
        window.location.href = data.paymentUrl;
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Failed to create payment link. Please try again.";
      toast({
        title: "Payment Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const swipeLeft = () => {
    if (currentIndex > 0) {
      setActiveTab(enabledTabs[currentIndex - 1]);
    }
  };

  const swipeRight = () => {
    if (currentIndex < enabledTabs.length - 1) {
      setActiveTab(enabledTabs[currentIndex + 1]);
    }
  };

  if (providersLoading) {
    return (
      <div className="flex items-center justify-center min-h-[500px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!providers || providers.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[500px] px-6">
        <div className="text-center space-y-4">
          <h2 className="text-2xl font-semibold">No Onramp Configured</h2>
          <p className="text-muted-foreground max-w-md">
            Configure your API integrations to display onramp services here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-h-[600px] flex flex-col items-center justify-center px-6 py-6">
      {/* Tab Switcher */}
      <div className="flex items-center justify-center gap-4 mb-8">
        <Button
          variant="ghost"
          size="icon"
          onClick={swipeLeft}
          className={currentIndex === 0 ? 'opacity-30' : 'hover-scale'}
          disabled={currentIndex === 0}
        >
          <ChevronLeft className="h-6 w-6" />
        </Button>
        
        <div className="flex gap-2 bg-muted rounded-full p-1" data-tutorial="provider-tabs">
          {providers.map((provider) => {
            const Icon = getTabIcon(provider.name);
            return (
              <button
                key={provider.id}
                onClick={() => setActiveTab(provider.name)}
                className={`flex items-center gap-2 px-4 py-2 rounded-full transition-all ${
                  activeTab === provider.name 
                    ? 'bg-primary text-primary-foreground' 
                    : 'hover:bg-muted-foreground/10'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span className="font-medium">{provider.display_name}</span>
              </button>
            );
          })}
        </div>

        <Button
          variant="ghost"
          size="icon"
          onClick={swipeRight}
          className={currentIndex === enabledTabs.length - 1 ? 'opacity-30' : 'hover-scale'}
          disabled={currentIndex === enabledTabs.length - 1}
        >
          <ChevronRight className="h-6 w-6" />
        </Button>
      </div>


      {/* Content Area */}
      <div className="w-full max-w-2xl mx-auto">
        {activeTab === 'coinbase' && (
          <CoinbaseEmbeddedOnramp defaultAsset="USDC" defaultNetwork="solana" />
        )}

        {activeTab === 'card2crypto' && (
          <div className="space-y-8 animate-fade-in">
            <div className="text-center space-y-4">
              <h1 className="text-4xl font-bold tracking-tight">Buy Crypto with Card2Crypto</h1>
              <p className="text-xl text-muted-foreground">
                Accept credit/debit cards, Apple Pay, Google Pay & bank transfers
              </p>
            </div>

            <div className="bg-card border border-border rounded-xl p-6 space-y-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="amount">Amount (USD)</Label>
                  <Input
                    id="amount"
                    type="number"
                    placeholder="Enter amount"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    min="2"
                  />
                </div>

                <div className="space-y-2" data-tutorial="email-input">
                  <Label htmlFor="email">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="your@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Payment Provider</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {CARD2CRYPTO_PROVIDERS.map((provider) => (
                      <button
                        key={provider.id}
                        onClick={() => setSelectedProvider(provider.id)}
                        className={`p-3 rounded-lg border text-sm font-medium transition-all ${
                          selectedProvider === provider.id
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border hover:border-primary/50'
                        }`}
                      >
                        {provider.name}
                        <span className="block text-xs text-muted-foreground">
                          Min: ${provider.minAmount}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <Button 
                onClick={handleCard2CryptoPayment}
                size="lg"
                className="w-full text-lg py-6 hover-scale"
                disabled={isProcessing || !amount || !email}
              >
                {isProcessing ? 'Processing...' : 'Pay with Card'}
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-muted-foreground">
              <div className="flex flex-col items-center space-y-2">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="text-2xl">💳</span>
                </div>
                <p className="font-medium">All Major Cards</p>
              </div>
              <div className="flex flex-col items-center space-y-2">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="text-2xl">🛡️</span>
                </div>
                <p className="font-medium">No Chargebacks</p>
              </div>
              <div className="flex flex-col items-center space-y-2">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="text-2xl">🌍</span>
                </div>
                <p className="font-medium">Global Coverage</p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'coinflow' && (
          <CoinflowCheckout />
        )}
      </div>
    </div>
  );
};

export default ApiIntegration;
