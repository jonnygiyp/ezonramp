import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { SignJWT, importPKCS8, importJWK } from "https://deno.land/x/jose@v5.2.0/index.ts";

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

// Generate CDP JWT for API authentication using jose library
async function generateCDPJWT(
  apiKeyId: string, 
  apiKeySecret: string,
  requestMethod: string,
  requestHost: string,
  requestPath: string
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const nonce = crypto.randomUUID();

  // Normalize the secret - handle escaped newlines from env vars
  let normalizedSecret = apiKeySecret
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .trim();

  console.log('Secret length:', normalizedSecret.length);
  console.log('Secret starts with:', normalizedSecret.substring(0, 20));

  let privateKey;
  let algorithm: string;

  // Detect key type based on format
  if (normalizedSecret.includes('-----BEGIN')) {
    // PEM format - ES256 EC key
    algorithm = 'ES256';
    if (normalizedSecret.includes('BEGIN EC PRIVATE KEY')) {
      normalizedSecret = await convertSec1ToPkcs8(normalizedSecret);
    }
    privateKey = await importPKCS8(normalizedSecret, algorithm);
  } else if (normalizedSecret.startsWith('{')) {
    // JSON format - parse and extract the key
    algorithm = 'EdDSA';
    console.log('Detected JSON format key');
    try {
      const parsed = JSON.parse(normalizedSecret);
      // Coinbase CDP keys have a "privateKey" field
      const keyData = parsed.privateKey || parsed.private_key || parsed.key || parsed.d;
      if (!keyData) {
        throw new Error('No private key field found in JSON');
      }
      
      // The key data might be in various formats
      let keyBytes: Uint8Array;
      if (typeof keyData === 'string') {
        // Convert URL-safe base64 to standard
        let base64 = keyData.replace(/-/g, '+').replace(/_/g, '/');
        while (base64.length % 4 !== 0) base64 += '=';
        keyBytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
      } else {
        throw new Error('Unexpected key format in JSON');
      }
      
      const privateKeyBytes = keyBytes.slice(0, 32);
      const d = btoa(String.fromCharCode(...privateKeyBytes))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      privateKey = await importJWK({ kty: 'OKP', crv: 'Ed25519', d }, 'EdDSA');
    } catch (e) {
      console.error('Failed to parse JSON key:', e);
      throw new Error('Invalid JSON key format');
    }
  } else {
    // Raw base64 - Ed25519 key
    algorithm = 'EdDSA';
    console.log('Detected Ed25519 key (raw base64)');
    
    // Remove any whitespace and convert URL-safe base64 to standard base64
    let base64Standard = normalizedSecret
      .replace(/\s/g, '')
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    
    // Add padding if needed
    while (base64Standard.length % 4 !== 0) {
      base64Standard += '=';
    }
    
    console.log('Base64 prepared, length:', base64Standard.length);
    
    // Decode base64 to get raw key bytes
    let keyBytes: Uint8Array;
    try {
      keyBytes = Uint8Array.from(atob(base64Standard), c => c.charCodeAt(0));
    } catch (e) {
      console.error('Failed to decode base64:', e);
      // Log first few chars to debug (safe since it's just format info)
      console.error('First 30 chars:', normalizedSecret.substring(0, 30));
      throw new Error('Invalid API secret format - failed to decode base64');
    }
    console.log('Key bytes length:', keyBytes.length);
    
    // Ed25519 private key is 32 bytes, but Coinbase gives 64 bytes (seed + public key)
    // We only need the first 32 bytes (the seed/private key)
    const privateKeyBytes = keyBytes.slice(0, 32);
    
    // Import as JWK - convert to URL-safe base64 for JWK 'd' parameter
    const d = btoa(String.fromCharCode(...privateKeyBytes))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    
    privateKey = await importJWK({ kty: 'OKP', crv: 'Ed25519', d }, 'EdDSA');
  }

  const jwt = await new SignJWT({
    sub: apiKeyId,
    iss: 'cdp',
    nbf: now,
    exp: now + 120,
    uris: [`${requestMethod} ${requestHost}${requestPath}`],
  })
    .setProtectedHeader({ alg: algorithm, kid: apiKeyId, typ: 'JWT', nonce })
    .sign(privateKey);

  return jwt;
}

