// Re-export Particle hooks from SDK
// This file exists to provide a single import point and proper typing
// All components should import from here instead of directly from @particle-network/connectkit

// Wallet type definition for useWallets
export interface ParticleWallet {
  chainId: number;
  accounts: readonly string[];
  connector?: unknown;
}

// Re-export hooks directly from the SDK
// These MUST only be used within components rendered inside ParticleConnectkit provider
export {
  useAccount,
  useModal,
  useDisconnect,
  useWallets,
} from '@particle-network/connectkit';
