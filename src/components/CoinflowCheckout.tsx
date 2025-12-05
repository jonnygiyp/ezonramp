import { FC, useState, useMemo, useCallback } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { CoinflowPurchase, Currency } from '@coinflowlabs/react';
import { Transaction, VersionedTransaction, PublicKey, SystemProgram } from '@solana/web3.js';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { useToast } from '@/hooks/use-toast';

const MERCHANT_ID = 'lovable-test'; // Sandbox merchant ID

export const CoinflowCheckout: FC = () => {
  const { toast } = useToast();
  const { publicKey, sendTransaction, connected } = useWallet();
  const { connection } = useConnection();
  const [amount, setAmount] = useState<number>(10);
  const [email, setEmail] = useState('');
  const [showCheckout, setShowCheckout] = useState(false);

  // Create a simple transaction for Coinflow
  const transaction = useMemo(() => {
    if (!publicKey) return undefined;
    
    const tx = new Transaction();
    // Add a simple instruction - this is a placeholder
    // In production, this would be your actual purchase transaction
    tx.add(
      SystemProgram.transfer({
        fromPubkey: publicKey,
        toPubkey: publicKey, // Self-transfer for demo
        lamports: 0,
      })
    );
    return tx;
  }, [publicKey]);

  // Coinflow wallet interface
  const coinflowWallet = useMemo(() => {
    if (!publicKey || !sendTransaction) return undefined;
    
    return {
      publicKey,
      sendTransaction: async <T extends Transaction | VersionedTransaction>(tx: T): Promise<string> => {
        const signature = await sendTransaction(tx, connection);
        await connection.confirmTransaction(signature);
        return signature;
      },
    };
  }, [publicKey, sendTransaction, connection]);

  const handleConnectWallet = useCallback(async () => {
    // Check if Phantom is installed
    const phantom = (window as any).phantom?.solana;
    
    if (!phantom) {
      toast({
        title: "Phantom Wallet Required",
        description: "Please install Phantom wallet extension to use Coinflow.",
        variant: "destructive",
      });
      window.open('https://phantom.app/', '_blank');
      return;
    }

    try {
      await phantom.connect();
      toast({
        title: "Wallet Connected",
        description: "Your Phantom wallet is now connected.",
      });
    } catch (error: any) {
      toast({
        title: "Connection Failed",
        description: error.message || "Failed to connect wallet.",
        variant: "destructive",
      });
    }
  }, [toast]);

  const handleStartCheckout = () => {
    if (!email) {
      toast({
        title: "Email Required",
        description: "Please enter your email address.",
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

  if (!connected) {
    return (
      <div className="space-y-8 animate-fade-in">
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold tracking-tight">Buy Crypto with Coinflow</h1>
          <p className="text-xl text-muted-foreground">
            Credit card payments powered by Solana
          </p>
        </div>

        <div className="bg-card border border-border rounded-xl p-8 text-center space-y-6">
          <div className="w-16 h-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
            <span className="text-3xl">👻</span>
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-semibold">Connect Phantom Wallet</h3>
            <p className="text-muted-foreground">
              Connect your Solana wallet to start purchasing crypto with Coinflow
            </p>
          </div>
          <Button 
            onClick={handleConnectWallet}
            size="lg"
            className="px-8 hover-scale"
          >
            Connect Phantom
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
            <p className="font-medium">Solana Network</p>
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
  }

  if (showCheckout && coinflowWallet && transaction) {
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
            transaction={transaction}
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
          Credit card payments powered by Solana
        </p>
      </div>

      <div className="bg-card border border-border rounded-xl p-6 space-y-6">
        <div className="flex items-center gap-3 p-3 bg-primary/10 rounded-lg">
          <span className="text-2xl">✓</span>
          <div>
            <p className="font-medium">Wallet Connected</p>
            <p className="text-sm text-muted-foreground truncate max-w-[200px]">
              {publicKey?.toBase58()}
            </p>
          </div>
        </div>

        <div className="space-y-4">
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
          disabled={!amount || !email}
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
          <p className="font-medium">Solana Network</p>
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
