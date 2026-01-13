import { FC, useState, useMemo, useEffect } from 'react';
import { CoinflowPurchase, Currency } from '@coinflowlabs/react';
import { Connection, PublicKey, Transaction, VersionedTransaction, clusterApiUrl } from '@solana/web3.js';
import { useWallets } from '@/hooks/useParticle';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { useToast } from '@/hooks/use-toast';
import { z } from 'zod';

// Use environment variable for merchant ID, fallback to sandbox for development
const MERCHANT_ID = import.meta.env.VITE_COINFLOW_MERCHANT_ID || 'lovable-test';
const SOLANA_MAINNET_CHAIN_ID = 101;

// Solana address validation schema
const solanaAddressSchema = z.string()
  .trim()
  .min(32, "Invalid Solana address")
  .max(44, "Invalid Solana address")
  .refine((val) => {
    try {
      new PublicKey(val);
      return true;
    } catch {
      return false;
    }
  }, "Invalid Solana wallet address");

export const CoinflowCheckout: FC = () => {
  const { toast } = useToast();
  const wallets = useWallets();
  const [walletAddress, setWalletAddress] = useState('');
  const [amount, setAmount] = useState<number>(10);
  const [email, setEmail] = useState('');
  const [showCheckout, setShowCheckout] = useState(false);

  // Auto-populate Solana wallet address from Particle if connected
  useEffect(() => {
    const solanaWallet = wallets.find(w => w.chainId === SOLANA_MAINNET_CHAIN_ID);
    if (solanaWallet && solanaWallet.accounts[0] && !walletAddress) {
      setWalletAddress(solanaWallet.accounts[0]);
    }
  }, [wallets, walletAddress]);

  // Create connection to Solana devnet
  const connection = useMemo(() => new Connection(clusterApiUrl('devnet')), []);

  // Parse the wallet address
  const publicKey = useMemo(() => {
    try {
      const result = solanaAddressSchema.safeParse(walletAddress);
      if (result.success) {
        return new PublicKey(walletAddress);
      }
      return null;
    } catch {
      return null;
    }
  }, [walletAddress]);

  // Coinflow wallet interface (read-only for receiving funds)
  const coinflowWallet = useMemo(() => {
    if (!publicKey) return undefined;
    
    return {
      publicKey,
      // For receive-only mode, we provide a minimal sendTransaction that won't be called
      sendTransaction: async <T extends Transaction | VersionedTransaction>(_tx: T): Promise<string> => {
        throw new Error('This is a receive-only wallet');
      },
    };
  }, [publicKey]);

  const handleStartCheckout = () => {
    // Validate wallet address
    const addressResult = solanaAddressSchema.safeParse(walletAddress);
    if (!addressResult.success) {
      toast({
        title: "Invalid Wallet Address",
        description: "Please enter a valid Solana wallet address.",
        variant: "destructive",
      });
      return;
    }

    // Validate email
    const emailSchema = z.string().email();
    if (!emailSchema.safeParse(email).success) {
      toast({
        title: "Invalid Email",
        description: "Please enter a valid email address.",
        variant: "destructive",
      });
      return;
    }

    if (amount < 1) {
      toast({
        title: "Invalid Amount",
        description: "Minimum amount is $1.",
        variant: "destructive",
      });
      return;
    }
    
    setShowCheckout(true);
  };

  if (showCheckout && coinflowWallet) {
    return (
      <div className="space-y-4 animate-fade-in">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">Complete Purchase</h2>
          <Button variant="outline" onClick={() => setShowCheckout(false)}>
            Back
          </Button>
        </div>
        <div className="bg-card border border-border rounded-xl overflow-hidden" style={{ height: '600px' }}>
          <CoinflowPurchase
            wallet={coinflowWallet}
            merchantId={MERCHANT_ID}
            env="sandbox"
            connection={connection}
            subtotal={{ cents: amount * 100, currency: Currency.USD }}
            blockchain="solana"
            email={email}
            onSuccess={() => {
              toast({
                title: "Purchase Successful!",
                description: "Your crypto purchase has been completed.",
              });
              setShowCheckout(false);
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold tracking-tight">Buy Crypto with Coinflow</h1>
        <p className="text-xl text-muted-foreground">
          Credit card payments to any Solana wallet
        </p>
      </div>

      <div className="bg-card border border-border rounded-xl p-6 space-y-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="coinflow-wallet">Solana Wallet Address</Label>
            <Input
              id="coinflow-wallet"
              type="text"
              placeholder="Enter your Solana wallet address"
              value={walletAddress}
              onChange={(e) => setWalletAddress(e.target.value)}
              readOnly={wallets.some(w => w.chainId === SOLANA_MAINNET_CHAIN_ID && w.accounts[0])}
              disabled={wallets.some(w => w.chainId === SOLANA_MAINNET_CHAIN_ID && w.accounts[0])}
              className={`${publicKey ? "border-green-500" : walletAddress ? "border-destructive" : ""} ${wallets.some(w => w.chainId === SOLANA_MAINNET_CHAIN_ID && w.accounts[0]) ? "bg-muted cursor-not-allowed" : ""}`}
            />
            {walletAddress && !publicKey && (
              <p className="text-sm text-destructive">Please enter a valid Solana address</p>
            )}
            {publicKey && (
              <p className="text-sm text-green-600">Valid Solana address ✓</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="coinflow-amount">Amount (USD)</Label>
            <Input
              id="coinflow-amount"
              type="number"
              placeholder="Enter amount"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              min="1"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="coinflow-email">Email Address</Label>
            <Input
              id="coinflow-email"
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
        </div>

        <Button 
          onClick={handleStartCheckout}
          size="lg"
          className="w-full text-lg py-6 hover-scale"
          disabled={!publicKey || !amount || !email}
        >
          Continue to Payment
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-muted-foreground">
        <div className="flex flex-col items-center space-y-2">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <span className="text-2xl">💳</span>
          </div>
          <p className="font-medium">Credit Card Support</p>
        </div>
        <div className="flex flex-col items-center space-y-2">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <span className="text-2xl">🔗</span>
          </div>
          <p className="font-medium">No Wallet Extension</p>
        </div>
        <div className="flex flex-col items-center space-y-2">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <span className="text-2xl">⚡</span>
          </div>
          <p className="font-medium">Instant Settlement</p>
        </div>
      </div>
    </div>
  );
};
