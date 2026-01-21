import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ============================================================================
// ALLOWED ORIGINS - Strict domain whitelist
// Only these domains can make requests to the edge functions
// ============================================================================
const ALLOWED_ORIGINS = [
  // Production domains
  "https://ezonramp.com",
  "https://www.ezonramp.com",
  "https://ezonramp.lovable.app",
  // Preview domain pattern
  "https://id-preview--7b38c753-20a4-4c8b-8302-f8796fd8f46e.lovable.app",
];

// Development mode - only enable in local development
const isDevelopment = Deno.env.get("DEVELOPMENT_MODE") === "true";
if (isDevelopment) {
  ALLOWED_ORIGINS.push("http://localhost:5173", "http://localhost:3000");
}

export interface AuthResult {
  authenticated: boolean;
  userId?: string;
  email?: string;
  error?: string;
}

/**
 * Validate if an origin is allowed
 * Returns the origin if allowed, null otherwise
 */
export function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return false;
  
  // Exact match for known domains
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  
  // Allow Lovable preview URLs - multiple patterns
  // Pattern 1: id-preview--{uuid}.lovable.app
  if (origin.match(/^https:\/\/id-preview--[a-f0-9-]+\.lovable\.app$/)) {
    return true;
  }
  
  // Pattern 2: preview-{hash}--ezonramp.lovable.app  
  if (origin.match(/^https:\/\/preview-[a-f0-9]+--ezonramp\.lovable\.app$/)) {
    return true;
  }
  
  // Pattern 3: {hash}--ezonramp.lovable.app
  if (origin.match(/^https:\/\/[a-f0-9]+--ezonramp\.lovable\.app$/)) {
    return true;
  }
  
  // Pattern 4: {uuid}.lovableproject.com (development preview)
  if (origin.match(/^https:\/\/[a-f0-9-]+\.lovableproject\.com$/)) {
    return true;
  }
  
  return false;
}

/**
 * Get CORS headers with strict origin validation
 * Never returns wildcard - always specific origin or blocks request
 */
export function getCorsHeaders(origin: string | null): Record<string, string> {
  const isAllowed = isOriginAllowed(origin);
  
  // If origin is not allowed, use the first allowed origin
  // This effectively blocks the request from unauthorized origins
  const allowedOrigin = isAllowed && origin ? origin : ALLOWED_ORIGINS[0];

  return {
    // Strict origin - never use wildcard
    "Access-Control-Allow-Origin": allowedOrigin,
    // Only allow necessary headers
    "Access-Control-Allow-Headers": "authorization, content-type, x-client-info, apikey",
    // Restrict to required methods only
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    // Don't allow credentials unless explicitly needed
    "Access-Control-Allow-Credentials": "false",
    // Security headers
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-XSS-Protection": "1; mode=block",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
  };
}

/**
 * Validate that request origin is allowed
 * Returns error response if not allowed, null if allowed
 */
