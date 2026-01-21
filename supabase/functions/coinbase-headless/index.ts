import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { SignJWT, importPKCS8, importJWK } from "https://deno.land/x/jose@v5.2.0/index.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const CDP_API_BASE = 'https://api.developer.coinbase.com';

// Rate limiting
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW_MS = 60000;
const RATE_LIMIT_MAX_REQUESTS = 30;

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
  const now = Math.floor(Date.now() / 1000);
  const nonce = crypto.randomUUID();

  let normalizedSecret = apiKeySecret
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .trim();

  let privateKey;
  let algorithm: string;

  if (normalizedSecret.includes('-----BEGIN')) {
    algorithm = 'ES256';
    if (normalizedSecret.includes('BEGIN EC PRIVATE KEY')) {
      normalizedSecret = await convertSec1ToPkcs8(normalizedSecret);
    }
    privateKey = await importPKCS8(normalizedSecret, algorithm);
  } else if (normalizedSecret.startsWith('{')) {
    algorithm = 'EdDSA';
    const parsed = JSON.parse(normalizedSecret);
    const keyData = parsed.privateKey || parsed.private_key || parsed.key || parsed.d;
    if (!keyData) throw new Error('No private key field found in JSON');
    
    let base64 = keyData.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4 !== 0) base64 += '=';
    const keyBytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    const privateKeyBytes = keyBytes.slice(0, 32);
    const d = btoa(String.fromCharCode(...privateKeyBytes))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    privateKey = await importJWK({ kty: 'OKP', crv: 'Ed25519', d }, 'EdDSA');
  } else {
    algorithm = 'EdDSA';
    let base64Standard = normalizedSecret
      .replace(/\s/g, '')
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    while (base64Standard.length % 4 !== 0) base64Standard += '=';
    
    const keyBytes = Uint8Array.from(atob(base64Standard), c => c.charCodeAt(0));
    const privateKeyBytes = keyBytes.slice(0, 32);
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

async function convertSec1ToPkcs8(sec1Pem: string): Promise<string> {
  const base64Content = sec1Pem
    .replace(/-----BEGIN EC PRIVATE KEY-----/, '')
    .replace(/-----END EC PRIVATE KEY-----/, '')
    .replace(/\s/g, '');

  const sec1Der = Uint8Array.from(atob(base64Content), c => c.charCodeAt(0));

  const ecPublicKeyOid = new Uint8Array([0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01]);
  const secp256r1Oid = new Uint8Array([0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07]);

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

  const algIdContent = concat(
    wrapTag(0x06, ecPublicKeyOid),
    wrapTag(0x06, secp256r1Oid)
  );
  const algId = wrapTag(0x30, algIdContent);

  const version = wrapTag(0x02, new Uint8Array([0x00]));
  const privateKeyOctet = wrapTag(0x04, sec1Der);
  const pkcs8Content = concat(version, algId, privateKeyOctet);
  const pkcs8Der = wrapTag(0x30, pkcs8Content);

  const pkcs8Base64 = btoa(String.fromCharCode(...pkcs8Der));
  const lines = pkcs8Base64.match(/.{1,64}/g) || [];
  
  return `-----BEGIN PRIVATE KEY-----\n${lines.join('\n')}\n-----END PRIVATE KEY-----`;
}

async function callCDPApi(
  method: string,
  path: string,
  body?: Record<string, unknown>
): Promise<Response> {
  const apiKeyId = Deno.env.get('COINBASE_API_KEY');
  const apiKeySecret = Deno.env.get('COINBASE_API_SECRET');

  if (!apiKeyId || !apiKeySecret) {
    throw new Error('Coinbase API credentials not configured');
  }

  const jwt = await generateCDPJWT(
    apiKeyId,
    apiKeySecret,
    method,
    'api.developer.coinbase.com',
    path
  );

  const options: RequestInit = {
    method,
    headers: {
      'Authorization': `Bearer ${jwt}`,
      'Content-Type': 'application/json',
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  return fetch(`${CDP_API_BASE}${path}`, options);
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
    const { action } = body;

    switch (action) {
      case 'getCountries': {
        // Get supported countries and payment methods
        const response = await callCDPApi('GET', '/onramp/v1/buy/config');
        const data = await response.json();
        
        if (!response.ok) {
          console.error('CDP config error:', data);
          return new Response(JSON.stringify({ error: 'Failed to get configuration' }), {
            status: response.status,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'getQuote': {
        // Get buy quote
        const { 
          purchaseCurrency, 
          purchaseNetwork, 
          paymentAmount, 
          paymentCurrency,
          paymentMethod,
          country,
          subdivision,
        } = body;

        if (!purchaseCurrency || !paymentAmount || !paymentCurrency || !paymentMethod || !country) {
          return new Response(JSON.stringify({ error: 'Missing required quote parameters' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const quoteBody: Record<string, unknown> = {
          purchase_currency: purchaseCurrency,
          purchase_network: purchaseNetwork,
          payment_amount: paymentAmount,
          payment_currency: paymentCurrency,
          payment_method: paymentMethod,
          country,
        };

        if (subdivision) {
          quoteBody.subdivision = subdivision;
        }

        console.log('Getting quote:', quoteBody);

        const response = await callCDPApi('POST', '/onramp/v1/buy/quote', quoteBody);
        const data = await response.json();

        if (!response.ok) {
          console.error('CDP quote error:', data);
          return new Response(JSON.stringify({ 
            error: data.message || 'Failed to get quote',
            details: data,
          }), {
            status: response.status,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'createUser': {
        // Create or get user for headless onramp
        const { email, phone } = body;

        if (!email && !phone) {
          return new Response(JSON.stringify({ error: 'Email or phone required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const userBody: Record<string, unknown> = {};
        if (email) userBody.email = email;
        if (phone) userBody.phone = phone;

        console.log('Creating/getting user');

        const response = await callCDPApi('POST', '/onramp/v1/user', userBody);
        const data = await response.json();

        if (!response.ok) {
          console.error('CDP user error:', data);
          return new Response(JSON.stringify({ 
            error: data.message || 'Failed to create user',
            details: data,
          }), {
            status: response.status,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'getSessionToken': {
        // Get session token to generate onramp URL
        const { 
          destinationAddress,
          destinationNetwork,
          assets,
          clientIp,
        } = body;

        if (!destinationAddress || !destinationNetwork) {
          return new Response(JSON.stringify({ error: 'Missing required session parameters' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Map network names to Coinbase blockchain identifiers
        const networkMap: Record<string, string> = {
          'solana': 'solana',
          'ethereum': 'ethereum',
          'base': 'base',
          'polygon': 'polygon',
          'arbitrum': 'arbitrum',
          'optimism': 'optimism',
        };

        const blockchain = networkMap[destinationNetwork.toLowerCase()] || destinationNetwork;

        const sessionBody: Record<string, unknown> = {
          addresses: [{
            address: destinationAddress,
            blockchains: [blockchain],
          }],
          clientIp: clientIp || '0.0.0.0',
        };

        if (assets) {
          sessionBody.assets = assets;
        }

        console.log('Creating session token for:', destinationAddress.slice(0, 10) + '...');

        const response = await callCDPApi('POST', '/onramp/v1/token', sessionBody);
        const data = await response.json();

        if (!response.ok) {
          console.error('CDP session token error:', data);
          return new Response(JSON.stringify({ 
            error: data.message || 'Failed to get session token',
            details: data,
          }), {
            status: response.status,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Return session token and construct the buy URL
        const sessionToken = data.token || data.session_token;
        
        return new Response(JSON.stringify({
          sessionToken,
          ...data,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'generateBuyUrl': {
        // Generate an Onramp URL using session token approach
        const { 
          purchaseCurrency, 
          purchaseNetwork, 
          paymentAmount, 
          paymentCurrency,
          country,
          destinationAddress,
        } = body;

        if (!purchaseCurrency || !paymentAmount || !destinationAddress || !purchaseNetwork) {
          return new Response(JSON.stringify({ error: 'Missing required parameters for buy URL' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Map network names to Coinbase blockchain identifiers
        const networkMap: Record<string, string> = {
          'solana': 'solana',
          'ethereum': 'ethereum',
          'base': 'base',
          'polygon': 'polygon',
          'arbitrum': 'arbitrum',
          'optimism': 'optimism',
        };

        const blockchain = networkMap[purchaseNetwork.toLowerCase()] || purchaseNetwork;

        console.log('Generating session token for:', destinationAddress.slice(0, 10) + '...');

        // Step 1: Get session token
        const sessionBody = {
          addresses: [{
            address: destinationAddress,
            blockchains: [blockchain],
          }],
          assets: [purchaseCurrency],
        };

        const tokenResponse = await callCDPApi('POST', '/onramp/v1/token', sessionBody);
        const tokenData = await tokenResponse.json();

        if (!tokenResponse.ok) {
          console.error('CDP session token error:', tokenData);
          return new Response(JSON.stringify({ 
            error: tokenData.message || 'Failed to get session token',
            details: tokenData,
          }), {
            status: tokenResponse.status,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const sessionToken = tokenData.token;
        if (!sessionToken) {
          console.error('No session token in response:', tokenData);
          return new Response(JSON.stringify({ 
            error: 'No session token received',
          }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        console.log('Session token obtained, building URL');

        // Step 2: Build the Coinbase Pay URL with parameters
        const appId = Deno.env.get('COINBASE_ONRAMP_APP_ID') || '';
        
        const urlParams = new URLSearchParams({
          sessionToken: sessionToken,
          defaultAsset: purchaseCurrency,
          defaultNetwork: blockchain,
          presetFiatAmount: paymentAmount,
          fiatCurrency: paymentCurrency || 'USD',
        });

        if (appId) {
          urlParams.set('appId', appId);
        }

        const buyUrl = `https://pay.coinbase.com/buy?${urlParams.toString()}`;

        console.log('Generated buy URL successfully');

        return new Response(JSON.stringify({
          buyUrl,
          sessionToken,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'getTransaction': {
        // Get transaction status
        const { transactionId } = body;

        if (!transactionId) {
          return new Response(JSON.stringify({ error: 'Transaction ID required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const response = await callCDPApi('GET', `/onramp/v1/buy/transaction/${transactionId}`);
        const data = await response.json();

        if (!response.ok) {
          console.error('CDP transaction error:', data);
          return new Response(JSON.stringify({ 
            error: data.message || 'Failed to get transaction',
          }), {
            status: response.status,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      default:
        return new Response(JSON.stringify({ error: 'Invalid action' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

  } catch (error: unknown) {
    console.error('Headless onramp error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
