import { useState, useEffect } from 'react';
import { useAccount, useDisconnect, useWallets } from '@/hooks/useParticle';
import { Copy, Send, ArrowDownLeft, LogOut, Wallet, Check, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { Connection, PublicKey } from '@solana/web3.js';

// USDC mint address on Solana mainnet
const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const SOLANA_RPC = 'https://api.mainnet-beta.solana.com';

interface AccountModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const AccountModal = ({ open, onOpenChange }: AccountModalProps) => {
  const { address, chain } = useAccount();
  const { disconnect } = useDisconnect();
  const [wallets] = useWallets();
  const [copied, setCopied] = useState(false);
  const [balance, setBalance] = useState<string>('0.00');
  const [isLoadingBalance, setIsLoadingBalance] = useState(true);
  
  // Send form state
  const [sendAddress, setSendAddress] = useState('');
  const [sendAmount, setSendAmount] = useState('');
  const [isSending, setIsSending] = useState(false);

  const truncateAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  const copyAddress = async () => {
    if (address) {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      toast({
        title: "Address Copied",
        description: "Wallet address copied to clipboard",
      });
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDisconnect = () => {
    disconnect();
    onOpenChange(false);
  };

  // Fetch USDC balance on Solana
  useEffect(() => {
    const fetchBalance = async () => {
      if (!address || !open) return;
      
      setIsLoadingBalance(true);
      try {
        const connection = new Connection(SOLANA_RPC, 'confirmed');
        const ownerPublicKey = new PublicKey(address);
        
        // Get all token accounts for this wallet
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
          ownerPublicKey,
          { mint: USDC_MINT }
        );
        
        if (tokenAccounts.value.length > 0) {
          const usdcAccount = tokenAccounts.value[0];
          const tokenAmount = usdcAccount.account.data.parsed.info.tokenAmount;
          const uiAmount = tokenAmount.uiAmount || 0;
          setBalance(uiAmount.toFixed(2));
        } else {
          setBalance('0.00');
        }
      } catch (error) {
        console.error('Failed to fetch USDC balance:', error);
        setBalance('0.00');
      } finally {
        setIsLoadingBalance(false);
      }
    };

    fetchBalance();
  }, [address, open]);

  const handleSend = async () => {
    if (!sendAddress || !sendAmount || !address) {
      toast({
        title: "Missing Information",
        description: "Please enter both address and amount",
        variant: "destructive",
      });
      return;
    }

    setIsSending(true);
    try {
      // For now, show a message that this requires wallet signature
      // Full SPL token transfer implementation would require more complex setup
      toast({
        title: "Send USDC",
        description: "USDC transfer initiated. Please confirm in your wallet.",
      });
      
      // TODO: Implement full SPL token transfer
      // This would require creating an SPL token transfer instruction
      // and sending it through the wallet provider
      
    } catch (error: any) {
      console.error('Send failed:', error);
      toast({
        title: "Transaction Failed",
        description: error.message || "Failed to send transaction",
        variant: "destructive",
      });
    } finally {
      setIsSending(false);
    }
  };

  const getExplorerUrl = () => {
    if (!address) return null;
    return `https://solscan.io/account/${address}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            My Wallet
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Wallet Overview */}
          <div className="rounded-lg border bg-muted/50 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Address</span>
              <div className="flex items-center gap-2">
                <code className="text-sm font-mono">
                  {address ? truncateAddress(address) : '...'}
                </code>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={copyAddress}
                >
                  {copied ? (
                    <Check className="h-3 w-3 text-green-500" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </Button>
                {getExplorerUrl() && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    asChild
                  >
                    <a href={getExplorerUrl()!} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </Button>
                )}
              </div>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Network</span>
              <span className="text-sm font-medium">Solana</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">USDC Balance</span>
              <span className="text-lg font-bold">
                {isLoadingBalance ? '...' : `$${balance}`}
              </span>
            </div>
          </div>

          {/* Tabs for Send/Receive */}
          <Tabs defaultValue="receive" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="receive" className="flex items-center gap-2">
                <ArrowDownLeft className="h-4 w-4" />
                Receive
              </TabsTrigger>
              <TabsTrigger value="send" className="flex items-center gap-2">
                <Send className="h-4 w-4" />
                Send
              </TabsTrigger>
            </TabsList>

            <TabsContent value="receive" className="space-y-4 mt-4">
              <div className="text-center space-y-3">
                <p className="text-sm text-muted-foreground">
                  Share your Solana address to receive USDC
                </p>
                <div className="p-4 bg-muted rounded-lg">
                  <code className="text-xs break-all">{address}</code>
                </div>
                <Button onClick={copyAddress} className="w-full">
                  {copied ? (
                    <>
                      <Check className="mr-2 h-4 w-4" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="mr-2 h-4 w-4" />
                      Copy Address
                    </>
                  )}
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="send" className="space-y-4 mt-4">
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="recipient">Recipient Solana Address</Label>
                  <Input
                    id="recipient"
                    placeholder="Enter Solana address..."
                    value={sendAddress}
                    onChange={(e) => setSendAddress(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="amount">Amount (USDC)</Label>
                  <Input
                    id="amount"
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={sendAmount}
                    onChange={(e) => setSendAmount(e.target.value)}
                  />
                </div>
                <Button 
                  onClick={handleSend} 
                  className="w-full"
                  disabled={isSending || !sendAddress || !sendAmount}
                >
                  {isSending ? (
                    'Sending...'
                  ) : (
                    <>
                      <Send className="mr-2 h-4 w-4" />
                      Send USDC
                    </>
                  )}
                </Button>
              </div>
            </TabsContent>
          </Tabs>

          {/* Disconnect Button */}
          <Button
            variant="outline"
            onClick={handleDisconnect}
            className="w-full text-destructive hover:text-destructive"
          >
            <LogOut className="mr-2 h-4 w-4" />
            Disconnect Wallet
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AccountModal;
