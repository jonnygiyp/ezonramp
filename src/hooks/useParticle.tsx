// Re-export Particle hooks from SDK
// This file exists to provide a single import point and proper typing
// All components should import from here instead of directly from @particle-network/connectkit
//
// IMPORTANT: These hooks will ONLY work when called inside components rendered 
// within the ParticleConnectkit provider AFTER the SDK has fully loaded.
// The ParticleConnectkit component blocks rendering until the SDK is ready,
// so these hooks are safe to use in any child component.

export {
  useAccount,
  useModal,
  useDisconnect,
  useWallets,
} from '@particle-network/connectkit';

// Wallet type definition for useWallets
export interface ParticleWallet {
  chainId: number;
  accounts: readonly string[];
  connector?: unknown;
}
