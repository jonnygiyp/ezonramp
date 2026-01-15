import { useState, useEffect, useCallback } from 'react';
import { useAccount, useDisconnect, useEmbeddedWallet } from '@/hooks/useParticle';
import { Copy, Send, ArrowDownLeft, LogOut, Wallet, Check, ExternalLink, RefreshCw, Key, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { Connection, PublicKey } from '@solana/web3.js';
import SendConfirmationModal from './SendConfirmationModal';

// USDC mint address on Solana mainnet
const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');

// Public RPC endpoints can rate-limit or require tokens; use a fallback list.
const ENV_SOLANA_RPC = import.meta.env.VITE_SOLANA_RPC_URL as string | undefined;
const SOLANA_RPCS: string[] = ENV_SOLANA_RPC
  ? [ENV_SOLANA_RPC]
  : [
      'https://rpc.ankr.com/solana',
      'https://solana-rpc.publicnode.com',
      'https://api.mainnet.solana.com',
      'https://api.mainnet-beta.solana.com',
    ];

interface AccountModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const AccountModal = ({ open, onOpenChange }: AccountModalProps) => {
  const { address } = useAccount();
  const { disconnect } = useDisconnect();
  const { openWallet } = useEmbeddedWallet();
  const [copied, setCopied] = useState(false);
  const [balance, setBalance] = useState<string>('0.00');
  const [isLoadingBalance, setIsLoadingBalance] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showExportWarning, setShowExportWarning] = useState(false);
  const [privateKeyCopied, setPrivateKeyCopied] = useState(false);
  
  // Send form state
  const [sendAddress, setSendAddress] = useState('');
  const [sendAmount, setSendAmount] = useState('');
  const [showSendConfirmation, setShowSendConfirmation] = useState(false);

  // Handle export private key
  const handleExportPrivateKey = useCallback(async () => {
    try {
      // Open the Particle embedded wallet which has secure key export functionality
      await openWallet();
      toast({
        title: "Wallet Opened",
        description: "Navigate to Settings > Security to export your private key",
      });
    } catch (error) {
      console.error('Export private key error:', error);
      toast({
        title: "Export Failed",
        description: "Unable to open wallet. Please try again.",
        variant: "destructive",
      });
    }
  }, [openWallet]);

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
        const ownerPublicKey = new PublicKey(address);

        let lastError: unknown = null;
        for (const rpcUrl of SOLANA_RPCS) {
          try {
            const connection = new Connection(rpcUrl, 'confirmed');

            const tokenAccounts = await connection.getParsedTokenAccountsByOwner(ownerPublicKey, {
              mint: USDC_MINT,
            });

            const totalUiAmount = tokenAccounts.value.reduce((sum, ta) => {
              const tokenAmount = (ta.account.data as any)?.parsed?.info?.tokenAmount;
              const uiAmount =
                typeof tokenAmount?.uiAmount === 'number'
                  ? tokenAmount.uiAmount
                  : parseFloat(tokenAmount?.uiAmountString ?? '0');
              return sum + (Number.isFinite(uiAmount) ? uiAmount : 0);
            }, 0);

            setBalance(totalUiAmount.toFixed(2));
            return;
          } catch (rpcErr) {
            lastError = rpcErr;
            console.warn('[USDC balance] RPC failed:', rpcUrl, rpcErr);
          }
        }

        throw lastError ?? new Error('All Solana RPC endpoints failed');
      } catch (error) {
        console.error('Failed to fetch USDC balance:', error);
        setBalance('0.00');
      } finally {
        setIsLoadingBalance(false);
      }
    };

    fetchBalance();
  }, [address, open]);

  const handleSend = () => {
    if (!sendAddress || !sendAmount || !address) {
      toast({
        title: "Missing Information",
        description: "Please enter both address and amount",
        variant: "destructive",
      });
      return;
    }

    // Validate Solana address format
    try {
      new PublicKey(sendAddress);
    } catch {
      toast({
        title: "Invalid Address",
        description: "Please enter a valid Solana address",
        variant: "destructive",
      });
      return;
    }

    // Validate amount
    const amountNum = parseFloat(sendAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      toast({
        title: "Invalid Amount",
        description: "Please enter a valid amount greater than 0",
        variant: "destructive",
      });
      return;
    }

    // Open confirmation modal
    setShowSendConfirmation(true);
  };

  const handleSendSuccess = () => {
    // Clear form and refresh balance
    setSendAddress('');
    setSendAmount('');
    setShowSendConfirmation(false);
    fetchBalanceManual();
  };

  const fetchBalanceManual = async () => {
    if (!address) return;
    setIsRefreshing(true);
    try {
      const ownerPublicKey = new PublicKey(address);
      for (const rpcUrl of SOLANA_RPCS) {
        try {
          const connection = new Connection(rpcUrl, 'confirmed');
          const tokenAccounts = await connection.getParsedTokenAccountsByOwner(ownerPublicKey, {
            mint: USDC_MINT,
          });
          const totalUiAmount = tokenAccounts.value.reduce((sum, ta) => {
            const tokenAmount = (ta.account.data as any)?.parsed?.info?.tokenAmount;
            const uiAmount =
              typeof tokenAmount?.uiAmount === 'number'
                ? tokenAmount.uiAmount
                : parseFloat(tokenAmount?.uiAmountString ?? '0');
            return sum + (Number.isFinite(uiAmount) ? uiAmount : 0);
          }, 0);
          setBalance(totalUiAmount.toFixed(2));
          return;
        } catch (rpcErr) {
          console.warn('[USDC balance] RPC failed:', rpcUrl, rpcErr);
        }
      }
    } catch (error) {
      console.error('Failed to refresh balance:', error);
    } finally {
      setIsRefreshing(false);
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
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold">
                  {isLoadingBalance || isRefreshing ? '...' : `$${balance}`}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={fetchBalanceManual}
                  disabled={isRefreshing}
                >
                  <RefreshCw className={`h-3 w-3 ${isRefreshing ? 'animate-spin' : ''}`} />
                </Button>
              </div>
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
                  disabled={!sendAddress || !sendAmount}
                >
                  <Send className="mr-2 h-4 w-4" />
                  Send USDC
                </Button>
              </div>
            </TabsContent>
          </Tabs>

          {/* Export Private Key Button */}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                className="w-full"
              >
                <Key className="mr-2 h-4 w-4" />
                Export Private Key
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                  <AlertTriangle className="h-5 w-5" />
                  Security Warning
                </AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <div className="space-y-3">
                    <p>
                      <strong>Never share your private key or seed phrase with anyone.</strong>
                    </p>
                    <p>
                      Anyone with access to your private key can steal all your funds. 
                      EZOnRamp staff will never ask for your private key.
                    </p>
                    <p className="text-destructive font-medium">
                      Only export your private key if you understand the risks.
                    </p>
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleExportPrivateKey} className="bg-destructive hover:bg-destructive/90">
                  I Understand, Continue
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

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

      {/* Send Confirmation Modal */}
      {address && (
        <SendConfirmationModal
          open={showSendConfirmation}
          onOpenChange={setShowSendConfirmation}
          recipientAddress={sendAddress}
          amount={sendAmount}
          senderAddress={address}
          onSuccess={handleSendSuccess}
        />
      )}
    </Dialog>
  );
};

export default AccountModal;
