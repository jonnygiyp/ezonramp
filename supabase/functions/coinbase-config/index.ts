import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getCorsHeaders } from "../_shared/auth.ts";

// Note: This endpoint returns only the public App ID, which is safe to expose.
// No authentication required for publishable/public keys.

serve(async (req) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Return the public Coinbase Onramp App ID
    // This is a publishable key meant for client-side use
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

    console.log('Returning Coinbase Onramp App ID');
    
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
