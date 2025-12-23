import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// CORS headers - allow all origins for this public endpoint
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
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

  // Parse and decode PEM private key (tolerate common formatting issues)
  const isSec1EcKey = apiKeySecret.includes('BEGIN EC PRIVATE KEY');

  const pemMatch = apiKeySecret.match(/-----BEGIN [^-]+-----([\s\S]*?)-----END [^-]+-----/);
  const rawBody = pemMatch ? pemMatch[1] : apiKeySecret;

  // Remove whitespace, escaped newlines ("\\n"), and any non-base64 characters.
  const b64BodyUnpadded = rawBody
    .replace(/\\r/g, '')
    .replace(/\\n/g, '')
    .replace(/\s+/g, '')
    .replace(/[^A-Za-z0-9+/=]/g, '');

  // Some copy/paste flows remove base64 padding; restore it.
  const b64Body = b64BodyUnpadded + '='.repeat((4 - (b64BodyUnpadded.length % 4)) % 4);

  // Decode base64 to binary DER
  let binaryDer: Uint8Array;
  try {
    const decoded = atob(b64Body);
    binaryDer = new Uint8Array(decoded.length);
    for (let i = 0; i < decoded.length; i++) {
      binaryDer[i] = decoded.charCodeAt(i);
    }
  } catch (_e) {
    console.error('Failed to decode base64 from COINBASE_API_SECRET. Store the full PEM (including BEGIN/END lines) or the raw base64 body.');
    throw new Error('Invalid API key format');
  }

  const concatBytes = (...parts: Uint8Array[]) => {
    const total = parts.reduce((sum, p) => sum + p.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const p of parts) {
      out.set(p, offset);
      offset += p.length;
    }
    return out;
  };

  const derLength = (len: number) => {
    if (len < 128) return new Uint8Array([len]);
    const bytes: number[] = [];
    let n = len;
    while (n > 0) {
      bytes.unshift(n & 0xff);
      n >>= 8;
    }
    return new Uint8Array([0x80 | bytes.length, ...bytes]);
  };

  const derTLV = (tag: number, value: Uint8Array) => concatBytes(new Uint8Array([tag]), derLength(value.length), value);
  const derSeq = (value: Uint8Array) => derTLV(0x30, value);
  const derInt0 = () => derTLV(0x02, new Uint8Array([0x00]));
  const derOctetString = (value: Uint8Array) => derTLV(0x04, value);

  // OIDs (already TLV-encoded): id-ecPublicKey and secp256r1
  const OID_EC_PUBLIC_KEY = new Uint8Array([0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01]);
  const OID_SECP256R1 = new Uint8Array([0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07]);

  const wrapSec1ToPkcs8 = (sec1Der: Uint8Array) => {
    const algId = derSeq(concatBytes(OID_EC_PUBLIC_KEY, OID_SECP256R1));
    return derSeq(concatBytes(derInt0(), algId, derOctetString(sec1Der)));
  };

  const importPkcs8P256 = (pkcs8Der: Uint8Array) =>
    crypto.subtle.importKey(
      'pkcs8',
      new Uint8Array(pkcs8Der).buffer,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign']
    );

  // Import the key for signing.
  // - If it's already PKCS#8, import directly.
  // - If it's SEC1 (ECPrivateKey), wrap into PKCS#8 and retry.
  let cryptoKey: CryptoKey;
  try {
    cryptoKey = await importPkcs8P256(isSec1EcKey ? wrapSec1ToPkcs8(binaryDer) : binaryDer);
  } catch (e1) {
    if (!isSec1EcKey) {
      try {
        cryptoKey = await importPkcs8P256(wrapSec1ToPkcs8(binaryDer));
      } catch (_e2) {
        console.error('Failed to import COINBASE_API_SECRET as PKCS#8 (or wrapped SEC1).');
        throw new Error('Invalid Coinbase API secret (expected ES256 P-256 PKCS#8 PEM)');
      }
    } else {
      console.error('Failed to import COINBASE_API_SECRET as PKCS#8 after SEC1 wrap:', e1 instanceof Error ? e1.message : String(e1));
      throw new Error('Invalid Coinbase API secret (expected ES256 P-256 PKCS#8 PEM)');
    }
  }

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
