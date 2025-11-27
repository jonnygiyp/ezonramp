"use client";

import React, { useState, useEffect, lazy, Suspense } from 'react';

// Lazy load the Particle components to delay WASM initialization
const LazyParticleProvider = lazy(() => 
  import('@particle-network/connectkit').then(module => {
    const { ConnectKitProvider, createConfig } = module;
    
    // Import chain connectors
    return Promise.all([
      import('@particle-network/connectkit/auth'),
      import('@particle-network/connectkit/evm'),
      import('@particle-network/connectkit/wallet'),
      import('@particle-network/connectkit/chains'),
    ]).then(([authModule, evmModule, walletModule, chainsModule]) => {
      const { authWalletConnectors } = authModule;
      const { evmWalletConnectors } = evmModule;
      const { wallet, EntryPosition } = walletModule;
      const { mainnet, polygon, base, arbitrum } = chainsModule;

      const config = createConfig({
        projectId: 'e7041872-c6f2-4de1-826a-8c20f4d26e7f',
        clientKey: 'cQYG1BDRMOjRHHfoifZ10kiAXuHGbe5ypVetw2LV',
        appId: '38f0e5f3-50dd-459c-9016-783a347c30aa',

        appearance: {
          recommendedWallets: [
            { walletId: 'metaMask', label: 'Recommended' },
            { walletId: 'coinbaseWallet', label: 'Popular' },
          ],
          language: 'en-US',
          mode: 'auto',
        },

        walletConnectors: [
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
            visible: true,
            entryPosition: EntryPosition.BR,
          }),
        ],

        chains: [mainnet, polygon, base, arbitrum],
      });

      // Return a component that wraps children with ConnectKitProvider
      return {
        default: ({ children }: { children: React.ReactNode }) => (
          <ConnectKitProvider config={config}>{children}</ConnectKitProvider>
        ),
      };
    });
  })
);

export const ParticleConnectkit = ({ children }: React.PropsWithChildren) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Wait for the DOM to be fully loaded before initializing Particle
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        Loading...
      </div>
    );
  }

  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen">
          Loading wallet connection...
        </div>
      }
    >
      <LazyParticleProvider>{children}</LazyParticleProvider>
    </Suspense>
  );
};
