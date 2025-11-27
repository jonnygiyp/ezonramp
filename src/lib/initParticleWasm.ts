// Custom WASM initialization for Particle Network
// This pre-initializes the WASM module before Particle loads

let wasmInitialized = false;
let wasmInitPromise: Promise<void> | null = null;

export async function initParticleWasm(): Promise<void> {
  if (wasmInitialized) return;
  
  if (wasmInitPromise) {
    return wasmInitPromise;
  }

  wasmInitPromise = (async () => {
    try {
      // Try to import and initialize the thresh-sig module
      const threshSig = await import('@particle-network/thresh-sig');
      
      if (typeof threshSig.initWasm === 'function') {
        await threshSig.initWasm();
        console.log('Particle WASM initialized successfully');
      }
      
      wasmInitialized = true;
    } catch (error) {
      console.error('Failed to initialize Particle WASM:', error);
      // Don't throw - let Particle try its own initialization
    }
  })();

  return wasmInitPromise;
}
