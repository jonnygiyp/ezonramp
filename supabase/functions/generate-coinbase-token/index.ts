import * as jose from "https://deno.land/x/jose@v5.9.6/index.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function generateCoinbaseJWT(apiKey: string, apiSecret: string, requestMethod: string, requestPath: string): Promise<string> {
  try {
    // Process the private key to ensure it has proper newlines
    let processedKey = apiSecret;
    if (apiSecret.includes('\\n')) {
      processedKey = apiSecret.replace(/\\n/g, '\n');
    }

    // Import the private key - try PKCS#8 format first
    let privateKey;
    try {
      // Check if it's already in PKCS#8 format (BEGIN PRIVATE KEY)
      if (processedKey.includes('BEGIN PRIVATE KEY')) {
        privateKey = await jose.importPKCS8(processedKey, 'ES256');
      } else {
        // It's in SEC1 format (BEGIN EC PRIVATE KEY)
        // jose doesn't support SEC1 directly, so we need to tell the user
        throw new Error('Please provide the API secret in PKCS#8 format (BEGIN PRIVATE KEY). You can convert it using: openssl pkcs8 -topk8 -nocrypt -in ec-key.pem -out pkcs8-key.pem');
      }
    } catch (error) {
      console.error('Key import error:', error);
      const errorMsg = error instanceof Error ? error.message : 'Unknown key import error';
      throw new Error(`Failed to import private key: ${errorMsg}`);
    }

    const payload = {
      sub: apiKey,
      iss: "coinbase-cloud",
      nbf: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 120, // 2 minutes expiry
      aud: ["cdp_service"],
      uri: `${requestMethod} api.developer.coinbase.com${requestPath}`,
    };

    const jwt = await new jose.SignJWT(payload)
      .setProtectedHeader({
        alg: 'ES256',
        kid: apiKey,
        nonce: crypto.randomUUID(),
      })
      .sign(privateKey);

    return jwt;
  } catch (error) {
    console.error('JWT generation error:', error);
    throw error;
  }
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
    
    console.log('Generating JWT...');
    
    // Generate JWT token for authentication
    const jwt = await generateCoinbaseJWT(apiKey, apiSecret, requestMethod, requestPath);
    
    console.log('JWT generated successfully');
    
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
