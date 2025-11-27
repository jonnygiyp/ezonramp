"use client";

import { ConnectKitProvider, createConfig } from '@particle-network/connectkit';
import { authWalletConnectors } from '@particle-network/connectkit/auth';
import { evmWalletConnectors } from '@particle-network/connectkit/evm';
import { EntryPosition, wallet } from '@particle-network/connectkit/wallet';
import { mainnet, polygon, base, arbitrum } from '@particle-network/connectkit/chains';
import React from 'react';

const config = createConfig({
  projectId: 'e7041872-c6f2-4de1-826a-8c20f4d26e7f',
  clientKey: 'cQYG1BDRMOjRHHfoifZ10kiAXuHGbe5ypVetw2LV',
  appId: 'e7041872-c6f2-4de1-826a-8c20f4d26e7f',

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
    authWalletConnectors({
      authTypes: ['email', 'google', 'twitter', 'discord', 'github', 'apple'],
    }),
  ],

  plugins: [
    wallet({
      visible: true,
      entryPosition: EntryPosition.BR,
    }),
  ],

  chains: [mainnet, polygon, base, arbitrum],
});

export const ParticleConnectkit = ({ children }: React.PropsWithChildren) => {
  return <ConnectKitProvider config={config}>{children}</ConnectKitProvider>;
};
