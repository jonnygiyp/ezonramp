// Polyfills for browser compatibility - must be imported FIRST
import { Buffer } from "buffer";

type GlobalLike = {
  Buffer?: typeof Buffer;
  global?: unknown;
  process?: { env?: Record<string, string> };
};

function ensureNodeGlobals(target: GlobalLike) {
  target.Buffer = Buffer;
  target.global = target as unknown as typeof globalThis;
  if (typeof target.process === "undefined") {
    target.process = { env: {} };
  }
  if (!target.process.env) {
    target.process.env = {};
  }
}

// Main window context
if (typeof window !== "undefined") {
  ensureNodeGlobals(window as unknown as GlobalLike);
}

// Module / worker-like contexts
if (typeof globalThis !== "undefined") {
  ensureNodeGlobals(globalThis as unknown as GlobalLike);
}

export { Buffer };