export function validateOrigin(
  origin: string | null,
  corsHeaders: Record<string, string>
): Response | null {
  if (!isOriginAllowed(origin)) {
    logSecurityEvent("CORS_ORIGIN_BLOCKED", {
      origin: origin || "null",
      allowed: ALLOWED_ORIGINS.slice(0, 2).join(", ") + "...",
    });
    return new Response(
      JSON.stringify({ error: "Origin not allowed" }),
      {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
  return null;
}

/**
 * Get client identifier for logging (partially redacted for privacy)
 */
export function getClientId(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("cf-connecting-ip") ||
    "unknown"
  );
}

/**
 * Log security events (failed auth attempts, etc.)
 */
export function logSecurityEvent(
  event: string,
  details: Record<string, unknown>
): void {
  const timestamp = new Date().toISOString();
  console.warn(`[SECURITY] ${timestamp} - ${event}:`, {
    ...details,
    // Redact sensitive data
    clientId: details.clientId
      ? `${String(details.clientId).slice(0, 10)}***`
      : undefined,
  });
}

/**
 * Validate JWT token and return user info
 * Uses Supabase's getClaims() for secure token validation
 * 
 * Validates:
 * - Token presence and format
 * - Token signature (via Supabase)
 * - Token expiration
 * - User ID (sub claim)
 */
export async function validateAuth(req: Request): Promise<AuthResult> {
  const authHeader = req.headers.get("Authorization");
  const clientId = getClientId(req);

  // Check for Authorization header
  if (!authHeader) {
    logSecurityEvent("AUTH_MISSING_HEADER", { clientId });
    return {
      authenticated: false,
      error: "Authorization header required",
    };
  }

  // Check for Bearer token format
  if (!authHeader.startsWith("Bearer ")) {
    logSecurityEvent("AUTH_INVALID_FORMAT", { clientId });
    return {
      authenticated: false,
      error: "Invalid authorization format. Use Bearer token.",
    };
  }

  const token = authHeader.replace("Bearer ", "");

  // Validate token is not empty
  if (!token || token.trim() === "") {
    logSecurityEvent("AUTH_EMPTY_TOKEN", { clientId });
    return {
      authenticated: false,
      error: "Token is empty",
    };
  }

  // Basic JWT format validation (header.payload.signature)
  const jwtParts = token.split(".");
  if (jwtParts.length !== 3) {
    logSecurityEvent("AUTH_MALFORMED_TOKEN", { clientId });
    return {
      authenticated: false,
      error: "Malformed token",
    };
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!supabaseUrl || !supabaseAnonKey) {
      console.error("[AUTH] Missing Supabase configuration");
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
      logSecurityEvent("AUTH_INVALID_TOKEN", {
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

    // Validate required claims
    if (!userId) {
      logSecurityEvent("AUTH_MISSING_SUB", { clientId });
      return {
        authenticated: false,
        error: "Invalid token: missing user ID",
      };
    }

    // Validate issuer (should be supabase)
    const iss = claims.iss as string | undefined;
    if (!iss || !iss.includes("supabase")) {
      logSecurityEvent("AUTH_INVALID_ISSUER", { clientId, iss });
      return {
        authenticated: false,
        error: "Invalid token issuer",
      };
    }

    // Validate audience
    const aud = claims.aud as string | undefined;
    if (aud !== "authenticated") {
      logSecurityEvent("AUTH_INVALID_AUDIENCE", { clientId, aud });
      return {
        authenticated: false,
        error: "Invalid token audience",
      };
    }

    // Check token expiration
    const exp = claims.exp as number | undefined;
    const now = Math.floor(Date.now() / 1000);
    if (!exp || exp < now) {
      logSecurityEvent("AUTH_EXPIRED_TOKEN", { clientId, userId: userId.slice(0, 8) });
      return {
        authenticated: false,
        error: "Token has expired",
      };
    }

    // Check not-before time
    const nbf = claims.nbf as number | undefined;
    if (nbf && nbf > now) {
      logSecurityEvent("AUTH_TOKEN_NOT_YET_VALID", { clientId });
      return {
        authenticated: false,
        error: "Token not yet valid",
      };
    }

    console.log(`[AUTH] User authenticated: ${userId.slice(0, 8)}...`);

    return {
      authenticated: true,
      userId,
      email,
    };
  } catch (error) {
    logSecurityEvent("AUTH_VALIDATION_ERROR", {
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
 * Create an unauthorized response (401)
 */
export function unauthorizedResponse(
  corsHeaders: Record<string, string>,
  message = "Unauthorized"
): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 401,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Create a forbidden response (403)
 */
export function forbiddenResponse(
  corsHeaders: Record<string, string>,
  message = "Forbidden"
): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 403,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Standard error response with proper headers
 */
export function errorResponse(
  corsHeaders: Record<string, string>,
  message: string,
  status = 500
): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Standard success response with proper headers
 */
export function successResponse(
  corsHeaders: Record<string, string>,
  data: unknown,
  status = 200
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
