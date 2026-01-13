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
  const [error, setError] = useState<Error | null>(null);
  const [loadingTime, setLoadingTime] = useState(0);

  useEffect(() => {
    // CRITICAL: Mark as mounted - SDK should ONLY load after this
    isMounted.current = true;
    
    // GUARD: Ensure we're in browser environment
    if (typeof window === 'undefined') {
      console.error('[ParticleConnectkit] Not in browser environment');
      return;
    }

    let timeoutId: ReturnType<typeof setTimeout>;
    let intervalId: ReturnType<typeof setInterval>;

    // Track loading time for debugging
    intervalId = setInterval(() => {
      if (isMounted.current) setLoadingTime((t) => t + 1);
    }, 1000);

    // Timeout after 20 seconds
    timeoutId = setTimeout(() => {
      if (isMounted.current && !isLoaded) {
        console.error('[ParticleConnectkit] SDK load timeout after 20s');
        setError(new Error('Wallet SDK took too long to load. Please refresh the page.'));
      }
    }, 20000);

    // Load SDK only after component has mounted (browser environment confirmed)
    loadParticleSDK()
      .then(() => {
        if (isMounted.current) {
          console.log('[ParticleConnectkit] SDK loaded and ready');
          setIsLoaded(true);
        }
      })
      .catch((err) => {
        console.error('[ParticleConnectkit] SDK load error:', err);
        if (isMounted.current) setError(err);
      });

    return () => {
      isMounted.current = false;
      clearTimeout(timeoutId);
      clearInterval(intervalId);
    };
  }, []); // Empty deps - only run once on mount

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center bg-background">
        <div className="max-w-md space-y-4">
          <div className="text-6xl">⚠️</div>
          <h1 className="text-xl font-semibold text-foreground">Wallet Connection Failed</h1>
          <p className="text-sm text-muted-foreground">
            {error.message || 'Failed to load wallet SDK. Please try again.'}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 transition-opacity"
          >
            Refresh Page
          </button>
        </div>
      </div>
    );
  }

  if (!isLoaded || !ConnectKitProvider || !particleConfig) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-3 bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent"></div>
        <div className="text-muted-foreground">Loading wallet...</div>
        {loadingTime > 3 && (
          <div className="text-xs text-muted-foreground">
            {loadingTime}s - This may take a moment on first load
          </div>
        )}
        {loadingTime > 10 && (
          <button
            onClick={() => window.location.reload()}
            className="mt-2 px-4 py-2 text-sm bg-secondary text-secondary-foreground rounded hover:opacity-90"
          >
            Refresh Page
          </button>
        )}
      </div>
    );
  }

  return <ConnectKitProvider config={particleConfig}>{children}</ConnectKitProvider>;
};
