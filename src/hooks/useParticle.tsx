// Re-export Particle hooks from SDK with safety wrappers
// This file exists to provide a single import point and proper typing
// All components should import from here instead of directly from @particle-network/connectkit

import {
  useAccount as useAccountBase,
  useModal as useModalBase,
  useDisconnect as useDisconnectBase,
  useWallets as useWalletsBase,
} from '@particle-network/connectkit';

// Wallet type definition for useWallets
export interface ParticleWallet {
  chainId: number;
  accounts: readonly string[];
  connector?: unknown;
}

// Safe wrapper for useAccount - returns safe defaults if SDK not ready
export function useAccount() {
  try {
    return useAccountBase();
  } catch {
    // Return safe defaults when provider isn't ready
    return {
      isConnected: false,
      isConnecting: false,
      address: undefined,
      addresses: [],
      chain: undefined,
      chainId: undefined,
      connector: undefined,
      isDisconnected: true,
      isReconnecting: false,
      status: 'disconnected' as const,
    };
  }
}

// Safe wrapper for useModal
export function useModal() {
  try {
    return useModalBase();
  } catch {
    return {
      isOpen: false,
      setOpen: () => {},
    };
  }
}

// Safe wrapper for useDisconnect
export function useDisconnect() {
  try {
    return useDisconnectBase();
  } catch {
    return {
      disconnect: () => {},
      disconnectAsync: async () => {},
      isPending: false,
      isSuccess: false,
      isError: false,
      error: null,
      reset: () => {},
    };
  }
}

// Safe wrapper for useWallets
export function useWallets(): ParticleWallet[] {
  try {
    return useWalletsBase() as ParticleWallet[];
  } catch {
    return [];
  }
}
