import { useEffect, useState, useRef, useCallback } from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useAccount, useParticleAuth } from '@/hooks/useParticle';

/**
 * Wallet-first auth: when Particle is connected, exchange the Particle
 * (uuid, token) for a Supabase session via the `particle-session` edge
 * function. Falls back to whatever Supabase session already exists.
 *
 * Anonymous sign-ins remain DISABLED — provisioning happens server-side via
 * the service-role key inside the edge function.
 */
export function useSupabaseSession() {
  const { address, isConnected } = useAccount();
  const particleAuth = useParticleAuth();
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [exchangeError, setExchangeError] = useState<string | null>(null);
  const exchangeInFlight = useRef<Promise<Session | null> | null>(null);
  const lastExchangedUuid = useRef<string | null>(null);
  const lastSyncedWallet = useRef<string | null>(null);

  // Read Particle user info defensively (hook returns object even when not connected).
  const readParticleUserInfo = useCallback((): { uuid: string; token: string } | null => {
    try {
      const info = particleAuth?.getUserInfo?.();
      if (info?.uuid && info?.token) {
        return { uuid: info.uuid, token: info.token };
      }
    } catch {
      // Not signed in via Particle social auth (e.g. external wallet) — return null.
    }
    return null;
  }, [particleAuth]);

  const exchangeForSupabaseSession = useCallback(async (): Promise<Session | null> => {
    const creds = readParticleUserInfo();
    if (!creds) {
      console.log('[SupabaseSession] No Particle credentials available for exchange');
      return null;
    }
    if (lastExchangedUuid.current === creds.uuid) {
      const { data: { session: existing } } = await supabase.auth.getSession();
      return existing;
    }
    if (exchangeInFlight.current) return exchangeInFlight.current;

    console.log('[SupabaseSession] Exchanging Particle session for Supabase session', {
      particleUuid: creds.uuid.slice(0, 8),
      walletAddress: address ? `${address.slice(0, 6)}…${address.slice(-4)}` : null,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 80) : 'unknown',
    });

    const run = (async (): Promise<Session | null> => {
      try {
        const { data, error: invokeError } = await supabase.functions.invoke('particle-session', {
          body: {
            particleUuid: creds.uuid,
            particleToken: creds.token,
            walletAddress: address || undefined,
          },
        });
        if (invokeError) throw invokeError;
        if (!data?.access_token || !data?.refresh_token) {
          throw new Error('particle-session returned no tokens');
        }
        const { data: setData, error: setErr } = await supabase.auth.setSession({
          access_token: data.access_token,
          refresh_token: data.refresh_token,
        });
        if (setErr) throw setErr;
        lastExchangedUuid.current = creds.uuid;
        setExchangeError(null);
        console.log('[SupabaseSession] Token exchange OK', {
          userId: setData.session?.user?.id?.slice(0, 8),
          walletVerified: data.wallet_verified,
        });
        return setData.session;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn('[SupabaseSession] Token exchange failed:', msg);
        setExchangeError('We could not verify your wallet session. Please reconnect your wallet.');
        return null;
      } finally {
        exchangeInFlight.current = null;
      }
    })();
    exchangeInFlight.current = run;
    return run;
  }, [address, readParticleUserInfo]);

  // Idempotent client-side wallet→profile sync (server already syncs verified wallets).
  const syncWalletToUser = useCallback(async (currentSession: Session, walletAddress: string) => {
    if (lastSyncedWallet.current === walletAddress) return;
    lastSyncedWallet.current = walletAddress;
    try {
      const isEvmAddress = /^0x[a-fA-F0-9]{40}$/.test(walletAddress);
      const walletNetwork = isEvmAddress ? 'ethereum' : 'solana';
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('wallet_address', walletAddress)
        .maybeSingle();
      if (existingProfile?.id === currentSession.user.id) return;
      if (existingProfile && existingProfile.id !== currentSession.user.id) return;
      await supabase
        .from('profiles')
        .update({
          wallet_address: walletAddress,
          wallet_network: walletNetwork,
          updated_at: new Date().toISOString(),
        })
        .eq('id', currentSession.user.id);
    } catch (err) {
      console.warn('[SupabaseSession] wallet sync error (non-blocking):', err);
    }
  }, []);

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
        const { data: { session: existing } } = await supabase.auth.getSession();
        if (!isMounted) return;
        let effective = existing;

        // If wallet is connected but no Supabase session, perform token exchange.
        if (!effective && isConnected && readParticleUserInfo()) {
          effective = await exchangeForSupabaseSession();
        }

        if (!isMounted) return;
        setSession(effective);
        if (effective && address && isConnected) {
          await syncWalletToUser(effective, address);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncWalletToUser, address, isConnected]);

  // React to wallet-connect events after initial mount.
  useEffect(() => {
    if (!isConnected) return;
    if (session) return;
    if (!readParticleUserInfo()) return;
    void exchangeForSupabaseSession();
  }, [isConnected, session, readParticleUserInfo, exchangeForSupabaseSession]);

  const getAccessToken = useCallback(async (): Promise<string | null> => {
    const { data: { session: fresh } } = await supabase.auth.getSession();
    if (fresh?.access_token) return fresh.access_token;
    // Last-ditch attempt to rebuild the session from Particle.
    if (isConnected && readParticleUserInfo()) {
      const rebuilt = await exchangeForSupabaseSession();
      return rebuilt?.access_token || null;
    }
    return null;
  }, [exchangeForSupabaseSession, isConnected, readParticleUserInfo]);

  return {
    session,
    isLoading,
    error,
    exchangeError,
    getAccessToken,
    hasSession: !!session,
    userId: session?.user?.id || null,
    /** Force re-exchange (e.g. after a wallet change). */
    refreshFromParticle: exchangeForSupabaseSession,
  };
}
