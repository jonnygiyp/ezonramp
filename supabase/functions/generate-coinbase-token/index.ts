import * as jose from "https://deno.land/x/jose@v5.9.6/index.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Convert EC PRIVATE KEY (SEC1) to PKCS#8 format for P-256 curve
function convertSEC1toPKCS8(sec1Pem: string): string {
  // Remove PEM headers and decode base64
  const sec1Content = sec1Pem
    .replace('-----BEGIN EC PRIVATE KEY-----', '')
    .replace('-----END EC PRIVATE KEY-----', '')
    .replace(/\s/g, '');
  
  const sec1Der = Uint8Array.from(atob(sec1Content), c => c.charCodeAt(0));
  
  // PKCS#8 wrapper for P-256 EC private key
  // This is the ASN.1 structure for wrapping an EC private key
  const oid = new Uint8Array([
    0x30, 0x13, // SEQUENCE
    0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01, // OID for EC public key
    0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07 // OID for P-256 curve
  ]);
  
  // Build PKCS#8 structure
  const version = new Uint8Array([0x02, 0x01, 0x00]); // INTEGER 0
  const privateKeyOctetString = new Uint8Array([0x04, sec1Der.length, ...sec1Der]);
  
  // Calculate total length
  const contentLength = version.length + oid.length + privateKeyOctetString.length;
  const pkcs8Der = new Uint8Array(2 + (contentLength > 127 ? 2 : 1) + contentLength);
  
  let offset = 0;
  pkcs8Der[offset++] = 0x30; // SEQUENCE
  
  if (contentLength > 127) {
    pkcs8Der[offset++] = 0x82; // Long form length
    pkcs8Der[offset++] = (contentLength >> 8) & 0xff;
    pkcs8Der[offset++] = contentLength & 0xff;
  } else {
    pkcs8Der[offset++] = contentLength;
  }
  
  pkcs8Der.set(version, offset);
  offset += version.length;
  pkcs8Der.set(oid, offset);
  offset += oid.length;
  pkcs8Der.set(privateKeyOctetString, offset);
  
  // Convert to base64 and add PEM headers
  const pkcs8Base64 = btoa(String.fromCharCode(...pkcs8Der));
  const pkcs8Pem = `-----BEGIN PRIVATE KEY-----\n${pkcs8Base64.match(/.{1,64}/g)?.join('\n')}\n-----END PRIVATE KEY-----`;
  
  return pkcs8Pem;
}

async function generateCoinbaseJWT(apiKey: string, apiSecret: string, requestMethod: string, requestPath: string): Promise<string> {
  try {
    // Process the private key to ensure it has proper newlines
    let processedKey = apiSecret;
    if (apiSecret.includes('\\n')) {
      processedKey = apiSecret.replace(/\\n/g, '\n');
    }

    // Import the private key
    let privateKey;
    try {
      // Check if it's in PKCS#8 format (BEGIN PRIVATE KEY) or SEC1 format (BEGIN EC PRIVATE KEY)
      if (processedKey.includes('BEGIN PRIVATE KEY')) {
        privateKey = await jose.importPKCS8(processedKey, 'ES256');
      } else if (processedKey.includes('BEGIN EC PRIVATE KEY')) {
        // Convert SEC1 to PKCS#8
        console.log('Converting EC PRIVATE KEY to PKCS#8 format...');
        const pkcs8Key = convertSEC1toPKCS8(processedKey);
        privateKey = await jose.importPKCS8(pkcs8Key, 'ES256');
        console.log('Conversion successful');
      } else {
        throw new Error('Invalid key format. Expected BEGIN PRIVATE KEY or BEGIN EC PRIVATE KEY');
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
