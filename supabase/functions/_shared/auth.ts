import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Production domains - update with your actual domains
const ALLOWED_ORIGINS = [
  "https://ezonramp.lovable.app",
  "https://id-preview--7b38c753-20a4-4c8b-8302-f8796fd8f46e.lovable.app",
];

// Include localhost for development if needed
if (Deno.env.get("DEVELOPMENT_MODE") === "true") {
  ALLOWED_ORIGINS.push("http://localhost:5173", "http://localhost:3000");
}

export interface AuthResult {
  authenticated: boolean;
  userId?: string;
  email?: string;
  error?: string;
}

/**
 * Get CORS headers with restricted origin
 */
export function getCorsHeaders(origin: string | null): Record<string, string> {
  const isAllowed = origin && ALLOWED_ORIGINS.includes(origin);
  const allowedOrigin = isAllowed ? origin : ALLOWED_ORIGINS[0];

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
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
 * Get client identifier for logging (hashed for privacy)
 */
export function getClientId(req: Request): string {
  return (
    req.headers.get("x-forwarded-for") ||
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

    // Check token expiration
    const exp = claims.exp as number | undefined;
    if (exp && exp < Math.floor(Date.now() / 1000)) {
      logSecurityEvent("AUTH_EXPIRED_TOKEN", { clientId, userId });
      return {
        authenticated: false,
        error: "Token has expired",
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
 * Create an unauthorized response
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
 * Create a forbidden response
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
