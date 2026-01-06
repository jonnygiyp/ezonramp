"use client";

import { ConnectKitProvider, createConfig } from '@particle-network/connectkit';
import { authWalletConnectors } from '@particle-network/connectkit/auth';
import { evmWalletConnectors } from '@particle-network/connectkit/evm';
import { solanaWalletConnectors } from '@particle-network/connectkit/solana';
import { EntryPosition, wallet } from '@particle-network/connectkit/wallet';
import { mainnet, polygon, base, arbitrum, solana } from '@particle-network/connectkit/chains';
import React from 'react';

const config = createConfig({
  projectId: 'e7041872-c6f2-4de1-826a-8c20f4d26e7f',
  clientKey: 'cQYG1BDRMOjRHHfoifZ10kiAXuHGbe5ypVetw2LV',
  appId: '38f0e5f3-50dd-459c-9016-783a347c30aa',

  // Default to Solana mainnet (101) when user logs in
  initialChainId: {
    solana: 101, // Solana mainnet
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
    // Solana wallet connectors (listed first for priority)
    solanaWalletConnectors(),
    // EVM wallet connectors
    evmWalletConnectors({
      metadata: {
        name: 'EZOnRamp',
        icon: typeof window !== 'undefined' ? `${window.location.origin}/favicon.ico` : '',
        description: 'Buy crypto easily with EZOnRamp.',
        url: typeof window !== 'undefined' ? window.location.origin : '',
      },
    }),
    // Social/email login connectors
    authWalletConnectors({}),
  ],

  plugins: [
    wallet({
      visible: false,
      entryPosition: EntryPosition.BR,
    }),
  ],

  // Include both Solana and EVM chains
  chains: [solana, mainnet, polygon, base, arbitrum],
});

export const ParticleConnectkit = ({ children }: React.PropsWithChildren) => {
  return <ConnectKitProvider config={config}>{children}</ConnectKitProvider>;
};
