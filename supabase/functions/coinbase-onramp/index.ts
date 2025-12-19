import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// Get allowed origins from environment
const ALLOWED_ORIGINS = Deno.env.get('ALLOWED_ORIGINS')?.split(',') || [];

const getCorsHeaders = (origin: string | null) => {
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0] || '';
  
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  };
};

// Rate limiting
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW_MS = 60000;
const RATE_LIMIT_MAX_REQUESTS = 20;

function checkRateLimit(clientId: string): boolean {
  const now = Date.now();
  const clientData = rateLimitMap.get(clientId);
  
  if (!clientData || now > clientData.resetTime) {
    rateLimitMap.set(clientId, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  
  if (clientData.count >= RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }
  
  clientData.count++;
  return true;
}

// Generate CDP JWT for API authentication
async function generateCDPJWT(
  apiKeyId: string, 
  apiKeySecret: string,
  requestMethod: string,
  requestHost: string,
  requestPath: string
): Promise<string> {
  const header = {
    alg: 'ES256',
    kid: apiKeyId,
    typ: 'JWT',
    nonce: crypto.randomUUID(),
  };

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: apiKeyId,
    iss: 'cdp',
    nbf: now,
    exp: now + 120, // 2 minutes
    uris: [`${requestMethod} ${requestHost}${requestPath}`],
  };

  // Base64url encode header and payload
  const encoder = new TextEncoder();
  const headerB64 = btoa(JSON.stringify(header)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const payloadB64 = btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const message = `${headerB64}.${payloadB64}`;

  // Parse the PEM private key
  const pemContent = apiKeySecret
    .replace('-----BEGIN EC PRIVATE KEY-----', '')
    .replace('-----END EC PRIVATE KEY-----', '')
    .replace(/\s/g, '');
  
  const binaryDer = Uint8Array.from(atob(pemContent), c => c.charCodeAt(0));

  // Import the key for signing
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    binaryDer,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );

  // Sign the message
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    cryptoKey,
    encoder.encode(message)
  );

  // Convert signature to base64url
  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  return `${message}.${signatureB64}`;
}

serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    // Rate limiting
    const clientId = req.headers.get('x-forwarded-for') || 
                     req.headers.get('cf-connecting-ip') || 
                     'unknown';

    if (!checkRateLimit(clientId)) {
      return new Response(JSON.stringify({ error: 'Too many requests' }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { 
      destinationAddress, 
      blockchains = ['ethereum', 'base', 'polygon'],
      assets = ['ETH', 'USDC', 'BTC'],
      presetFiatAmount,
      fiatCurrency = 'USD',
      defaultAsset,
      defaultNetwork,
      redirectUrl,
    } = body;

    if (!destinationAddress) {
      return new Response(JSON.stringify({ error: 'destinationAddress is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate address format (basic check)
    if (!/^0x[a-fA-F0-9]{40}$/.test(destinationAddress) && !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(destinationAddress)) {
      return new Response(JSON.stringify({ error: 'Invalid wallet address format' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const apiKeyId = Deno.env.get('COINBASE_API_KEY');
    const apiKeySecret = Deno.env.get('COINBASE_API_SECRET');

    if (!apiKeyId || !apiKeySecret) {
      console.error('Coinbase API credentials not configured');
      return new Response(JSON.stringify({ error: 'Payment configuration error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Generate JWT for CDP API
    const requestMethod = 'POST';
    const requestHost = 'api.developer.coinbase.com';
    const requestPath = '/onramp/v1/token';

    const jwt = await generateCDPJWT(
      apiKeyId,
      apiKeySecret,
      requestMethod,
      requestHost,
      requestPath
    );

    // Build session token request
    const tokenRequestBody = {
      addresses: [{
        address: destinationAddress,
        blockchains: blockchains,
      }],
      assets: assets,
      clientIp: clientId !== 'unknown' ? clientId : '0.0.0.0',
    };

    console.log('Requesting Coinbase session token for address:', destinationAddress.slice(0, 10) + '...');

    // Call CDP API to get session token
    const response = await fetch(`https://${requestHost}${requestPath}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${jwt}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(tokenRequestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('CDP API error:', response.status, errorText);
      return new Response(JSON.stringify({ 
        error: 'Failed to create onramp session',
        details: response.status 
      }), {
        status: response.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await response.json();
    const sessionToken = data.token;

    if (!sessionToken) {
      console.error('No token in CDP response:', data);
      return new Response(JSON.stringify({ error: 'Invalid response from payment provider' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Build the onramp URL with optional parameters
    const urlParams = new URLSearchParams({
      sessionToken: sessionToken,
    });

    if (presetFiatAmount) {
      urlParams.set('presetFiatAmount', String(presetFiatAmount));
    }
    if (fiatCurrency) {
      urlParams.set('fiatCurrency', fiatCurrency);
    }
    if (defaultAsset) {
      urlParams.set('defaultAsset', defaultAsset);
    }
    if (defaultNetwork) {
      urlParams.set('defaultNetwork', defaultNetwork);
    }
    if (redirectUrl) {
      urlParams.set('redirectUrl', redirectUrl);
    }

    const onrampUrl = `https://pay.coinbase.com/buy/select-asset?${urlParams.toString()}`;

    console.log('Coinbase onramp URL generated successfully');

    return new Response(JSON.stringify({ 
      onrampUrl,
      sessionToken,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Coinbase onramp error:', error instanceof Error ? error.message : 'Unknown error');
    return new Response(JSON.stringify({ error: 'An error occurred processing your request' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
