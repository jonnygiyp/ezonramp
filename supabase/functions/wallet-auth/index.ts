import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import bs58 from "https://esm.sh/bs58@6.0.0";
import nacl from "https://esm.sh/tweetnacl@1.0.3";
import {
  getCorsHeaders,
  validateOrigin,
  getClientId,
  logSecurityEvent,
  errorResponse,
  successResponse,
} from "../_shared/auth.ts";

// Rate limiting map (in-memory, resets on function restart)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT = 10; // requests per minute
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute

// Signature timestamp validity window (5 minutes)
const SIGNATURE_TIMESTAMP_WINDOW = 5 * 60 * 1000;

function checkRateLimit(clientId: string): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(clientId);

  if (!record || now > record.resetTime) {
    rateLimitMap.set(clientId, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return true;
  }

  if (record.count >= RATE_LIMIT) {
    return false;
  }

  record.count++;
  return true;
}

function base64ToBytes(base64: string): Uint8Array {
  // Allow base64url input
  let b64 = base64.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4;
  if (pad) b64 += "=".repeat(4 - pad);

  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64Url(bytes: ArrayBuffer): string {
  const u8 = new Uint8Array(bytes);
  let binary = "";
  for (let i = 0; i < u8.length; i++) binary += String.fromCharCode(u8[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function hmacSha256Base64Url(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );

  return bytesToBase64Url(sig);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

function createChallengeMessage(walletAddress: string, timestamp: number, nonce: string): string {
  // IMPORTANT: This string must be treated as immutable/verbatim.
  // It is generated ONCE here and the exact same string must be signed and returned.
  return `EzOnramp Wallet Verification\n\nI am signing this message to verify ownership of my wallet for secure crypto purchases.\n\nWallet: ${walletAddress}\nTimestamp: ${timestamp}\nNonce: ${nonce}\n\nThis signature will not trigger any blockchain transaction or cost any gas fees.`;
}

type SignatureEncoding = "base64" | "base58" | "bytes";

function decodeSignature(
  signature: unknown,
  signatureEncoding: SignatureEncoding | undefined,
): { bytes?: Uint8Array; format: string; error?: string } {
  // Uint8Array (rare over JSON, but handle it)
  if (signature instanceof Uint8Array) {
    return { bytes: signature, format: "Uint8Array" };
  }

  // JSON-safe byte arrays
  if (Array.isArray(signature) && signature.every((v) => typeof v === "number")) {
    return { bytes: Uint8Array.from(signature), format: "number[]" };
  }

  if (signature && typeof signature === "object") {
    const anySig = signature as any;

    // Buffer-like
    if (anySig.type === "Buffer" && Array.isArray(anySig.data)) {
      return { bytes: Uint8Array.from(anySig.data), format: "Buffer.data" };
    }

    if (Array.isArray(anySig.data)) {
      return { bytes: Uint8Array.from(anySig.data), format: "object.data" };
    }
  }

  if (typeof signature === "string") {
    if (!signatureEncoding) {
      return {
        format: "string(unknown)",
        error:
          "Signature encoding is required (base64/base58) to avoid format assumptions",
      };
    }

    if (signatureEncoding === "base64") {
      return { bytes: base64ToBytes(signature), format: "string(base64)" };
    }

    if (signatureEncoding === "base58") {
      try {
        return { bytes: bs58.decode(signature), format: "string(base58)" };
      } catch {
        return { format: "string(base58)", error: "Invalid base58 signature" };
      }
    }

    return { format: `string(${signatureEncoding})`, error: "Unsupported signature encoding" };
  }

  return { format: typeof signature, error: "Unsupported signature type" };
}

/**
 * Verify an Ed25519 signature from a Solana wallet.
 * - Uses the exact original message string received from the client (UTF-8 bytes).
 * - Public key is base58 decoded.
 * - Signature normalization is explicit: base64/base58/bytes.
 */
async function verifySolanaSignature(args: {
  walletAddress: string;
  signature: unknown;
  signatureEncoding: SignatureEncoding | undefined;
  message: string;
}): Promise<{ valid: boolean; error?: string }> {
  const { walletAddress, signature, signatureEncoding, message } = args;

  try {
    let publicKeyBytes: Uint8Array;
    try {
      publicKeyBytes = bs58.decode(walletAddress);
    } catch {
      return { valid: false, error: "Invalid Solana wallet address" };
    }

    const decoded = decodeSignature(signature, signatureEncoding);
    console.log("[WALLET_AUTH] Signature decode", {
      detectedFormat: decoded.format,
      signatureEncoding,
      signatureBytes: decoded.bytes?.length,
      publicKeyBytes: publicKeyBytes.length,
    });

    if (decoded.error) return { valid: false, error: decoded.error };
    if (!decoded.bytes) return { valid: false, error: "Invalid signature" };

    const signatureBytes = decoded.bytes;

    const messageBytes = new TextEncoder().encode(message);
    console.log("[WALLET_AUTH] Verify lengths", {
      messageChars: message.length,
      messageBytes: messageBytes.length,
      signatureBytes: signatureBytes.length,
      publicKeyBytes: publicKeyBytes.length,
    });

    if (publicKeyBytes.length !== 32) {
      return { valid: false, error: "Invalid Solana wallet address" };
    }

    if (signatureBytes.length !== 64) {
      return { valid: false, error: "Invalid signature length" };
    }

    const isValid = nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);
    if (!isValid) {
      return { valid: false, error: "Signature verification failed" };
    }

    console.log("[WALLET_AUTH] Signature verified successfully for:", walletAddress.slice(0, 8));
    return { valid: true };
  } catch (error) {
    console.error("[WALLET_AUTH] Signature verification error:", error);
    return { valid: false, error: "Signature verification failed" };
  }
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin");
  const corsHeaders = getCorsHeaders(origin);

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Validate origin
  const originError = validateOrigin(origin, corsHeaders);
  if (originError) return originError;

  // Rate limiting
  const clientId = getClientId(req);
  if (!checkRateLimit(clientId)) {
    logSecurityEvent("WALLET_AUTH_RATE_LIMITED", { clientId });
    return errorResponse(corsHeaders, "Too many requests. Please try again later.", 429);
  }

  if (req.method !== "POST") {
    return errorResponse(corsHeaders, "Method not allowed", 405);
  }

  try {
    const body = await req.json();
    const {
      action,
      walletAddress,
      walletType,
      particleUserId,
      signature,
      signatureEncoding,
      message,
      timestamp,
      challengeToken,
    } = body;

    // Validate walletAddress
    if (!walletAddress || typeof walletAddress !== "string") {
      return errorResponse(corsHeaders, "Wallet address is required", 400);
    }

    // Validate wallet address format (Solana or EVM)
    const isSolanaAddress = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(walletAddress);
    const isEvmAddress = /^0x[a-fA-F0-9]{40}$/.test(walletAddress);

    if (!isSolanaAddress && !isEvmAddress) {
      return errorResponse(corsHeaders, "Invalid wallet address format", 400);
    }

    // ============================================================
    // CHALLENGE ISSUANCE (NO RECONSTRUCTION) - backend generates ONCE
    // ============================================================
    if (action === "challenge") {
      if (!isSolanaAddress) {
        return errorResponse(corsHeaders, "Only Solana wallet verification is supported", 400);
      }

      const secret = Deno.env.get("CALLBACK_SECRET") || "";
      if (!secret) {
        console.error("[WALLET_AUTH] Missing CALLBACK_SECRET");
        return errorResponse(corsHeaders, "Server configuration error", 500);
      }

      const ts = Date.now();
      const nonce = crypto.randomUUID();
      const challengeMessage = createChallengeMessage(walletAddress, ts, nonce);

      // Token binds the *exact* message and timestamp; any byte change invalidates it.
      const token = await hmacSha256Base64Url(secret, `${ts}.${challengeMessage}`);

      console.log("[WALLET_AUTH] Challenge issued", {
        wallet: walletAddress.slice(0, 8),
        messageChars: challengeMessage.length,
      });

      return successResponse(corsHeaders, {
        success: true,
        challenge: {
          message: challengeMessage,
          timestamp: ts,
          nonce,
          token,
        },
      });
    }

    // ============================================================
    // SIGNATURE VERIFICATION - Required for wallet ownership proof
    // ============================================================
    if (!signature || typeof message !== "string") {
      logSecurityEvent("WALLET_AUTH_MISSING_SIGNATURE", {
        clientId,
        wallet: walletAddress.slice(0, 8),
      });
      return errorResponse(corsHeaders, "Wallet signature and message are required", 400);
    }

    if (!isSolanaAddress) {
      logSecurityEvent("WALLET_AUTH_EVM_NOT_SUPPORTED", {
        clientId,
        wallet: walletAddress.slice(0, 8),
      });
      return errorResponse(corsHeaders, "EVM wallet verification not yet supported", 400);
    }

    // Ensure challenge token is present to avoid server-side inference/reconstruction.
    if (!challengeToken || typeof challengeToken !== "string") {
      return errorResponse(corsHeaders, "Challenge token is required", 400);
    }

    const secret = Deno.env.get("CALLBACK_SECRET") || "";
    if (!secret) {
      console.error("[WALLET_AUTH] Missing CALLBACK_SECRET");
      return errorResponse(corsHeaders, "Server configuration error", 500);
    }

    // Timestamp must be provided and within window
    const ts = Number(timestamp);
    if (!Number.isFinite(ts)) {
      return errorResponse(corsHeaders, "Invalid timestamp", 400);
    }

    const now = Date.now();
    if (Math.abs(now - ts) > SIGNATURE_TIMESTAMP_WINDOW) {
      return errorResponse(corsHeaders, "Signature timestamp expired. Please sign again.", 401);
    }

    // Verify challenge token binds exact message+timestamp (no reconstruction)
    const expectedToken = await hmacSha256Base64Url(secret, `${ts}.${message}`);
    if (!timingSafeEqual(expectedToken, challengeToken)) {
      logSecurityEvent("WALLET_AUTH_CHALLENGE_TOKEN_MISMATCH", {
        clientId,
        wallet: walletAddress.slice(0, 8),
      });
      return errorResponse(corsHeaders, "Challenge mismatch", 401);
    }

    console.log("[WALLET_AUTH] Challenge token verified", {
      wallet: walletAddress.slice(0, 8),
      signatureEncoding,
    });

    const verifyResult = await verifySolanaSignature({
      walletAddress,
      signature,
      signatureEncoding,
      message,
    });

    if (!verifyResult.valid) {
      logSecurityEvent("WALLET_AUTH_SIGNATURE_INVALID", {
        clientId,
        wallet: walletAddress.slice(0, 8),
        error: verifyResult.error,
      });
      return errorResponse(corsHeaders, verifyResult.error || "Wallet signature verification failed", 401);
    }

    console.log(`[WALLET_AUTH] Wallet ownership verified for: ${walletAddress.slice(0, 8)}...`);

    // ============================================================
    // USER CREATION / RETRIEVAL
    // ============================================================
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("[WALLET_AUTH] Missing Supabase configuration");
      return errorResponse(corsHeaders, "Server configuration error", 500);
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const walletEmail = `${walletAddress.toLowerCase()}@wallet.ezonramp.local`;

    const { data: existingUsers, error: listError } = await supabaseAdmin.auth.admin.listUsers();
    if (listError) {
      console.error("[WALLET_AUTH] Error listing users:", listError);
      return errorResponse(corsHeaders, "Failed to check existing users", 500);
    }

    let userId: string;
    const existingUser = existingUsers.users.find((u) => u.email === walletEmail);

    if (existingUser) {
      userId = existingUser.id;

      await supabaseAdmin.auth.admin.updateUserById(userId, {
        user_metadata: {
          wallet_address: walletAddress,
          wallet_type: walletType || "particle",
          particle_user_id: particleUserId,
          wallet_verified: true,
          last_signature_verified_at: new Date().toISOString(),
        },
      });

      console.log(`[WALLET_AUTH] Found existing user for wallet: ${walletAddress.slice(0, 8)}...`);
    } else {
      const randomPassword = crypto.randomUUID() + crypto.randomUUID();

      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: walletEmail,
        password: randomPassword,
        email_confirm: true,
        user_metadata: {
          wallet_address: walletAddress,
          wallet_type: walletType || "particle",
          particle_user_id: particleUserId,
          wallet_verified: true,
          first_signature_verified_at: new Date().toISOString(),
          last_signature_verified_at: new Date().toISOString(),
        },
      });

      if (createError || !newUser.user) {
        console.error("[WALLET_AUTH] Error creating user:", createError);
        return errorResponse(corsHeaders, "Failed to create user", 500);
      }

      userId = newUser.user.id;
      console.log(`[WALLET_AUTH] Created new verified user for wallet: ${walletAddress.slice(0, 8)}...`);

      const { error: profileError } = await supabaseAdmin.from("profiles").insert({ id: userId });
      if (profileError) {
        console.warn("[WALLET_AUTH] Failed to create profile:", profileError);
      }
    }

    // Generate a session for this user using magic link
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: walletEmail,
    });

    if (linkError || !linkData) {
      console.error("[WALLET_AUTH] Error generating link:", linkError);
      return errorResponse(corsHeaders, "Failed to generate session", 500);
    }

    const url = new URL(linkData.properties.action_link);
    const token = url.searchParams.get("token");
    const tokenHash = linkData.properties.hashed_token;

    if (!token && !tokenHash) {
      console.error("[WALLET_AUTH] No token in generated link");
      return errorResponse(corsHeaders, "Failed to extract session token", 500);
    }

    console.log(`[WALLET_AUTH] Successfully authenticated verified wallet user: ${userId.slice(0, 8)}...`);

    return successResponse(corsHeaders, {
      success: true,
      userId,
      email: walletEmail,
      walletVerified: true,
      token: token || tokenHash,
      tokenType: token ? "pkce" : "hash",
    });
  } catch (error) {
    console.error("[WALLET_AUTH] Error:", error);
    logSecurityEvent("WALLET_AUTH_ERROR", {
      clientId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return errorResponse(corsHeaders, "Internal server error", 500);
  }
});
