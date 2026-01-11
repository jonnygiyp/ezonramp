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
      // Ensure Buffer is available before loading SDK
      if (typeof window !== 'undefined' && !(window as unknown as { Buffer?: unknown }).Buffer) {
        const { Buffer } = await import('buffer');
        (window as unknown as { Buffer: typeof Buffer }).Buffer = Buffer;
        (window as unknown as { global: typeof globalThis }).global = window;
      }

      // Dynamic imports to ensure proper module resolution order
      const [
        connectkitModule,
        authModule,
        evmModule,
        solanaModule,
        walletModule,
        chainsModule,
      ] = await Promise.all([
        import('@particle-network/connectkit'),
        import('@particle-network/connectkit/auth'),
        import('@particle-network/connectkit/evm'),
        import('@particle-network/connectkit/solana'),
        import('@particle-network/connectkit/wallet'),
        import('@particle-network/connectkit/chains'),
      ]);

      const { createConfig } = connectkitModule;
      const { authWalletConnectors } = authModule;
      const { evmWalletConnectors } = evmModule;
      const { solanaWalletConnectors } = solanaModule;
      const { EntryPosition, wallet } = walletModule;
      const { mainnet, polygon, base, arbitrum, solana } = chainsModule;

      ConnectKitProvider = connectkitModule.ConnectKitProvider;

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
          solanaWalletConnectors(),
          evmWalletConnectors({
            metadata: {
              name: 'EZOnRamp',
              icon: typeof window !== 'undefined' ? `${window.location.origin}/favicon.ico` : '',
              description: 'Buy crypto easily with EZOnRamp.',
              url: typeof window !== 'undefined' ? window.location.origin : '',
            },
          }),
          authWalletConnectors({}),
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
