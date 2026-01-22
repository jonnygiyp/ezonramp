import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import {
  validateAuth,
  unauthorizedResponse,
  getClientId,
  logSecurityEvent,
} from "../_shared/auth.ts";

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

serve(async (req) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getStripeCorsHeaders(origin);

  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const clientId = getClientId(req);

  try {
    // ========================================
    // AUTHENTICATION CHECK - Session tokens require auth
    // ========================================
    const authResult = await validateAuth(req);
    
    if (!authResult.authenticated) {
      logSecurityEvent("AUTH_FAILED_STRIPE_ONRAMP", {
        clientId,
        error: authResult.error,
      });
      return unauthorizedResponse(corsHeaders, authResult.error);
    }

    console.log(`[AUTH] Stripe onramp request authorized for user ${authResult.userId?.slice(0, 8)}...`);

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
    console.log("Onramp session created:", { id: session.id, status: session.status, userId: authResult.userId?.slice(0, 8) });

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
