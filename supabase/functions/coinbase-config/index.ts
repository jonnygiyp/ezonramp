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
    // Parse request body to determine which App ID to return
    let variant = "us"; // default to US
    
    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (body.variant === "global") {
          variant = "global";
        }
      } catch {
        // If body parsing fails, default to US
      }
    }

    // Return the appropriate Coinbase Onramp App ID based on variant
    const appId = variant === "global" 
      ? Deno.env.get("COINBASE_GLOBAL_APP_ID")
      : Deno.env.get("COINBASE_ONRAMP_APP_ID");

    const variantLabel = variant === "global" ? "Global" : "US";

    if (!appId) {
      console.error(`COINBASE_${variant === "global" ? "GLOBAL" : "ONRAMP"}_APP_ID not configured`);
      return new Response(
        JSON.stringify({ error: `Coinbase Onramp (${variantLabel}) not configured` }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`[COINBASE-CONFIG] Returning Coinbase Onramp App ID for ${variantLabel}`);

    return new Response(JSON.stringify({ appId, variant }), {
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
