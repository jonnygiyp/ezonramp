import { useEffect, useState, useRef, useCallback } from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useAccount } from '@/hooks/useParticle';

/**
 * Tracks the current Supabase auth session and (when also wallet-connected)
 * idempotently links the connected wallet to the user's profile.
 *
 * IMPORTANT: Anonymous Supabase sign-ins are DISABLED for this project.
 * This hook will NEVER attempt to create a session implicitly — callers must
 * ensure the user signs in via the /auth page (email/password or future OAuth)
 * BEFORE invoking onramp providers. If `hasSession` is false, the caller
 * should prompt the user to sign in instead of proceeding.
 */
export function useSupabaseSession() {
  const { address, isConnected } = useAccount();
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const lastSyncedWallet = useRef<string | null>(null);

  // Sync wallet → profile (idempotent, non-blocking).
  const syncWalletToUser = useCallback(async (currentSession: Session, walletAddress: string) => {
    if (lastSyncedWallet.current === walletAddress) return;
    lastSyncedWallet.current = walletAddress;

    try {
      const isEvmAddress = /^0x[a-fA-F0-9]{40}$/.test(walletAddress);
      const walletNetwork = isEvmAddress ? 'ethereum' : 'solana';

      const { data: existingProfile, error: queryError } = await supabase
        .from('profiles')
        .select('id, wallet_address')
        .eq('wallet_address', walletAddress)
        .maybeSingle();

      if (queryError) {
        console.warn('[SupabaseSession] Could not check wallet ownership:', queryError.message);
        return;
      }

      if (existingProfile?.id === currentSession.user.id) return;
      if (existingProfile && existingProfile.id !== currentSession.user.id) {
        console.log('[SupabaseSession] Wallet linked to different user — skipping PATCH');
        return;
      }

      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          wallet_address: walletAddress,
          wallet_network: walletNetwork,
          updated_at: new Date().toISOString(),
        })
        .eq('id', currentSession.user.id);

      if (updateError && updateError.code !== '23505') {
        console.warn('[SupabaseSession] Profile update failed:', updateError.message);
      }
    } catch (err) {
      console.warn('[SupabaseSession] Wallet sync error (non-blocking):', err);
    }
  }, []);

  // Listen for auth changes + read current session on mount.
  useEffect(() => {
    let isMounted = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (!isMounted) return;
      console.log('[SupabaseSession] Auth event:', event, 'user:', newSession?.user?.id?.slice(0, 8) || 'none');
      setSession(newSession);
      if (newSession && address && isConnected) {
        setTimeout(() => syncWalletToUser(newSession, address), 0);
      }
    });

    (async () => {
      try {
        const { data: { session: existing }, error: getErr } = await supabase.auth.getSession();
        if (getErr) throw getErr;
        if (!isMounted) return;
        setSession(existing);
        if (existing && address && isConnected) {
          await syncWalletToUser(existing, address);
        }
      } catch (err) {
        if (isMounted) setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        if (isMounted) setIsLoading(false);
      }
    })();

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [syncWalletToUser, address, isConnected]);

  // Get a fresh access token; null if no session exists.
  const getAccessToken = useCallback(async (): Promise<string | null> => {
    const { data: { session: fresh } } = await supabase.auth.getSession();
    return fresh?.access_token || null;
  }, []);

  return {
    session,
    isLoading,
    error,
    getAccessToken,
    hasSession: !!session,
    userId: session?.user?.id || null,
  };
}
