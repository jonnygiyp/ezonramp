import { useEffect, useState, useRef, useCallback } from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useAccount } from '@/hooks/useParticle';

/**
 * Unified hook that ensures a Supabase session exists when a Particle wallet is connected.
 * If no session exists and wallet is connected, automatically creates an anonymous session.
 * This enables Stripe Onramp and other authenticated features without requiring email/password.
 */
export function useSupabaseSession() {
  const { address, isConnected } = useAccount();
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const hasAttemptedAnonSignIn = useRef(false);
  const lastSyncedWallet = useRef<string | null>(null);

  // Ensure Supabase session exists - create anonymous if needed
  const ensureSession = useCallback(async (): Promise<Session | null> => {
    try {
      // First check for existing session
      const { data: { session: existingSession }, error: getError } = await supabase.auth.getSession();
      
      if (getError) {
        console.error('[SupabaseSession] Error getting session:', getError);
        throw getError;
      }

      if (existingSession) {
        console.log('[SupabaseSession] Existing session found for user:', existingSession.user.id.slice(0, 8));
        return existingSession;
      }

      // No session exists - create anonymous session if wallet is connected
      if (isConnected && address && !hasAttemptedAnonSignIn.current) {
        hasAttemptedAnonSignIn.current = true;
        console.log('[SupabaseSession] No session, creating anonymous session for wallet:', address.slice(0, 10));
        
        const { data: anonData, error: anonError } = await supabase.auth.signInAnonymously();
        
        if (anonError) {
          console.error('[SupabaseSession] Anonymous sign-in failed:', anonError);
          throw anonError;
        }

        if (anonData.session) {
          console.log('[SupabaseSession] Anonymous session created for user:', anonData.session.user.id.slice(0, 8));
          return anonData.session;
        }
      }

      return null;
    } catch (err) {
      console.error('[SupabaseSession] ensureSession error:', err);
      throw err;
    }
  }, [isConnected, address]);

  // Sync wallet address to user metadata (for auditing, non-blocking, idempotent)
  // Runs at most once per session - checks DB first to avoid conflicts
  const syncWalletToUser = useCallback(async (currentSession: Session, walletAddress: string) => {
    // Skip if already attempted for this wallet (success or conflict)
    if (lastSyncedWallet.current === walletAddress) {
      return;
    }

    // Mark as attempted immediately to prevent concurrent/repeated calls
    lastSyncedWallet.current = walletAddress;

    try {
      const isEvmAddress = /^0x[a-fA-F0-9]{40}$/.test(walletAddress);
      const walletNetwork = isEvmAddress ? 'ethereum' : 'solana';

      // Step 1: Check if this wallet is already linked to ANY user (including current user)
      const { data: existingProfile, error: queryError } = await supabase
        .from('profiles')
        .select('id, wallet_address')
        .eq('wallet_address', walletAddress)
        .maybeSingle();

      if (queryError) {
        // Query failed - log and exit gracefully (non-blocking)
        console.warn('[SupabaseSession] Could not check wallet ownership:', queryError.message);
        return;
      }

      // Step 2: If wallet is already linked to current user, we're done
      if (existingProfile?.id === currentSession.user.id) {
        console.log('[SupabaseSession] Wallet already linked to current user');
        return;
      }

      // Step 3: If wallet is linked to a DIFFERENT user, skip silently
      if (existingProfile && existingProfile.id !== currentSession.user.id) {
        console.log('[SupabaseSession] Wallet linked to different user - skipping PATCH');
        return;
      }

      // Step 4: Wallet is not linked anywhere - safe to update current user's profile
      console.log('[SupabaseSession] Linking wallet to profile:', walletAddress.slice(0, 10));

      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          wallet_address: walletAddress,
          wallet_network: walletNetwork,
          updated_at: new Date().toISOString(),
        })
        .eq('id', currentSession.user.id);

      if (updateError) {
        // Handle race condition: another request may have linked this wallet - skip silently
        if (updateError.code === '23505' || updateError.message?.includes('duplicate')) {
          console.log('[SupabaseSession] Wallet linked by another user (race condition) - expected');
          return;
        }
        
        // Other errors - log quietly
        console.warn('[SupabaseSession] Profile update failed:', updateError.message);
      } else {
        console.log('[SupabaseSession] Wallet linked successfully');
      }
    } catch (err) {
      // Catch-all for unexpected errors - never block onramp flows
      console.warn('[SupabaseSession] Wallet sync error (non-blocking):', err);
    }
  }, []);

  // Initialize session on mount and listen for changes
  useEffect(() => {
    let isMounted = true;

    // Set up auth state listener first
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (!isMounted) return;
      
      console.log('[SupabaseSession] Auth state changed:', event, newSession?.user?.id?.slice(0, 8) || 'no user');
      setSession(newSession);
      
      // Sync wallet on sign in
      if (newSession && address && isConnected) {
        setTimeout(() => {
          syncWalletToUser(newSession, address);
        }, 0);
      }
    });

    // Initial session check
    const initSession = async () => {
      try {
        const currentSession = await ensureSession();
        if (isMounted) {
          setSession(currentSession);
          
          // Sync wallet if we have both session and wallet
          if (currentSession && address && isConnected) {
            await syncWalletToUser(currentSession, address);
          }
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err : new Error(String(err)));
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    initSession();

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [ensureSession, syncWalletToUser, address, isConnected]);

  // Re-trigger session creation when wallet connects
  useEffect(() => {
    if (isConnected && address && !session && !isLoading) {
      hasAttemptedAnonSignIn.current = false; // Reset to allow retry
      ensureSession().then(newSession => {
        if (newSession) {
          setSession(newSession);
          syncWalletToUser(newSession, address);
        }
      }).catch(err => {
        console.error('[SupabaseSession] Session creation on wallet connect failed:', err);
      });
    }
  }, [isConnected, address, session, isLoading, ensureSession, syncWalletToUser]);

  // Get fresh access token for API calls
  const getAccessToken = useCallback(async (): Promise<string | null> => {
    const { data: { session: freshSession } } = await supabase.auth.getSession();
    return freshSession?.access_token || null;
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
