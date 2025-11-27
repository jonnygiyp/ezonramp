"use client";

import React, { useState, useEffect } from 'react';
import { ConnectKitProvider, createConfig } from '@particle-network/connectkit';
import { authWalletConnectors } from '@particle-network/connectkit/auth';
import { evmWalletConnectors } from '@particle-network/connectkit/evm';
import { EntryPosition, wallet } from '@particle-network/connectkit/wallet';
import { mainnet, polygon, base, arbitrum } from '@particle-network/connectkit/chains';

// Create config outside component to avoid recreation
const createParticleConfig = () => {
  return createConfig({
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
};

export const ParticleConnectkit = ({ children }: React.PropsWithChildren) => {
  const [config, setConfig] = useState<ReturnType<typeof createConfig> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Delay initialization to ensure all modules are loaded
    const initParticle = async () => {
      try {
        // Small delay to ensure WASM modules have time to initialize
        await new Promise(resolve => setTimeout(resolve, 100));
        const particleConfig = createParticleConfig();
        setConfig(particleConfig);
      } catch (err) {
        console.error('Failed to initialize Particle:', err);
        setError(err instanceof Error ? err.message : 'Failed to initialize wallet connection');
      }
    };

    initParticle();
  }, []);

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-red-500">Wallet connection error: {error}</p>
          <button 
            onClick={() => window.location.reload()} 
            className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        Loading wallet connection...
      </div>
    );
  }

  return <ConnectKitProvider config={config}>{children}</ConnectKitProvider>;
};
