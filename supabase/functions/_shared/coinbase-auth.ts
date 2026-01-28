import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Production domains for Coinbase endpoints - strict allowlist
const COINBASE_ALLOWED_ORIGINS = [
  "https://ezonramp.com",
  "https://ezonramp.lovable.app",
  "https://id-preview--7b38c753-20a4-4c8b-8302-f8796fd8f46e.lovable.app",
];

// Include localhost for development if needed
if (Deno.env.get("DEVELOPMENT_MODE") === "true") {
  COINBASE_ALLOWED_ORIGINS.push("http://localhost:5173", "http://localhost:3000");
}

export interface CoinbaseAuthResult {
  authenticated: boolean;
  userId?: string;
  email?: string;
  walletAddress?: string;
  walletNetwork?: string;
  error?: string;
  /** True if the wallet address failed to link due to unique constraint (already linked elsewhere) */
  walletLinkConflict?: boolean;
}

/**
 * Check if origin is allowed for Coinbase endpoints
 */
export function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return false;
  return COINBASE_ALLOWED_ORIGINS.includes(origin);
}

/**
 * Get strict CORS headers for Coinbase endpoints
 * Returns headers only if origin is in allowlist
 * NEVER returns empty Access-Control-Allow-Origin
 */
export function getCoinbaseCorsHeaders(origin: string | null): Record<string, string> | null {
  if (!origin || !isOriginAllowed(origin)) {
    // Return null to indicate CORS should be denied
    return null;
  }

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Credentials": "true",
    // Security headers
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-XSS-Protection": "1; mode=block",
    "Referrer-Policy": "strict-origin-when-cross-origin",
  };
}

/**
 * Create a 403 Forbidden response for CORS violations
 */
export function forbiddenCorsResponse(): Response {
  return new Response(JSON.stringify({ error: "Forbidden: Invalid or missing origin" }), {
    status: 403,
    headers: {
      "Content-Type": "application/json",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/**
 * Get client identifier for logging (partially masked for privacy)
 */
export function getClientId(req: Request): string {
  return (
    req.headers.get("x-forwarded-for") ||
    req.headers.get("cf-connecting-ip") ||
    "unknown"
  );
}

/**
 * Log security events for Coinbase endpoints
 */
export function logCoinbaseSecurityEvent(
  event: string,
  details: Record<string, unknown>
): void {
  const timestamp = new Date().toISOString();
  console.warn(`[COINBASE-SECURITY] ${timestamp} - ${event}:`, {
    ...details,
    // Redact sensitive data
    clientId: details.clientId
      ? `${String(details.clientId).slice(0, 10)}***`
      : undefined,
    walletAddress: details.walletAddress
      ? `${String(details.walletAddress).slice(0, 8)}...`
      : undefined,
  });
}

/**
 * Validate JWT token and return user info with linked wallet address
 * Uses Supabase's getClaims() for secure token validation
 */
export async function validateCoinbaseAuth(req: Request): Promise<CoinbaseAuthResult> {
  const authHeader = req.headers.get("Authorization");
  const clientId = getClientId(req);

  // Check for Authorization header
  if (!authHeader) {
    logCoinbaseSecurityEvent("AUTH_MISSING_HEADER", { clientId });
    return {
      authenticated: false,
      error: "Authorization header required",
    };
  }

  // Check for Bearer token format
  if (!authHeader.startsWith("Bearer ")) {
    logCoinbaseSecurityEvent("AUTH_INVALID_FORMAT", { clientId });
    return {
      authenticated: false,
      error: "Invalid authorization format. Use Bearer token.",
    };
  }

  const token = authHeader.replace("Bearer ", "");

  // Validate token is not empty
  if (!token || token.trim() === "") {
    logCoinbaseSecurityEvent("AUTH_EMPTY_TOKEN", { clientId });
    return {
      authenticated: false,
      error: "Token is empty",
    };
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!supabaseUrl || !supabaseAnonKey) {
      console.error("[COINBASE-AUTH] Missing Supabase configuration");
      return {
        authenticated: false,
        error: "Server configuration error",
      };
    }

    // Create Supabase client with the user's token
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: authHeader },
      },
    });

    // Validate the token using getClaims
    const { data, error } = await supabase.auth.getClaims(token);

    if (error || !data?.claims) {
      logCoinbaseSecurityEvent("AUTH_INVALID_TOKEN", {
        clientId,
        error: error?.message || "No claims returned",
      });
      return {
        authenticated: false,
        error: "Invalid or expired token",
      };
    }

    const claims = data.claims;
    const userId = claims.sub as string;
    const email = claims.email as string | undefined;

    // Check token expiration
    const exp = claims.exp as number | undefined;
    if (exp && exp < Math.floor(Date.now() / 1000)) {
      logCoinbaseSecurityEvent("AUTH_EXPIRED_TOKEN", { clientId, userId });
      return {
        authenticated: false,
        error: "Token has expired",
      };
    }

    // Fetch user's linked wallet address from profiles
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("wallet_address, wallet_network")
      .eq("id", userId)
      .single();

    let walletLinkConflict = false;

    if (profileError) {
      // Check if this is a "no rows" error (user has no profile yet) or something else
      if (profileError.code === "PGRST116") {
        console.log("[COINBASE-AUTH] No profile found for user - profile not yet created");
      } else {
        console.warn("[COINBASE-AUTH] Failed to fetch profile:", profileError.message);
      }
      // Don't fail auth, just return without wallet info
    }

    console.log(`[COINBASE-AUTH] User authenticated: ${userId.slice(0, 8)}...`);

    return {
      authenticated: true,
      userId,
      email,
      walletAddress: profile?.wallet_address || undefined,
      walletNetwork: profile?.wallet_network || undefined,
      walletLinkConflict,
    };
  } catch (error) {
    logCoinbaseSecurityEvent("AUTH_VALIDATION_ERROR", {
      clientId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return {
      authenticated: false,
      error: "Token validation failed",
    };
  }
}

/**
 * Create an unauthorized response for Coinbase endpoints
 */
export function coinbaseUnauthorizedResponse(
  corsHeaders: Record<string, string>,
  message = "Unauthorized"
): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 401,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Create a forbidden response for Coinbase endpoints
 */
export function coinbaseForbiddenResponse(
  corsHeaders: Record<string, string>,
  message = "Forbidden"
): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 403,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
