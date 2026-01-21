import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createHmac } from "node:crypto";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const secretKey = Deno.env.get('MOONPAY_SECRET_KEY');
    
    if (!secretKey) {
      throw new Error('MoonPay secret key not configured');
    }

    const { urlForSigning } = await req.json();
    
    if (!urlForSigning) {
      throw new Error('URL for signing is required');
    }

    // Extract the query string from the URL (everything after the ?)
    const url = new URL(urlForSigning);
    const queryString = url.search.substring(1); // Remove the leading ?
    
    // Create HMAC signature using the query string
    const signature = createHmac('sha256', secretKey)
      .update(queryString)
      .digest('base64');

    return new Response(
      JSON.stringify({ signature }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('MoonPay sign error:', errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400 
      }
    );
  }
});
