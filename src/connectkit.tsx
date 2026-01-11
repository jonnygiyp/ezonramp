import React, { useState, useEffect, ReactNode } from 'react';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let ConnectKitProvider: React.ComponentType<any> | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let particleConfig: any = null;
let loadError: Error | null = null;
let loadPromise: Promise<void> | null = null;

async function loadParticleSDK() {
  if (loadPromise) return loadPromise;
  
  loadPromise = (async () => {
    try {
      // Ensure Buffer and global are available before loading SDK
      if (typeof window !== 'undefined') {
        if (!(window as unknown as { Buffer?: unknown }).Buffer) {
          const { Buffer } = await import('buffer');
          (window as unknown as { Buffer: typeof Buffer }).Buffer = Buffer;
        }
        if (!(window as unknown as { global?: unknown }).global) {
          (window as unknown as { global: typeof globalThis }).global = window;
        }
        if (!(window as unknown as { process?: unknown }).process) {
          (window as unknown as { process: { env: Record<string, string> } }).process = { env: {} };
        }
      }

      // Import core module first
      const connectkitModule = await import('@particle-network/connectkit');
      const { createConfig } = connectkitModule;
      ConnectKitProvider = connectkitModule.ConnectKitProvider;

      // Import chains before wallet connectors
      const chainsModule = await import('@particle-network/connectkit/chains');
      const { mainnet, polygon, base, arbitrum, solana } = chainsModule;

      // Import wallet module
      const walletModule = await import('@particle-network/connectkit/wallet');
      const { EntryPosition, wallet } = walletModule;

      // Import auth connectors
      const authModule = await import('@particle-network/connectkit/auth');
      const { authWalletConnectors } = authModule;

      // Import solana connectors
      const solanaModule = await import('@particle-network/connectkit/solana');
      const { solanaWalletConnectors } = solanaModule;

      // Import EVM connectors last (has most dependencies)
      const evmModule = await import('@particle-network/connectkit/evm');
      const { evmWalletConnectors } = evmModule;

      particleConfig = createConfig({
        projectId: 'e7041872-c6f2-4de1-826a-8c20f4d26e7f',
        clientKey: 'cQYG1BDRMOjRHHfoifZ10kiAXuHGbe5ypVetw2LV',
        appId: '38f0e5f3-50dd-459c-9016-783a347c30aa',
        initialChainId: {
          solana: 101,
        },
        appearance: {
          recommendedWallets: [
            { walletId: 'phantom', label: 'Recommended' },
            { walletId: 'metaMask', label: 'Popular' },
            { walletId: 'coinbaseWallet', label: 'Popular' },
          ],
          language: 'en-US',
          mode: 'auto',
        },
        walletConnectors: [
          authWalletConnectors({}),
          solanaWalletConnectors(),
          evmWalletConnectors({
            metadata: {
              name: 'EZOnRamp',
              icon: typeof window !== 'undefined' ? `${window.location.origin}/favicon.ico` : '',
              description: 'Buy crypto easily with EZOnRamp.',
              url: typeof window !== 'undefined' ? window.location.origin : '',
            },
          }),
        ],
        plugins: [
          wallet({
            visible: false,
            entryPosition: EntryPosition.BR,
          }),
        ],
        chains: [solana, mainnet, polygon, base, arbitrum],
      });
    } catch (err) {
      loadError = err instanceof Error ? err : new Error(String(err));
      console.error('[ParticleConnectkit] Failed to load SDK:', loadError);
      throw loadError;
    }
  })();

  return loadPromise;
}

export const ParticleConnectkit = ({ children }: { children: ReactNode }) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let mounted = true;

    loadParticleSDK()
      .then(() => {
        if (mounted) setIsLoaded(true);
      })
      .catch((err) => {
        if (mounted) setError(err);
      });

    return () => {
      mounted = false;
    };
  }, []);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center">
        <p className="text-destructive mb-2">Wallet connection unavailable</p>
        <p className="text-sm text-muted-foreground mb-4">
          {error.message || 'Failed to load wallet SDK'}
        </p>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-primary text-primary-foreground rounded"
        >
          Reload Page
        </button>
      </div>
    );
  }

  if (!isLoaded || !ConnectKitProvider || !particleConfig) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-pulse text-muted-foreground">Loading wallet...</div>
      </div>
    );
  }

  return <ConnectKitProvider config={particleConfig}>{children}</ConnectKitProvider>;
};
