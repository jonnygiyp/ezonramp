// Re-export Particle hooks with lazy loading to avoid circular import issues
// All components should import from here instead of directly from @particle-network/connectkit

import { useState, useEffect, createContext, useContext, ReactNode } from 'react';

// Wallet type definition for useWallets
export interface ParticleWallet {
  chainId: number;
  accounts: readonly string[];
  connector?: unknown;
}

interface ParticleContextValue {
  isReady: boolean;
  error: Error | null;
  useAccount: () => { isConnected: boolean; address: string | undefined; isConnecting: boolean };
  useModal: () => { setOpen: (open: boolean) => void };
  useDisconnect: () => { disconnect: () => void };
  useWallets: () => ParticleWallet[];
}

const defaultHooks: ParticleContextValue = {
  isReady: false,
  error: null,
  useAccount: () => ({ isConnected: false, address: undefined, isConnecting: true }),
  useModal: () => ({ setOpen: () => {} }),
  useDisconnect: () => ({ disconnect: () => {} }),
  useWallets: () => [],
};

const ParticleContext = createContext<ParticleContextValue>(defaultHooks);

let cachedHooks: ParticleContextValue | null = null;
let loadPromise: Promise<ParticleContextValue> | null = null;

async function loadParticleHooks(): Promise<ParticleContextValue> {
  if (cachedHooks) return cachedHooks;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    try {
      // Dynamic import to avoid bundling issues
      const connectkit = await import('@particle-network/connectkit');
      
      cachedHooks = {
        isReady: true,
        error: null,
        useAccount: connectkit.useAccount,
        useModal: connectkit.useModal,
        useDisconnect: connectkit.useDisconnect,
        useWallets: connectkit.useWallets as () => ParticleWallet[],
      };
      
      return cachedHooks;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.error('[useParticle] Failed to load hooks:', error);
      return {
        ...defaultHooks,
        error,
      };
    }
  })();

  return loadPromise;
}

export function ParticleHooksProvider({ children }: { children: ReactNode }) {
  const [hooks, setHooks] = useState<ParticleContextValue>(defaultHooks);

  useEffect(() => {
    loadParticleHooks().then(setHooks);
  }, []);

  return (
    <ParticleContext.Provider value={hooks}>
      {children}
    </ParticleContext.Provider>
  );
}

// Hook to check if Particle SDK is ready
export function useParticleReady() {
  const context = useContext(ParticleContext);
  return { isReady: context.isReady, error: context.error };
}

// Wrapper hooks that use the dynamic imports
export function useAccount() {
  const context = useContext(ParticleContext);
  return context.useAccount();
}

export function useModal() {
  const context = useContext(ParticleContext);
  return context.useModal();
}

export function useDisconnect() {
  const context = useContext(ParticleContext);
  return context.useDisconnect();
}

export function useWallets(): ParticleWallet[] {
  const context = useContext(ParticleContext);
  return context.useWallets();
}
