const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper function to generate JWT for Coinbase API
async function generateCoinbaseJWT(apiKey: string, apiSecret: string, requestMethod: string, requestPath: string): Promise<string> {
  const algorithm = { name: "ECDSA", namedCurve: "P-256", hash: "SHA-256" };
  
  // Parse the PEM-formatted private key
  const pemHeader = "-----BEGIN EC PRIVATE KEY-----";
  const pemFooter = "-----END EC PRIVATE KEY-----";
  const pemContents = apiSecret
    .replace(pemHeader, "")
    .replace(pemFooter, "")
    .replace(/\\n/g, "")
    .replace(/\s/g, "");
  
  const binaryDer = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));
  
  const key = await crypto.subtle.importKey(
    "pkcs8",
    binaryDer,
    algorithm,
    false,
    ["sign"]
  );
  
  const header = {
    alg: "ES256",
    kid: apiKey,
    nonce: crypto.randomUUID(),
  };
  
  const payload = {
    sub: apiKey,
    iss: "coinbase-cloud",
    nbf: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 120, // 2 minutes expiry
    aud: ["cdp_service"],
    uri: `${requestMethod} ${requestPath}`,
  };
  
  const encodedHeader = btoa(JSON.stringify(header)).replace(/=/g, "");
  const encodedPayload = btoa(JSON.stringify(payload)).replace(/=/g, "");
  const message = `${encodedHeader}.${encodedPayload}`;
  
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const signature = await crypto.subtle.sign(algorithm, key, data);
  
  const encodedSignature = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
  
  return `${message}.${encodedSignature}`;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get('COINBASE_API_KEY');
    const apiSecret = Deno.env.get('COINBASE_API_SECRET');

    if (!apiKey || !apiSecret) {
      console.error('Missing Coinbase API credentials');
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }), 
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const { addresses, assets } = await req.json();
    
    console.log('Generating session token for:', { addresses, assets });

    const requestMethod = "POST";
    const requestPath = "/onramp/v1/token";
    
    // Generate JWT token for authentication
    const jwt = await generateCoinbaseJWT(apiKey, apiSecret, requestMethod, requestPath);
    
    // Call Coinbase API to create session token
    const response = await fetch('https://api.developer.coinbase.com/onramp/v1/token', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${jwt}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        addresses,
        assets,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Coinbase API error:', response.status, errorText);
      return new Response(
        JSON.stringify({ error: 'Failed to generate session token', details: errorText }), 
        { 
          status: response.status, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const data = await response.json();
    console.log('Session token generated successfully');

    return new Response(
      JSON.stringify({ token: data.token, channel_id: data.channel_id }), 
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Error in generate-coinbase-token function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }), 
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
