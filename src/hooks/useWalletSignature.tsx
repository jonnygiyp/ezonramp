import { useState, useCallback, useRef } from 'react';
import bs58 from 'bs58';

interface WalletVerificationState {
  isVerified: boolean;
  isVerifying: boolean;
  walletAddress: string | null;
  verifiedAt: number | null;
}

interface UseWalletSignatureReturn {
  verificationState: WalletVerificationState;
  requestSignature: (walletAddress: string) => Promise<{ signature: string; message: string; timestamp: number } | null>;
  resetVerification: () => void;
  isWalletVerified: (walletAddress: string) => boolean;
}

// Cache verification for 30 minutes to avoid repeated signing prompts
const VERIFICATION_CACHE_TTL = 30 * 60 * 1000;

/**
 * Hook for cryptographic wallet signature verification.
 * Requests user to sign a challenge message to prove wallet ownership.
 */
export function useWalletSignature(): UseWalletSignatureReturn {
  const [verificationState, setVerificationState] = useState<WalletVerificationState>({
    isVerified: false,
    isVerifying: false,
    walletAddress: null,
    verifiedAt: null,
  });
  
  // Store verified wallets in a ref to persist across re-renders
  const verifiedWalletsRef = useRef<Map<string, number>>(new Map());
  
  /**
   * Check if a wallet is already verified and cache is still valid
   */
  const isWalletVerified = useCallback((walletAddress: string): boolean => {
    const verifiedAt = verifiedWalletsRef.current.get(walletAddress.toLowerCase());
    if (!verifiedAt) return false;
    
    const now = Date.now();
    if (now - verifiedAt > VERIFICATION_CACHE_TTL) {
      // Cache expired, remove it
      verifiedWalletsRef.current.delete(walletAddress.toLowerCase());
      return false;
    }
    
    return true;
  }, []);
  
  /**
   * Request the user to sign a challenge message using their wallet.
   * Returns the signature, message, and timestamp if successful.
   */
  const requestSignature = useCallback(async (
    walletAddress: string
  ): Promise<{ signature: string; message: string; timestamp: number } | null> => {
    // Check if already verified
    if (isWalletVerified(walletAddress)) {
      console.log('[WalletSignature] Wallet already verified, using cached verification');
      const verifiedAt = verifiedWalletsRef.current.get(walletAddress.toLowerCase());
      setVerificationState({
        isVerified: true,
        isVerifying: false,
        walletAddress,
        verifiedAt: verifiedAt || Date.now(),
      });
      // Return a cached indicator
      return { signature: 'cached', message: 'cached', timestamp: verifiedAt || Date.now() };
    }
    
    setVerificationState({
      isVerified: false,
      isVerifying: true,
      walletAddress,
      verifiedAt: null,
    });
    
    try {
      // Get the Solana provider from Particle Network
      const solanaProvider = (window as any).particle?.solana || (window as any).solana;
      
      if (!solanaProvider) {
        console.error('[WalletSignature] No Solana provider found');
        throw new Error('Wallet provider not available. Please ensure your wallet is connected.');
      }
      
      // Generate a challenge message with timestamp for freshness
      const timestamp = Date.now();
      const nonce = crypto.randomUUID();
      const message = `EzOnramp Wallet Verification\n\nI am signing this message to verify ownership of my wallet for secure crypto purchases.\n\nWallet: ${walletAddress}\nTimestamp: ${timestamp}\nNonce: ${nonce}\n\nThis signature will not trigger any blockchain transaction or cost any gas fees.`;
      
      console.log('[WalletSignature] Requesting signature for wallet:', walletAddress.slice(0, 8));
      
      // Encode message for signing
      const encodedMessage = new TextEncoder().encode(message);
      
      let signatureBytes: Uint8Array;
      
      // Try different signing methods based on provider capabilities
      if (solanaProvider.signMessage) {
        // Standard signMessage method
        signatureBytes = await solanaProvider.signMessage(encodedMessage, 'utf8');
      } else if (solanaProvider.request) {
        // Use provider.request method (Particle style)
        const result = await solanaProvider.request({
          method: 'signMessage',
          params: {
            message: bs58.encode(encodedMessage),
            display: 'utf8',
          },
        });
        
        // Result can be different formats depending on provider
        if (typeof result === 'string') {
          signatureBytes = bs58.decode(result);
        } else if (result.signature) {
          signatureBytes = typeof result.signature === 'string' 
            ? bs58.decode(result.signature) 
            : new Uint8Array(result.signature);
        } else {
          throw new Error('Unexpected signature format from wallet');
        }
      } else {
        throw new Error('Wallet does not support message signing');
      }
      
      // Encode signature as base58
      const signatureBase58 = bs58.encode(signatureBytes);
      
      console.log('[WalletSignature] Signature obtained:', signatureBase58.slice(0, 20) + '...');
      
      // Cache the verification
      const verifiedAt = Date.now();
      verifiedWalletsRef.current.set(walletAddress.toLowerCase(), verifiedAt);
      
      setVerificationState({
        isVerified: true,
        isVerifying: false,
        walletAddress,
        verifiedAt,
      });
      
      return {
        signature: signatureBase58,
        message,
        timestamp,
      };
      
    } catch (error) {
      console.error('[WalletSignature] Signing failed:', error);
      
      setVerificationState({
        isVerified: false,
        isVerifying: false,
        walletAddress,
        verifiedAt: null,
      });
      
      // Re-throw with user-friendly message
      if (error instanceof Error) {
        if (error.message.includes('User rejected') || error.message.includes('cancelled')) {
          throw new Error('Signature request was cancelled. Please approve the signature to continue.');
        }
        throw error;
      }
      throw new Error('Failed to sign verification message');
    }
  }, [isWalletVerified]);
  
  /**
   * Reset verification state (e.g., when wallet disconnects)
   */
  const resetVerification = useCallback(() => {
    setVerificationState({
      isVerified: false,
      isVerifying: false,
      walletAddress: null,
      verifiedAt: null,
    });
    verifiedWalletsRef.current.clear();
  }, []);
  
  return {
    verificationState,
    requestSignature,
    resetVerification,
    isWalletVerified,
  };
}
