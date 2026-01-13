import React, { useState, useEffect, ReactNode, useRef } from 'react';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let ConnectKitProvider: React.ComponentType<any> | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let particleConfig: any = null;
let loadError: Error | null = null;
let loadPromise: Promise<void> | null = null;

/**
 * CRITICAL: Particle SDK must ONLY be loaded in browser environment AFTER mount.
 * The "Class extends value undefined" error occurs when:
 * 1. SDK is loaded during SSR/build time
 * 2. SDK is loaded before browser globals (Buffer, crypto, TextEncoder) exist
 * 3. SDK classes are tree-shaken or split across chunks
 */
async function loadParticleSDK(): Promise<void> {
  // GUARD: Absolutely must be in browser
  if (typeof window === 'undefined') {
    throw new Error('Particle SDK can only be loaded in browser environment');
  }

  // Return existing promise if already loading/loaded
  if (loadPromise) return loadPromise;
  
  loadPromise = (async () => {
    try {
      console.log('[ParticleConnectkit] Starting SDK load...');
      
      // Step 1: Ensure ALL browser globals exist before ANY SDK import
      // Import buffer dynamically to ensure it works with the build
      const bufferModule = await import('buffer');
      const Buffer = bufferModule.Buffer;
      
      // Set Buffer globally
      (window as unknown as { Buffer: typeof Buffer }).Buffer = Buffer;
      (globalThis as unknown as { Buffer: typeof Buffer }).Buffer = Buffer;
      
      // Set global reference
      (window as unknown as { global: typeof globalThis }).global = window;
      
      // Set process.env
      if (!(window as unknown as { process?: { env: Record<string, string> } }).process) {
        (window as unknown as { process: { env: Record<string, string> } }).process = { env: {} };
      }

      // Verify crypto and TextEncoder exist
      if (!window.crypto) {
        throw new Error('window.crypto is not available');
      }
      if (typeof TextEncoder === 'undefined') {
        throw new Error('TextEncoder is not available');
      }

      console.log('[ParticleConnectkit] Browser globals ready, loading SDK modules...');

      // Step 2: Import core module first
      const connectkitModule = await import('@particle-network/connectkit');
      const { createConfig } = connectkitModule;
      ConnectKitProvider = connectkitModule.ConnectKitProvider;

      if (!ConnectKitProvider) {
        throw new Error('ConnectKitProvider not found in module');
      }

      // Step 3: Import chains before wallet connectors
      const chainsModule = await import('@particle-network/connectkit/chains');
      const { mainnet, polygon, base, arbitrum, solana } = chainsModule;

      // Step 4: Import wallet module
      const walletModule = await import('@particle-network/connectkit/wallet');
      const { EntryPosition, wallet } = walletModule;

      // Step 5: Import auth connectors
      const authModule = await import('@particle-network/connectkit/auth');
      const { authWalletConnectors } = authModule;

      // Step 6: Import solana connectors
      const solanaModule = await import('@particle-network/connectkit/solana');
      const { solanaWalletConnectors } = solanaModule;

      // Step 7: Import EVM connectors last (has most dependencies)
      const evmModule = await import('@particle-network/connectkit/evm');
      const { evmWalletConnectors } = evmModule;

      console.log('[ParticleConnectkit] All modules loaded, creating config...');

      // Step 8: Create config only after all modules are loaded
      particleConfig = createConfig({
        projectId: 'e7041872-c6f2-4de1-826a-8c20f4d26e7f',
        clientKey: 'cQYG1BDRMOjRHHfoifZ10kiAXuHGbe5ypVetw2LV',
        appId: '63ee90ef-4426-44ad-9a67-d6984fc92706',
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
              icon: `${window.location.origin}/favicon.ico`,
              description: 'Buy crypto easily with EZOnRamp.',
              url: window.location.origin,
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
      
      console.log('[ParticleConnectkit] Config created successfully');
    } catch (err) {
      loadError = err instanceof Error ? err : new Error(String(err));
      console.error('[ParticleConnectkit] Failed to load SDK:', loadError);
      // Reset promise so retry is possible
      loadPromise = null;
      throw loadError;
    }
  })();

  return loadPromise;
}

export const ParticleConnectkit = ({ children }: { children: ReactNode }) => {
  const isMounted = useRef(false);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    isMounted.current = true;
    
    if (typeof window === 'undefined') return;

    loadParticleSDK()
      .then(() => {
        if (isMounted.current) {
          console.log('[ParticleConnectkit] SDK loaded and ready');
          setIsLoaded(true);
        }
      })
      .catch((err) => {
        console.error('[ParticleConnectkit] SDK load error:', err);
        // Don't block the app - just log the error
      });

    return () => {
      isMounted.current = false;
    };
  }, []);

  // Render children immediately - don't block on SDK loading
  if (isLoaded && ConnectKitProvider && particleConfig) {
    return <ConnectKitProvider config={particleConfig}>{children}</ConnectKitProvider>;
  }

  // Render children without wallet provider while loading
  // This allows the app to be usable while SDK loads in background
  return <>{children}</>;
};
