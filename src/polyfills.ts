// Polyfills for browser compatibility - must be imported FIRST
import { Buffer } from 'buffer';

// Ensure Buffer is globally available before any SDK loads
if (typeof window !== 'undefined') {
  (window as unknown as { Buffer: typeof Buffer }).Buffer = Buffer;
  (window as unknown as { global: typeof globalThis }).global = window;
  
  // Ensure process.env exists
  if (typeof (window as unknown as { process: { env: Record<string, string> } }).process === 'undefined') {
    (window as unknown as { process: { env: Record<string, string> } }).process = { env: {} };
  }
}

// Also set on globalThis for module contexts
if (typeof globalThis !== 'undefined') {
  (globalThis as unknown as { Buffer: typeof Buffer }).Buffer = Buffer;
}

export { Buffer };
