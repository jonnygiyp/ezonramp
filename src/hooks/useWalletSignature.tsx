import { useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

interface WalletVerificationState {
  isVerified: boolean;
  isVerifying: boolean;
  walletAddress: string | null;
  verifiedAt: number | null;
}

type SignatureEncoding = "base64" | "base58" | "bytes";

type SignaturePayload = string | number[]; // string for base64/base58; number[] for JSON-safe bytes

export interface WalletSignatureResult {
  signature: SignaturePayload;
  signatureEncoding: SignatureEncoding;
  message: string;
  timestamp: number;
  challengeToken: string;
}

interface UseWalletSignatureReturn {
  verificationState: WalletVerificationState;
  requestSignature: (walletAddress: string) => Promise<WalletSignatureResult>;
  markVerified: (walletAddress: string) => void;
  resetVerification: () => void;
  isWalletVerified: (walletAddress: string) => boolean;
}

// Cache verification for 30 minutes to avoid repeated signing prompts
const VERIFICATION_CACHE_TTL = 30 * 60 * 1000;

function uint8ToBase64(bytes: Uint8Array): string {
  // signatures are small (64 bytes), safe to spread
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function normalizeSignature(output: unknown): {
  signature: SignaturePayload;
  signatureEncoding: SignatureEncoding;
  byteLength?: number;
  detectedFormat: string;
} {
  // Direct Uint8Array
  if (output instanceof Uint8Array) {
    return {
      signature: uint8ToBase64(output),
      signatureEncoding: "base64",
      byteLength: output.length,
      detectedFormat: "Uint8Array",
    };
  }

  // JSON-safe byte array
  if (Array.isArray(output) && output.every((v) => typeof v === "number")) {
    const bytes = Uint8Array.from(output);
    return {
      signature: uint8ToBase64(bytes),
      signatureEncoding: "base64",
      byteLength: bytes.length,
      detectedFormat: "number[]",
    };
  }

  // Common wrappers
  if (output && typeof output === "object") {
    const anyOut = output as any;

    if (anyOut.signature != null) {
      const inner = normalizeSignature(anyOut.signature);
      return { ...inner, detectedFormat: `object.signature -> ${inner.detectedFormat}` };
    }

    // Buffer-like { type: 'Buffer', data: number[] }
    if (anyOut.type === "Buffer" && Array.isArray(anyOut.data)) {
      const inner = normalizeSignature(anyOut.data);
      return { ...inner, detectedFormat: `Buffer.data -> ${inner.detectedFormat}` };
    }

    // { data: number[] }
    if (Array.isArray(anyOut.data)) {
      const inner = normalizeSignature(anyOut.data);
      return { ...inner, detectedFormat: `object.data -> ${inner.detectedFormat}` };
    }
  }

  // String signatures
  if (typeof output === "string") {
    const trimmed = output.trim();

    if (trimmed.startsWith("base64:")) {
      const sig = trimmed.slice("base64:".length);
      return {
        signature: sig,
        signatureEncoding: "base64",
        detectedFormat: "string(base64:) ",
      };
    }

    if (trimmed.startsWith("base58:")) {
      const sig = trimmed.slice("base58:".length);
      return {
        signature: sig,
        signatureEncoding: "base58",
        detectedFormat: "string(base58:) ",
      };
    }

    // Minimal heuristic on the client (backend requires explicit encoding)
    const looksBase64 = /[+/=]/.test(trimmed);
    return {
      signature: trimmed,
      signatureEncoding: looksBase64 ? "base64" : "base58",
      detectedFormat: looksBase64 ? "string(heuristic base64)" : "string(heuristic base58)",
    };
  }

  throw new Error("Unexpected signature format from wallet");
}

/**
 * Hook for cryptographic wallet signature verification.
 * - Challenge is generated ONLY on the backend and returned verbatim.
 * - Client signs that exact string and sends it back for server-side verification.
 */
export function useWalletSignature(): UseWalletSignatureReturn {
  const [verificationState, setVerificationState] = useState<WalletVerificationState>({
    isVerified: false,
    isVerifying: false,
    walletAddress: null,
    verifiedAt: null,
  });

  const verifiedWalletsRef = useRef<Map<string, number>>(new Map());

  const isWalletVerified = useCallback((walletAddress: string): boolean => {
    const verifiedAt = verifiedWalletsRef.current.get(walletAddress.toLowerCase());
    if (!verifiedAt) return false;

    const now = Date.now();
    if (now - verifiedAt > VERIFICATION_CACHE_TTL) {
      verifiedWalletsRef.current.delete(walletAddress.toLowerCase());
      return false;
    }

    return true;
  }, []);

  const markVerified = useCallback((walletAddress: string) => {
    const verifiedAt = Date.now();
    verifiedWalletsRef.current.set(walletAddress.toLowerCase(), verifiedAt);
    setVerificationState({
      isVerified: true,
      isVerifying: false,
      walletAddress,
      verifiedAt,
    });
  }, []);

  const requestSignature = useCallback(async (walletAddress: string): Promise<WalletSignatureResult> => {
    setVerificationState({
      isVerified: false,
      isVerifying: true,
      walletAddress,
      verifiedAt: null,
    });

    try {
      // 1) Get server-generated challenge (verbatim)
      const { data, error } = await supabase.functions.invoke("wallet-auth", {
        body: {
          action: "challenge",
          walletAddress,
        },
      });

      if (error) throw error;

      const challenge = data?.challenge;
      if (!challenge?.message || !challenge?.timestamp || !challenge?.token) {
        throw new Error("Failed to get wallet challenge from server");
      }

      const message: string = challenge.message;
      const timestamp: number = challenge.timestamp;
      const challengeToken: string = challenge.token;

      console.log("[WalletSignature] Challenge received", {
        messageChars: message.length,
        timestamp,
      });

      // 2) Get Solana provider from Particle Network
      const solanaProvider = (window as any).particle?.solana || (window as any).solana;
      if (!solanaProvider) {
        throw new Error("Wallet provider not available. Please ensure your wallet is connected.");
      }

      // 3) Sign UTF-8 bytes of the exact challenge string
      const messageBytes = new TextEncoder().encode(message);

      let signResult: unknown;
      if (typeof solanaProvider.signMessage === "function") {
        signResult = await solanaProvider.signMessage(messageBytes, "utf8");
      } else if (typeof solanaProvider.request === "function") {
        signResult = await solanaProvider.request({
          method: "signMessage",
          params: {
            // IMPORTANT: send the original message string, not a base58-encoded payload
            message,
            display: "utf8",
          },
        });
      } else {
        throw new Error("Wallet does not support message signing");
      }

      const normalized = normalizeSignature(signResult);

      console.log("[WalletSignature] Signature captured", {
        detectedFormat: normalized.detectedFormat,
        signatureEncoding: normalized.signatureEncoding,
        signatureByteLength: normalized.byteLength,
      });

      setVerificationState((prev) => ({ ...prev, isVerifying: false }));

      return {
        signature: normalized.signature,
        signatureEncoding: normalized.signatureEncoding,
        message,
        timestamp,
        challengeToken,
      };
    } catch (error) {
      console.error("[WalletSignature] Signing failed:", error);

      setVerificationState({
        isVerified: false,
        isVerifying: false,
        walletAddress,
        verifiedAt: null,
      });

      if (error instanceof Error) {
        if (error.message.includes("User rejected") || error.message.includes("cancelled")) {
          throw new Error("Signature request was cancelled. Please approve the signature to continue.");
        }
        throw error;
      }

      throw new Error("Failed to sign verification message");
    }
  }, []);

  const resetVerification = useCallback(() => {
    setVerificationState({
      isVerified: false,
      isVerifying: false,
      walletAddress: null,
      verifiedAt: null,
    });
    verifiedWalletsRef.current.clear();
  }, []);

  return {
    verificationState,
    requestSignature,
    markVerified,
    resetVerification,
    isWalletVerified,
  };
}
