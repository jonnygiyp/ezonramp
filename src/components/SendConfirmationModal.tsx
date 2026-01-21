import { useState } from 'react';
import { AlertCircle, ArrowRight, Check, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import {
  Connection,
  PublicKey,
  Transaction,
  VersionedTransaction,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddressSync,
  createTransferInstruction,
  createAssociatedTokenAccountInstruction,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from '@solana/spl-token';

// USDC mint address on Solana mainnet
const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const USDC_DECIMALS = 6;

// RPC endpoints with fallback
const ENV_SOLANA_RPC = import.meta.env.VITE_SOLANA_RPC_URL as string | undefined;
const SOLANA_RPCS: string[] = ENV_SOLANA_RPC
  ? [ENV_SOLANA_RPC]
  : [
      'https://rpc.ankr.com/solana',
      'https://solana-rpc.publicnode.com',
      'https://api.mainnet.solana.com',
      'https://api.mainnet-beta.solana.com',
    ];

type SendStep = 'confirm' | 'signing' | 'sending' | 'success' | 'error';

interface SendConfirmationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipientAddress: string;
  amount: string;
  senderAddress: string;
  onSuccess?: () => void;
}

async function getWorkingConnection(): Promise<Connection> {
  for (const rpcUrl of SOLANA_RPCS) {
    try {
      const connection = new Connection(rpcUrl, 'confirmed');
      await connection.getLatestBlockhash();
      return connection;
    } catch (err) {
      console.warn('[SendConfirmation] RPC failed:', rpcUrl, err);
    }
  }
  throw new Error('All Solana RPC endpoints failed');
}

const SendConfirmationModal = ({
  open,
  onOpenChange,
  recipientAddress,
  amount,
  senderAddress,
  onSuccess,
}: SendConfirmationModalProps) => {
  const [step, setStep] = useState<SendStep>('confirm');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [txSignature, setTxSignature] = useState<string>('');

  const truncateAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  const resetModal = () => {
    setStep('confirm');
    setErrorMessage('');
    setTxSignature('');
  };

  const handleClose = (isOpen: boolean) => {
    if (!isOpen) {
      resetModal();
    }
    onOpenChange(isOpen);
  };

  const handleConfirmSend = async () => {
    setStep('signing');
    setErrorMessage('');

    try {
      // Validate addresses
      const senderPubkey = new PublicKey(senderAddress);
      const recipientPubkey = new PublicKey(recipientAddress);

      // Get connection
      const connection = await getWorkingConnection();

      // Calculate amount in smallest units
      const amountNum = parseFloat(amount);
      if (isNaN(amountNum) || amountNum <= 0) {
        throw new Error('Invalid amount');
      }
      const amountInSmallestUnits = BigInt(Math.round(amountNum * Math.pow(10, USDC_DECIMALS)));

      // Get token accounts
      const senderAta = getAssociatedTokenAddressSync(
        USDC_MINT,
        senderPubkey,
        false,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );

      const recipientAta = getAssociatedTokenAddressSync(
        USDC_MINT,
        recipientPubkey,
        false,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );

      // Check if recipient has USDC account, if not we need to create it
      const recipientAtaInfo = await connection.getAccountInfo(recipientAta);
      const instructions = [];

      if (!recipientAtaInfo) {
        // Create associated token account for recipient
        instructions.push(
          createAssociatedTokenAccountInstruction(
            senderPubkey, // payer
            recipientAta, // ata address
            recipientPubkey, // owner
            USDC_MINT, // mint
            TOKEN_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID
          )
        );
      }

      // Add transfer instruction
      instructions.push(
        createTransferInstruction(
          senderAta,
          recipientAta,
          senderPubkey,
          amountInSmallestUnits,
          [],
          TOKEN_PROGRAM_ID
        )
      );

      // Build transaction
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      const transaction = new Transaction().add(...instructions);
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = senderPubkey;

      // Get Solana provider from window (Particle injects this)
      const solanaProvider = (window as any).particle?.solana ?? (window as any).solana;
      
      if (!solanaProvider) {
        throw new Error('Solana wallet provider not found. Please ensure your wallet is connected.');
      }

      setStep('signing');

      // Sign transaction
      let signedTx: Transaction | VersionedTransaction;
      
      if (solanaProvider.signTransaction) {
        signedTx = await solanaProvider.signTransaction(transaction);
      } else if (solanaProvider.request) {
        // Use signAndSendTransaction if available
        const result = await solanaProvider.request({
          method: 'signAndSendTransaction',
          params: {
            message: transaction.serializeMessage().toString('base64'),
          },
        });
        
        if (result?.signature) {
          setTxSignature(result.signature);
          setStep('success');
          toast({
            title: 'Transaction Sent',
            description: `Successfully sent ${amount} USDC`,
          });
          onSuccess?.();
          return;
        }
        throw new Error('Failed to sign transaction');
      } else {
        throw new Error('Wallet does not support transaction signing');
      }

      setStep('sending');

      // Send signed transaction
      const rawTransaction = signedTx.serialize();
      const signature = await connection.sendRawTransaction(rawTransaction, {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      });

      // Wait for confirmation
      await connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight,
      });

      setTxSignature(signature);
      setStep('success');

      toast({
        title: 'Transaction Confirmed',
        description: `Successfully sent ${amount} USDC`,
      });

      onSuccess?.();
    } catch (error: any) {
      console.error('Send failed:', error);
      setErrorMessage(error.message || 'Transaction failed');
      setStep('error');

      toast({
        title: 'Transaction Failed',
        description: error.message || 'Failed to send USDC',
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {step === 'confirm' && 'Confirm Transaction'}
            {step === 'signing' && 'Signing Transaction'}
            {step === 'sending' && 'Sending Transaction'}
            {step === 'success' && 'Transaction Successful'}
            {step === 'error' && 'Transaction Failed'}
          </DialogTitle>
          <DialogDescription>
            {step === 'confirm' && 'Please review the transaction details before confirming.'}
            {step === 'signing' && 'Please sign the transaction in your wallet.'}
            {step === 'sending' && 'Broadcasting transaction to the network...'}
            {step === 'success' && 'Your USDC has been sent successfully.'}
            {step === 'error' && 'There was an error processing your transaction.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Transaction Details */}
          <div className="rounded-lg border bg-muted/50 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">From</span>
              <code className="text-sm font-mono">{truncateAddress(senderAddress)}</code>
            </div>
            <div className="flex justify-center">
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">To</span>
              <code className="text-sm font-mono">{truncateAddress(recipientAddress)}</code>
            </div>
            <div className="border-t pt-3 mt-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Amount</span>
                <span className="text-lg font-bold">${amount} USDC</span>
              </div>
            </div>
          </div>

          {/* Status Indicator */}
          {step === 'signing' && (
            <div className="flex items-center justify-center gap-3 p-4 bg-primary/10 rounded-lg">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <span className="text-sm">Waiting for wallet signature...</span>
            </div>
          )}

          {step === 'sending' && (
            <div className="flex items-center justify-center gap-3 p-4 bg-primary/10 rounded-lg">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <span className="text-sm">Broadcasting to Solana network...</span>
            </div>
          )}

          {step === 'success' && (
            <div className="space-y-3">
              <div className="flex items-center justify-center gap-3 p-4 bg-green-500/10 rounded-lg">
                <Check className="h-5 w-5 text-green-500" />
                <span className="text-sm text-green-600">Transaction confirmed!</span>
              </div>
              {txSignature && (
                <div className="text-center">
                  <a
                    href={`https://solscan.io/tx/${txSignature}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary hover:underline"
                  >
                    View on Solscan →
                  </a>
                </div>
              )}
            </div>
          )}

          {step === 'error' && (
            <div className="flex items-center gap-3 p-4 bg-destructive/10 rounded-lg">
              <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0" />
              <span className="text-sm text-destructive">{errorMessage}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3">
            {step === 'confirm' && (
              <>
                <Button variant="outline" className="flex-1" onClick={() => handleClose(false)}>
                  <X className="mr-2 h-4 w-4" />
                  Cancel
                </Button>
                <Button className="flex-1" onClick={handleConfirmSend}>
                  <Check className="mr-2 h-4 w-4" />
                  Confirm & Send
                </Button>
              </>
            )}

            {(step === 'signing' || step === 'sending') && (
              <Button variant="outline" className="w-full" disabled>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </Button>
            )}

            {step === 'success' && (
              <Button className="w-full" onClick={() => handleClose(false)}>
                Done
              </Button>
            )}

            {step === 'error' && (
              <>
                <Button variant="outline" className="flex-1" onClick={() => handleClose(false)}>
                  Close
                </Button>
                <Button className="flex-1" onClick={() => setStep('confirm')}>
                  Try Again
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SendConfirmationModal;
