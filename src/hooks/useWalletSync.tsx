import { useEffect, useRef } from 'react';
import { useAccount } from '@/hooks/useParticle';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

/**
 * Hook to sync the connected Particle wallet address to the user's profile.
 * This ensures the backend can verify the user's linked wallet for Coinbase onramp.
 */
export function useWalletSync() {
  const { address, isConnected } = useAccount();
  const { user, session } = useAuth();
  const lastSyncedRef = useRef<string | null>(null);

  useEffect(() => {
    const syncWalletAddress = async () => {
      // Only sync if user is authenticated and has a connected wallet
      if (!user || !session || !isConnected || !address) {
        return;
      }

      // Avoid redundant syncs
      if (lastSyncedRef.current === address) {
        return;
      }

      try {
        // Determine network based on address format
        const isEvmAddress = /^0x[a-fA-F0-9]{40}$/.test(address);
        const walletNetwork = isEvmAddress ? 'ethereum' : 'solana';

        console.log(`[WalletSync] Syncing wallet ${address.slice(0, 10)}... to profile`);

        const { error } = await supabase
          .from('profiles')
          .update({
            wallet_address: address,
            wallet_network: walletNetwork,
            updated_at: new Date().toISOString(),
          })
          .eq('id', user.id);

        if (error) {
          // If update fails due to unique constraint, the wallet is already linked to another user
          if (error.code === '23505') {
            console.error('[WalletSync] Wallet already linked to another account');
          } else {
            console.error('[WalletSync] Failed to sync wallet:', error.message);
          }
        } else {
          lastSyncedRef.current = address;
          console.log(`[WalletSync] Wallet synced successfully`);
        }
      } catch (err) {
        console.error('[WalletSync] Error syncing wallet:', err);
      }
    };

    syncWalletAddress();
  }, [user, session, isConnected, address]);

  return { isSynced: lastSyncedRef.current === address };
}
