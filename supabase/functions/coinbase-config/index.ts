import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getCorsHeaders, validateOrigin } from "../_shared/auth.ts";

// Note: This endpoint returns only the public App ID, which is safe to expose.
// No authentication required for publishable/public keys.
// However, strict CORS is enforced.

serve(async (req) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
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
    const appId = Deno.env.get('COINBASE_ONRAMP_APP_ID');

    if (!appId) {
      console.error('COINBASE_ONRAMP_APP_ID not configured');
      return new Response(
        JSON.stringify({ error: 'Coinbase Onramp not configured' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log('[CONFIG] Returning Coinbase Onramp App ID to origin:', origin);
    
    return new Response(
      JSON.stringify({ appId }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  } catch (error) {
    console.error('Error fetching config:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
