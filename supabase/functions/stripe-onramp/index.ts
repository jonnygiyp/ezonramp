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
  
  // Read authorization header defensively (check both cases)
  const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");

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
    // VALIDATE JWT USING SUPABASE getUser()
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

    // Create Supabase client with Authorization header in global.headers
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: authHeader },
      },
    });

    // Validate JWT using getUser() - the stable edge function pattern
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData?.user) {
      console.warn(`[AUTH] Invalid token from client ${clientId.slice(0, 10)}...: ${userError?.message || "No user returned"}`);
      return new Response(
        JSON.stringify({ error: "Invalid or expired token. Please sign in again." }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const userId = userData.user.id;
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

    // ------------------------------------------------------------------
    // DEFAULT AMOUNT POLICY
    // ------------------------------------------------------------------
    // We intentionally DO NOT prefill source_amount on the Stripe Crypto
    // Onramp session. Stripe's API requires source_amount to be a positive
    // number (minimum 1.00) — passing 0 returns a 400 error such as:
    //   "source_amount must be greater than or equal to 1"
    // By omitting source_amount entirely, Stripe's hosted UI opens with an
    // empty amount field that the user must fill in themselves, which is
    // the closest supported equivalent to "$0 default".
    //
    // If a caller explicitly passes a sourceAmount > 0 we still honour it
    // (preserves existing behaviour for any future caller), but we log and
    // drop any value <= 0 so a bad client value can't break session
    // creation.
    // ------------------------------------------------------------------
    let normalizedSourceAmount: string | null = null;
    if (sourceAmount !== undefined && sourceAmount !== null && sourceAmount !== "") {
      const numeric = Number(sourceAmount);
      if (Number.isFinite(numeric) && numeric >= 1) {
        normalizedSourceAmount = numeric.toString();
      } else {
        console.log(
          `[STRIPE] Ignoring sourceAmount="${sourceAmount}" (must be >= 1). Opening onramp with no prefilled amount.`,
        );
      }
    } else {
      console.log("[STRIPE] No sourceAmount provided — opening onramp with empty amount field.");
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
    const sessionParams: Record<string, string> = {
      ...(Object.keys(walletAddresses).length > 0 && {
        [`wallet_addresses[${network}]`]: walletAddress,
      }),
      ...(destinationCurrency && { destination_currency: destinationCurrency }),
      ...(destinationNetwork && { destination_network: destinationNetwork }),
      ...(normalizedSourceAmount && { source_amount: normalizedSourceAmount }),
      lock_wallet_address: "true",
    };

    console.log("[STRIPE] Creating onramp session with params:", {
      ...sessionParams,
      // Mask wallet address in logs
      ...(sessionParams[`wallet_addresses[${network}]`] && {
        [`wallet_addresses[${network}]`]: `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`,
      }),
      has_source_amount: Boolean(normalizedSourceAmount),
    });

    const response = await fetch("https://api.stripe.com/v1/crypto/onramp_sessions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${stripeKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(sessionParams),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("[STRIPE] API error:", {
        status: response.status,
        statusText: response.statusText,
        error: errorData,
      });
      throw new Error(errorData.error?.message || "Failed to create onramp session");
    }

    const session = await response.json();
    console.log("Onramp session created:", { id: session.id, status: session.status, userId: userId.slice(0, 8) });

    // Store session mapping for webhook correlation using service role
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (supabaseServiceKey) {
      const serviceClient = createClient(supabaseUrl, supabaseServiceKey);
      const { error: insertError } = await serviceClient
        .from("stripe_onramp_sessions")
        .insert({
          stripe_session_id: session.id,
          user_id: userId,
          wallet_address: walletAddress,
          destination_currency: destinationCurrency || null,
          destination_network: destinationNetwork || null,
          source_amount: sourceAmount || null,
          status: session.status || "created",
        });

      if (insertError) {
        console.error("Failed to record onramp session:", insertError);
      }
    }

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