// Import key from SEC1 EC private key by extracting raw bytes and using importJWK
async function importKeyFromSec1(sec1Pem: string): Promise<CryptoKey> {
  // Extract the base64 content
  const base64Content = sec1Pem
    .replace(/-----BEGIN EC PRIVATE KEY-----/, '')
    .replace(/-----END EC PRIVATE KEY-----/, '')
    .replace(/\s/g, '');

  // Decode base64 to binary DER
  const der = Uint8Array.from(atob(base64Content), c => c.charCodeAt(0));

  // Parse the SEC1 ECPrivateKey structure to extract the raw private key bytes
  // ECPrivateKey ::= SEQUENCE {
  //   version INTEGER { ecPrivkeyVer1(1) },
  //   privateKey OCTET STRING,
  //   parameters [0] ECParameters {{ NamedCurve }} OPTIONAL,
  //   publicKey [1] BIT STRING OPTIONAL
  // }
  
  // Simple DER parsing - find the private key octet string
  // The structure starts with SEQUENCE (0x30), then version (0x02 0x01 0x01),
  // then OCTET STRING (0x04) containing the 32-byte private key
  
  let offset = 0;
  if (der[offset] !== 0x30) throw new Error('Expected SEQUENCE');
  offset++;
  
  // Skip length
  if (der[offset] & 0x80) {
    const lenBytes = der[offset] & 0x7f;
    offset += 1 + lenBytes;
  } else {
    offset++;
  }
  
  // Skip version (INTEGER)
  if (der[offset] !== 0x02) throw new Error('Expected INTEGER for version');
  offset++;
  const versionLen = der[offset];
  offset += 1 + versionLen;
  
  // Now we should be at the privateKey OCTET STRING
  if (der[offset] !== 0x04) throw new Error('Expected OCTET STRING for privateKey');
  offset++;
  const privKeyLen = der[offset];
  offset++;
  
  const privateKeyBytes = der.slice(offset, offset + privKeyLen);
  offset += privKeyLen;
  
  // Try to find the public key (tagged [1])
  let publicKeyBytes: Uint8Array | null = null;
  while (offset < der.length) {
    const tag = der[offset];
    offset++;
    let len = der[offset];
    offset++;
    if (len & 0x80) {
      const lenBytes = len & 0x7f;
      len = 0;
      for (let i = 0; i < lenBytes; i++) {
        len = (len << 8) | der[offset + i];
      }
      offset += lenBytes;
    }
    
    if (tag === 0xa1) { // [1] - publicKey
      // It's a BIT STRING, skip the first byte (unused bits count)
      if (der[offset] === 0x03) { // BIT STRING
        offset++;
        let pubLen = der[offset];
        offset++;
        if (pubLen & 0x80) {
          const lenBytes = pubLen & 0x7f;
          pubLen = 0;
          for (let i = 0; i < lenBytes; i++) {
            pubLen = (pubLen << 8) | der[offset + i];
          }
          offset += lenBytes;
        }
        const unusedBits = der[offset];
        offset++;
        publicKeyBytes = der.slice(offset, offset + pubLen - 1);
      }
      break;
    } else {
      offset += len;
    }
  }
  
  // Convert to JWK format
  const base64url = (bytes: Uint8Array) => 
    btoa(String.fromCharCode(...bytes))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  
  // Pad private key to 32 bytes if needed
  const paddedPrivKey = new Uint8Array(32);
  paddedPrivKey.set(privateKeyBytes, 32 - privateKeyBytes.length);
  
  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    d: base64url(paddedPrivKey),
  } as Record<string, unknown>;
  
  // If we found the public key, add x and y coordinates
  if (publicKeyBytes && publicKeyBytes.length === 65 && publicKeyBytes[0] === 0x04) {
    jwk.x = base64url(publicKeyBytes.slice(1, 33));
    jwk.y = base64url(publicKeyBytes.slice(33, 65));
  }
  
  console.log('Importing via JWK, has public key:', !!jwk.x);
  
  return await importJWK(jwk, 'ES256') as CryptoKey;
}

// Convert SEC1 EC private key (BEGIN EC PRIVATE KEY) to PKCS#8 (BEGIN PRIVATE KEY)
async function convertSec1ToPkcs8(sec1Pem: string): Promise<string> {
  // Extract the base64 content
  const base64Content = sec1Pem
    .replace(/-----BEGIN EC PRIVATE KEY-----/, '')
    .replace(/-----END EC PRIVATE KEY-----/, '')
    .replace(/\s/g, '');

  // Decode base64 to binary
  const sec1Der = Uint8Array.from(atob(base64Content), c => c.charCodeAt(0));

  // PKCS#8 wrapper for EC key with P-256 curve
  // Structure: SEQUENCE { INTEGER 0, SEQUENCE { OID ecPublicKey, OID secp256r1 }, OCTET STRING { SEC1 key } }
  const ecPublicKeyOid = new Uint8Array([0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01]); // 1.2.840.10045.2.1
  const secp256r1Oid = new Uint8Array([0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07]); // 1.2.840.10045.3.1.7

  const concat = (...arrays: Uint8Array[]) => {
    const total = arrays.reduce((sum, a) => sum + a.length, 0);
    const result = new Uint8Array(total);
    let offset = 0;
    for (const a of arrays) {
      result.set(a, offset);
      offset += a.length;
    }
    return result;
  };

  const derLength = (len: number): Uint8Array => {
    if (len < 128) return new Uint8Array([len]);
    const bytes: number[] = [];
    let n = len;
    while (n > 0) {
      bytes.unshift(n & 0xff);
      n >>= 8;
    }
    return new Uint8Array([0x80 | bytes.length, ...bytes]);
  };

  const wrapTag = (tag: number, content: Uint8Array): Uint8Array => {
    return concat(new Uint8Array([tag]), derLength(content.length), content);
  };

  // Build algorithm identifier: SEQUENCE { OID, OID }
  const algIdContent = concat(
    wrapTag(0x06, ecPublicKeyOid),
    wrapTag(0x06, secp256r1Oid)
  );
  const algId = wrapTag(0x30, algIdContent);

  // Build PKCS#8: SEQUENCE { INTEGER 0, algId, OCTET STRING { SEC1 key } }
  const version = wrapTag(0x02, new Uint8Array([0x00]));
  const privateKeyOctet = wrapTag(0x04, sec1Der);
  const pkcs8Content = concat(version, algId, privateKeyOctet);
  const pkcs8Der = wrapTag(0x30, pkcs8Content);

  // Convert to base64 and wrap in PEM
  const pkcs8Base64 = btoa(String.fromCharCode(...pkcs8Der));
  const lines = pkcs8Base64.match(/.{1,64}/g) || [];
  
  return `-----BEGIN PRIVATE KEY-----\n${lines.join('\n')}\n-----END PRIVATE KEY-----`;
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

    // Build session token request - omit clientIp as edge functions don't have reliable access to it
    const tokenRequestBody: Record<string, unknown> = {
      addresses: [{
        address: destinationAddress,
        blockchains: blockchains,
      }],
      assets: assets,
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
