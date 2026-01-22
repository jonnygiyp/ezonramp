import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Allowed origins for Stripe Onramp
const ALLOWED_ORIGINS = [
  "https://ezonramp.com",
  "https://www.ezonramp.com",
  "https://ezonramp.lovable.app",
  "https://id-preview--7b38c753-20a4-4c8b-8302-f8796fd8f46e.lovable.app",
];

// Include localhost for development if needed
if (Deno.env.get("DEVELOPMENT_MODE") === "true") {
  ALLOWED_ORIGINS.push("http://localhost:5173", "http://localhost:3000");
}

/**
 * Get CORS headers for Stripe Onramp - only sets Access-Control-Allow-Origin
 * when the origin is in the allowlist
 */
function getStripeCorsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Credentials": "true",
    "Vary": "Origin",
    // Security headers
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-XSS-Protection": "1; mode=block",
    "Referrer-Policy": "strict-origin-when-cross-origin",
  };

  // Only set Access-Control-Allow-Origin if origin is in allowlist
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }

  return headers;
}

/**
 * Get client identifier for logging (hashed for privacy)
 */
function getClientId(req: Request): string {
  return (
    req.headers.get("x-forwarded-for") ||
    req.headers.get("cf-connecting-ip") ||
    "unknown"
  );
}

serve(async (req) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getStripeCorsHeaders(origin);

  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const clientId = getClientId(req);
  const authHeader = req.headers.get("Authorization");

  // ========================================
  // DEBUG LOGGING (temporary)
  // ========================================
  console.log(`[DEBUG] Origin: ${origin || "none"}`);
  console.log(`[DEBUG] Authorization header present: ${authHeader ? "yes" : "no"}`);

  // ========================================
  // EXPLICIT JWT AUTHENTICATION
  // ========================================
  if (!authHeader) {
    console.warn(`[AUTH] Missing Authorization header from client ${clientId.slice(0, 10)}...`);
    return new Response(
      JSON.stringify({ error: "Authorization header required. Please sign in and try again." }),
      {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  if (!authHeader.startsWith("Bearer ")) {
    console.warn(`[AUTH] Invalid Authorization format from client ${clientId.slice(0, 10)}...`);
    return new Response(
      JSON.stringify({ error: "Invalid authorization format. Use Bearer token." }),
      {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  const token = authHeader.replace("Bearer ", "");
  if (!token || token.trim() === "") {
    console.warn(`[AUTH] Empty token from client ${clientId.slice(0, 10)}...`);
    return new Response(
      JSON.stringify({ error: "Token is empty. Please sign in and try again." }),
      {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  try {
    // ========================================
    // VALIDATE JWT USING SUPABASE
    // ========================================
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!supabaseUrl || !supabaseAnonKey) {
      console.error("[AUTH] Missing Supabase configuration");
      return new Response(
        JSON.stringify({ error: "Server configuration error" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: authHeader },
      },
    });

    const { data, error: claimsError } = await supabase.auth.getClaims(token);

    if (claimsError || !data?.claims) {
      console.warn(`[AUTH] Invalid token from client ${clientId.slice(0, 10)}...: ${claimsError?.message || "No claims returned"}`);
      return new Response(
        JSON.stringify({ error: "Invalid or expired token. Please sign in again." }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const claims = data.claims;
    const userId = claims.sub as string;

    // Check token expiration
    const exp = claims.exp as number | undefined;
    if (exp && exp < Math.floor(Date.now() / 1000)) {
      console.warn(`[AUTH] Expired token for user ${userId.slice(0, 8)}...`);
      return new Response(
        JSON.stringify({ error: "Token has expired. Please sign in again." }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`[AUTH] Stripe onramp request authorized for user ${userId.slice(0, 8)}...`);

    // ========================================
    // STRIPE SESSION CREATION
    // ========================================
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      throw new Error("STRIPE_SECRET_KEY is not configured");
    }

    const stripe = new Stripe(stripeKey, {
      apiVersion: "2025-08-27.basil",
    });

    const { walletAddress, destinationCurrency, destinationNetwork, sourceAmount } = await req.json();

    if (!walletAddress) {
      throw new Error("Wallet address is required");
    }

    // Build wallet addresses object based on network
    const walletAddresses: Record<string, string> = {};
    const network = destinationNetwork || "solana";
    
    // Map network to wallet address key
    const networkMapping: Record<string, string> = {
      solana: "solana",
      ethereum: "ethereum",
      polygon: "polygon",
      base: "base",
      bitcoin: "bitcoin",
      avalanche: "avalanche",
      stellar: "stellar",
    };
    
    if (networkMapping[network]) {
      walletAddresses[networkMapping[network]] = walletAddress;
    }

    // Create crypto onramp session using direct API call
    const response = await fetch("https://api.stripe.com/v1/crypto/onramp_sessions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${stripeKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        ...(Object.keys(walletAddresses).length > 0 && {
          [`wallet_addresses[${network}]`]: walletAddress,
        }),
        ...(destinationCurrency && { destination_currency: destinationCurrency }),
        ...(destinationNetwork && { destination_network: destinationNetwork }),
        ...(sourceAmount && { source_amount: sourceAmount.toString() }),
        lock_wallet_address: "true",
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Stripe API error:", errorData);
      throw new Error(errorData.error?.message || "Failed to create onramp session");
    }

    const session = await response.json();
    console.log("Onramp session created:", { id: session.id, status: session.status, userId: userId.slice(0, 8) });

    return new Response(
      JSON.stringify({ 
        clientSecret: session.client_secret,
        sessionId: session.id,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Error creating onramp session:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
