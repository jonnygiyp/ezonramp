import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getCorsHeaders, validateOrigin } from "../_shared/auth.ts";

// Note: This endpoint returns only the publishable key, which is safe to expose.
// No authentication required for publishable keys.
// However, strict CORS is enforced.

serve(async (req) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Validate origin - only allow requests from approved domains
  const originError = validateOrigin(origin, corsHeaders);
  if (originError) return originError;

  // Only allow GET for config retrieval
  if (req.method !== 'GET' && req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const publishableKey = Deno.env.get("STRIPE_PUBLISHABLE_KEY");
    
    if (!publishableKey) {
      throw new Error("STRIPE_PUBLISHABLE_KEY is not configured");
    }

    console.log('[CONFIG] Returning Stripe publishable key to origin:', origin);

    return new Response(
      JSON.stringify({ publishableKey }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Error fetching Stripe config:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
