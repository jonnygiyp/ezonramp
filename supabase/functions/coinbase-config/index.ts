import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  getCoinbaseCorsHeaders,
  forbiddenCorsResponse,
  isOriginAllowed,
} from "../_shared/coinbase-auth.ts";

// Note: This endpoint returns only the public App ID, which is safe to expose.
// No authentication required for publishable/public keys.
// However, CORS is strictly enforced.

serve(async (req) => {
  const origin = req.headers.get("origin");
  
  // Strict CORS check - reject requests with missing or invalid origin
  if (!isOriginAllowed(origin)) {
    console.warn(`[COINBASE-CONFIG] CORS denied for origin: ${origin || "(missing)"}`);
    return forbiddenCorsResponse();
  }

  const corsHeaders = getCoinbaseCorsHeaders(origin)!;

  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Return the public Coinbase Onramp App ID
    // This is a publishable key meant for client-side use
    const appId = Deno.env.get("COINBASE_ONRAMP_APP_ID");

    if (!appId) {
      console.error("COINBASE_ONRAMP_APP_ID not configured");
      return new Response(
        JSON.stringify({ error: "Coinbase Onramp not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log("[COINBASE-CONFIG] Returning Coinbase Onramp App ID");

    return new Response(JSON.stringify({ appId }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[COINBASE-CONFIG] Error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
