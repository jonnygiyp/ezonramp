// Polyfills for browser compatibility - must be imported FIRST
// Use default import to work with both ESM and CommonJS builds
import BufferModule from 'buffer';

const Buffer = BufferModule.Buffer;

// Ensure Buffer is globally available before any SDK loads
if (typeof window !== 'undefined') {
  (window as unknown as { Buffer: typeof Buffer }).Buffer = Buffer;
  (window as unknown as { global: typeof globalThis }).global = window;
  
  // Ensure process.env exists
  if (typeof (window as unknown as { process: { env: Record<string, string> } }).process === 'undefined') {
    (window as unknown as { process: { env: Record<string, string> } }).process = { env: {} };
  }
  
  // Ensure crypto is available (for older browsers)
  if (!(window as unknown as { crypto?: Crypto }).crypto) {
    console.warn('[Polyfills] crypto not available');
  }
  
  // Ensure TextEncoder is available
  if (typeof TextEncoder === 'undefined') {
    console.warn('[Polyfills] TextEncoder not available');
  }
}

// Also set on globalThis for module contexts
if (typeof globalThis !== 'undefined') {
  (globalThis as unknown as { Buffer: typeof Buffer }).Buffer = Buffer;
}

export { Buffer };
