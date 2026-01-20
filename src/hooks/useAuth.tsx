import { createContext, useContext, useEffect, useState, ReactNode, useCallback, useRef } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isAdmin: boolean;
  loading: boolean;
  syncWalletAuth: (walletAddress: string, walletType?: string, particleUserId?: string) => Promise<boolean>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const walletSyncInProgress = useRef(false);
  const lastSyncedWallet = useRef<string | null>(null);

  useEffect(() => {
    // Set up auth state listener first
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('[useAuth] Auth state changed:', event, session?.user?.id?.slice(0, 8));
      setSession(session);
      setUser(session?.user ?? null);
      
      // Defer admin check to avoid deadlock
      if (session?.user) {
        setTimeout(() => {
          checkAdminRole(session.user.id);
        }, 0);
      } else {
        setIsAdmin(false);
      }
    });

    // Then check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      console.log('[useAuth] Initial session check:', session?.user?.id?.slice(0, 8) || 'none');
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        checkAdminRole(session.user.id);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const checkAdminRole = async (userId: string) => {
    const { data, error } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'admin')
      .maybeSingle();
    
    if (!error && data) {
      setIsAdmin(true);
    } else {
      setIsAdmin(false);
    }
  };

  /**
   * Sync wallet authentication with Supabase (simplified - no signature required).
   * Creates or retrieves a Supabase user for the wallet address.
   */
  const syncWalletAuth = useCallback(async (
    walletAddress: string,
    walletType?: string,
    particleUserId?: string
  ): Promise<boolean> => {
    // Prevent duplicate sync attempts
    if (walletSyncInProgress.current) {
      console.log('[useAuth] Wallet sync already in progress, skipping');
      return false;
    }
    
    // Skip if already synced for this wallet AND session exists
    if (lastSyncedWallet.current === walletAddress && session) {
      console.log('[useAuth] Wallet already synced:', walletAddress.slice(0, 8));
      return true;
    }
    
    walletSyncInProgress.current = true;
    console.log('[useAuth] Starting wallet auth sync for:', walletAddress.slice(0, 8));
    
    try {
      // Call the wallet-auth backend function (no signature required)
      const { data, error } = await supabase.functions.invoke('wallet-auth', {
        body: {
          walletAddress,
          walletType: walletType || 'particle',
          particleUserId,
        },
      });
      
      if (error) {
        console.error('[useAuth] Wallet auth error:', error);
        return false;
      }
      
      if (!data?.success || !data?.token) {
        console.error('[useAuth] Wallet auth returned no token:', data);
        return false;
      }
      
      console.log('[useAuth] Wallet auth successful, establishing session...');
      
      // Use the magic link token to establish session
      const { data: sessionData, error: sessionError } = await supabase.auth.verifyOtp({
        email: data.email,
        token: data.token,
        type: 'magiclink',
      });
      
      if (sessionError) {
        console.error('[useAuth] Session verification error:', sessionError);
        return false;
      }
      
      if (sessionData?.session) {
        console.log('[useAuth] Wallet auth session established:', sessionData.user?.id?.slice(0, 8));
        lastSyncedWallet.current = walletAddress;
        return true;
      }
      
      return false;
    } catch (err) {
      console.error('[useAuth] Wallet sync failed:', err);
      return false;
    } finally {
      walletSyncInProgress.current = false;
    }
  }, [session]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error as Error | null };
  };

  const signUp = async (email: string, password: string) => {
    const redirectUrl = `${window.location.origin}/`;
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: redirectUrl }
    });
    return { error: error as Error | null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setIsAdmin(false);
    lastSyncedWallet.current = null;
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      session, 
      isAdmin, 
      loading, 
      syncWalletAuth, 
      signIn, 
      signUp, 
      signOut 
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
