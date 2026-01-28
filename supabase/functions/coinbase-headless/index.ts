import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { SignJWT, importPKCS8, importJWK } from "https://deno.land/x/jose@v5.2.0/index.ts";
import {
  getCoinbaseCorsHeaders,
  forbiddenCorsResponse,
  isOriginAllowed,
  validateCoinbaseAuth,
  coinbaseUnauthorizedResponse,
  coinbaseForbiddenResponse,
  getClientId,
  logCoinbaseSecurityEvent,
} from "../_shared/coinbase-auth.ts";

const CDP_API_BASE = "https://api.developer.coinbase.com";

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

  let normalizedSecret = apiKeySecret.replace(/\\n/g, "\n").replace(/\\r/g, "\r").trim();

  let privateKey;
  let algorithm: string;

  if (normalizedSecret.includes("-----BEGIN")) {
    algorithm = "ES256";
    if (normalizedSecret.includes("BEGIN EC PRIVATE KEY")) {
      normalizedSecret = await convertSec1ToPkcs8(normalizedSecret);
    }
    privateKey = await importPKCS8(normalizedSecret, algorithm);
  } else if (normalizedSecret.startsWith("{")) {
    algorithm = "EdDSA";
    const parsed = JSON.parse(normalizedSecret);
    const keyData = parsed.privateKey || parsed.private_key || parsed.key || parsed.d;
    if (!keyData) throw new Error("No private key field found in JSON");

    let base64 = keyData.replace(/-/g, "+").replace(/_/g, "/");
    while (base64.length % 4 !== 0) base64 += "=";
    const keyBytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const privateKeyBytes = keyBytes.slice(0, 32);
    const d = btoa(String.fromCharCode(...privateKeyBytes))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    privateKey = await importJWK({ kty: "OKP", crv: "Ed25519", d }, "EdDSA");
  } else {
    algorithm = "EdDSA";
    let base64Standard = normalizedSecret
      .replace(/\s/g, "")
      .replace(/-/g, "+")
      .replace(/_/g, "/");
    while (base64Standard.length % 4 !== 0) base64Standard += "=";

    const keyBytes = Uint8Array.from(atob(base64Standard), (c) => c.charCodeAt(0));
    const privateKeyBytes = keyBytes.slice(0, 32);
    const d = btoa(String.fromCharCode(...privateKeyBytes))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    privateKey = await importJWK({ kty: "OKP", crv: "Ed25519", d }, "EdDSA");
  }

  const jwt = await new SignJWT({
    sub: apiKeyId,
    iss: "cdp",
    nbf: now,
    exp: now + 120,
    uris: [`${requestMethod} ${requestHost}${requestPath}`],
  })
    .setProtectedHeader({ alg: algorithm, kid: apiKeyId, typ: "JWT", nonce })
    .sign(privateKey);

  return jwt;
}

async function convertSec1ToPkcs8(sec1Pem: string): Promise<string> {
  const base64Content = sec1Pem
    .replace(/-----BEGIN EC PRIVATE KEY-----/, "")
    .replace(/-----END EC PRIVATE KEY-----/, "")
    .replace(/\s/g, "");

  const sec1Der = Uint8Array.from(atob(base64Content), (c) => c.charCodeAt(0));

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

  const algIdContent = concat(wrapTag(0x06, ecPublicKeyOid), wrapTag(0x06, secp256r1Oid));
  const algId = wrapTag(0x30, algIdContent);

  const version = wrapTag(0x02, new Uint8Array([0x00]));
  const privateKeyOctet = wrapTag(0x04, sec1Der);
  const pkcs8Content = concat(version, algId, privateKeyOctet);
  const pkcs8Der = wrapTag(0x30, pkcs8Content);

  const pkcs8Base64 = btoa(String.fromCharCode(...pkcs8Der));
  const lines = pkcs8Base64.match(/.{1,64}/g) || [];

  return `-----BEGIN PRIVATE KEY-----\n${lines.join("\n")}\n-----END PRIVATE KEY-----`;
}

async function callCDPApi(
  method: string,
  path: string,
  body?: Record<string, unknown>
): Promise<Response> {
  const apiKeyId = Deno.env.get("COINBASE_API_KEY");
  const apiKeySecret = Deno.env.get("COINBASE_API_SECRET");

  if (!apiKeyId || !apiKeySecret) {
    throw new Error("Coinbase API credentials not configured");
  }

  const jwt = await generateCDPJWT(apiKeyId, apiKeySecret, method, "api.developer.coinbase.com", path);

  const options: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  return fetch(`${CDP_API_BASE}${path}`, options);
}

// Actions that require authentication AND wallet binding (session token minting)
const PROTECTED_WALLET_ACTIONS = ["getSessionToken", "generateBuyUrl"];

// Actions that require authentication only (no wallet binding needed)
const PROTECTED_ACTIONS = ["createUser"];

// Actions that are public (config/quote info)
const PUBLIC_ACTIONS = ["getCountries", "getQuote", "getTransaction"];

// Network mapping
const NETWORK_MAP: Record<string, string> = {
  solana: "solana",
  ethereum: "ethereum",
  base: "base",
  polygon: "polygon",
  arbitrum: "arbitrum",
  optimism: "optimism",
};

// Wallet address validation patterns
const SOLANA_ADDRESS_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const EVM_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

/**
 * Validate wallet address format for a given network
 */
function isValidAddressForNetwork(address: string, network: string): boolean {
  const normalizedNetwork = network.toLowerCase();
  
  if (normalizedNetwork === "solana") {
    return SOLANA_ADDRESS_REGEX.test(address);
  }
  
  // All other networks are EVM-compatible
  return EVM_ADDRESS_REGEX.test(address);
}

/**
 * Compare wallet addresses (case-insensitive for EVM, case-sensitive for Solana)
 */
function addressesMatch(addr1: string, addr2: string, network: string): boolean {
  const normalizedNetwork = network.toLowerCase();
  
  if (normalizedNetwork === "solana") {
    // Solana addresses are case-sensitive (base58)
    return addr1 === addr2;
  }
  
  // EVM addresses are case-insensitive
  return addr1.toLowerCase() === addr2.toLowerCase();
}

serve(async (req) => {
  const origin = req.headers.get("origin");
  const clientId = getClientId(req);

  // Strict CORS check - reject requests with missing or invalid origin
  if (!isOriginAllowed(origin)) {
    logCoinbaseSecurityEvent("CORS_DENIED", { clientId, origin: origin || "(missing)" });
    return forbiddenCorsResponse();
  }

  const corsHeaders = getCoinbaseCorsHeaders(origin)!;

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // Rate limiting
    if (!checkRateLimit(clientId)) {
      logCoinbaseSecurityEvent("RATE_LIMIT_EXCEEDED", { clientId, function: "coinbase-headless" });
      return new Response(JSON.stringify({ error: "Too many requests" }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { action, destinationAddress: clientDestinationAddress, connectedWalletAddress } = body;

    // Validate action
    if (!action || typeof action !== "string") {
      return new Response(JSON.stringify({ error: "Action required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if action requires authentication with wallet binding
    if (PROTECTED_WALLET_ACTIONS.includes(action)) {
      const authResult = await validateCoinbaseAuth(req);

      if (!authResult.authenticated) {
        logCoinbaseSecurityEvent("AUTH_FAILED_PROTECTED_ACTION", {
          clientId,
          action,
          error: authResult.error,
        });
        return coinbaseUnauthorizedResponse(corsHeaders, authResult.error);
      }

      // Determine destination address with precedence logic:
      // 1. If client provides connectedWalletAddress (current session's Particle wallet), use it as authoritative
      // 2. If client provides destinationAddress, validate it matches connectedWalletAddress
      // 3. Fall back to authResult.walletAddress (from profile) if available
      
      let destinationAddress: string;
      const destinationNetwork = body.destinationNetwork || body.purchaseNetwork || "solana";

      // The connectedWalletAddress is the user's current Particle wallet in this session
      // This is the authoritative source for what wallet the user has connected right now
      const sessionWallet = connectedWalletAddress;

      if (clientDestinationAddress) {
        // Client provided a specific destination - validate it
        
        // First, validate address format for the network
        if (!isValidAddressForNetwork(clientDestinationAddress, destinationNetwork)) {
          logCoinbaseSecurityEvent("INVALID_ADDRESS_FORMAT", {
            clientId,
            userId: authResult.userId,
            action,
            address: clientDestinationAddress.slice(0, 10) + "...",
            network: destinationNetwork,
          });
          return coinbaseForbiddenResponse(
            corsHeaders,
            `Invalid wallet address format for ${destinationNetwork} network`
          );
        }

        // If we have a session wallet, the destination MUST match it
        if (sessionWallet) {
          if (!addressesMatch(clientDestinationAddress, sessionWallet, destinationNetwork)) {
            logCoinbaseSecurityEvent("WALLET_MISMATCH_SESSION", {
              clientId,
              userId: authResult.userId,
              action,
              clientAddress: clientDestinationAddress.slice(0, 10) + "...",
              sessionWallet: sessionWallet.slice(0, 10) + "...",
            });
            return coinbaseForbiddenResponse(
              corsHeaders,
              "Destination wallet does not match your connected wallet"
            );
          }
          destinationAddress = clientDestinationAddress;
        } else if (authResult.walletAddress) {
          // No session wallet provided, but profile has a linked wallet - validate against that
          if (!addressesMatch(clientDestinationAddress, authResult.walletAddress, destinationNetwork)) {
            logCoinbaseSecurityEvent("WALLET_MISMATCH_PROFILE", {
              clientId,
              userId: authResult.userId,
              action,
              clientAddress: clientDestinationAddress.slice(0, 10) + "...",
              linkedAddress: authResult.walletAddress.slice(0, 10) + "...",
            });
            return coinbaseForbiddenResponse(
              corsHeaders,
              "Destination wallet does not match your linked wallet"
            );
          }
          destinationAddress = clientDestinationAddress;
        } else {
          // No way to verify the destination address matches user's wallet - reject
          logCoinbaseSecurityEvent("UNVERIFIABLE_DESTINATION", {
            clientId,
            userId: authResult.userId,
            action,
            clientAddress: clientDestinationAddress.slice(0, 10) + "...",
          });
          return coinbaseForbiddenResponse(
            corsHeaders,
            "Cannot verify destination wallet. Please ensure your wallet is connected."
          );
        }
      } else if (sessionWallet) {
        // No client destination provided, use the session wallet (current Particle wallet)
        if (!isValidAddressForNetwork(sessionWallet, destinationNetwork)) {
          logCoinbaseSecurityEvent("INVALID_SESSION_WALLET_FORMAT", {
            clientId,
            userId: authResult.userId,
            action,
            sessionWallet: sessionWallet.slice(0, 10) + "...",
            network: destinationNetwork,
          });
          return coinbaseForbiddenResponse(
            corsHeaders,
            `Connected wallet address format is invalid for ${destinationNetwork} network`
          );
        }
        destinationAddress = sessionWallet;
      } else if (authResult.walletAddress) {
        // Fall back to profile's linked wallet
        destinationAddress = authResult.walletAddress;
      } else {
        // No wallet available from any source
        logCoinbaseSecurityEvent("NO_WALLET_AVAILABLE", {
          clientId,
          userId: authResult.userId,
          action,
        });
        return coinbaseForbiddenResponse(
          corsHeaders,
          "No wallet available. Please connect your wallet first."
        );
      }

      console.log(
        `[COINBASE-AUTH] Protected action '${action}' authorized for user ${authResult.userId?.slice(0, 8)}... with wallet ${destinationAddress.slice(0, 10)}...`
      );

      // Handle protected wallet actions with verified address
      if (action === "getSessionToken") {
        const { assets, clientIp } = body;

        const blockchain = NETWORK_MAP[destinationNetwork.toLowerCase()] || destinationNetwork;

        const sessionBody: Record<string, unknown> = {
          addresses: [
            {
              address: destinationAddress,
              blockchains: [blockchain],
            },
          ],
          clientIp: clientIp || "0.0.0.0",
        };

        if (assets) {
          sessionBody.assets = assets;
        }

        console.log("[COINBASE] Creating session token for:", destinationAddress.slice(0, 10) + "...");

        const response = await callCDPApi("POST", "/onramp/v1/token", sessionBody);
        const data = await response.json();

        if (!response.ok) {
          console.error("[COINBASE] Session token error:", data);
          return new Response(
            JSON.stringify({
              error: data.message || "Failed to get session token",
              details: data,
            }),
            {
              status: response.status,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }

        const sessionToken = data.token || data.session_token;

        return new Response(
          JSON.stringify({
            sessionToken,
            ...data,
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      if (action === "generateBuyUrl") {
        const { purchaseCurrency, purchaseNetwork, paymentAmount, paymentCurrency } = body;

        if (!purchaseCurrency || !paymentAmount || !purchaseNetwork) {
          return new Response(JSON.stringify({ error: "Missing required parameters for buy URL" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const blockchain = NETWORK_MAP[purchaseNetwork.toLowerCase()] || purchaseNetwork;

        console.log("[COINBASE] Generating session token for:", destinationAddress.slice(0, 10) + "...");

        // Step 1: Get session token
        const sessionBody = {
          addresses: [
            {
              address: destinationAddress,
              blockchains: [blockchain],
            },
          ],
          assets: [purchaseCurrency],
        };

        const tokenResponse = await callCDPApi("POST", "/onramp/v1/token", sessionBody);
        const tokenData = await tokenResponse.json();

        if (!tokenResponse.ok) {
          console.error("[COINBASE] Session token error:", tokenData);
          return new Response(
            JSON.stringify({
              error: tokenData.message || "Failed to get session token",
              details: tokenData,
            }),
            {
              status: tokenResponse.status,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }

        const sessionToken = tokenData.token;
        if (!sessionToken) {
          console.error("[COINBASE] No session token in response:", tokenData);
          return new Response(
            JSON.stringify({
              error: "No session token received",
            }),
            {
              status: 500,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }

        console.log("[COINBASE] Session token obtained, building URL");

        // Step 2: Build the Coinbase Pay URL with parameters
        const appId = Deno.env.get("COINBASE_ONRAMP_APP_ID") || "";

        const urlParams = new URLSearchParams({
          sessionToken: sessionToken,
          defaultAsset: purchaseCurrency,
          defaultNetwork: blockchain,
          presetFiatAmount: paymentAmount,
          fiatCurrency: paymentCurrency || "USD",
        });

        if (appId) {
          urlParams.set("appId", appId);
        }

        const buyUrl = `https://pay.coinbase.com/buy?${urlParams.toString()}`;

        console.log("[COINBASE] Generated buy URL successfully");

        return new Response(
          JSON.stringify({
            buyUrl,
            sessionToken,
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    // Check if action requires authentication only (no wallet binding)
    if (PROTECTED_ACTIONS.includes(action)) {
      const authResult = await validateCoinbaseAuth(req);

      if (!authResult.authenticated) {
        logCoinbaseSecurityEvent("AUTH_FAILED_PROTECTED_ACTION", {
          clientId,
          action,
          error: authResult.error,
        });
        return coinbaseUnauthorizedResponse(corsHeaders, authResult.error);
      }

      console.log(
        `[COINBASE-AUTH] Protected action '${action}' authorized for user ${authResult.userId?.slice(0, 8)}...`
      );

      if (action === "createUser") {
        const { email, phone } = body;

        if (!email && !phone) {
          return new Response(JSON.stringify({ error: "Email or phone required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const userBody: Record<string, unknown> = {};
        if (email) userBody.email = email;
        if (phone) userBody.phone = phone;

        console.log("[COINBASE] Creating/getting user");

        const response = await callCDPApi("POST", "/onramp/v1/user", userBody);
        const data = await response.json();

        if (!response.ok) {
          console.error("[COINBASE] User error:", data);
          return new Response(
            JSON.stringify({
              error: data.message || "Failed to create user",
              details: data,
            }),
            {
              status: response.status,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }

        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Handle public actions
    switch (action) {
      case "getCountries": {
        const response = await callCDPApi("GET", "/onramp/v1/buy/config");
        const data = await response.json();

        if (!response.ok) {
          console.error("[COINBASE] Config error:", data);
          return new Response(JSON.stringify({ error: "Failed to get configuration" }), {
            status: response.status,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "getQuote": {
        const { purchaseCurrency, purchaseNetwork, paymentAmount, paymentCurrency, paymentMethod, country, subdivision } =
          body;

        if (!purchaseCurrency || !paymentAmount || !paymentCurrency || !paymentMethod || !country) {
          return new Response(JSON.stringify({ error: "Missing required quote parameters" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
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

        console.log("[COINBASE] Getting quote:", quoteBody);

        const response = await callCDPApi("POST", "/onramp/v1/buy/quote", quoteBody);
        const data = await response.json();

        if (!response.ok) {
          console.error("[COINBASE] Quote error:", data);
          return new Response(
            JSON.stringify({
              error: data.message || "Failed to get quote",
              details: data,
            }),
            {
              status: response.status,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }

        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "getTransaction": {
        const { transactionId } = body;

        if (!transactionId) {
          return new Response(JSON.stringify({ error: "Transaction ID required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const response = await callCDPApi("GET", `/onramp/v1/buy/transaction/${transactionId}`);
        const data = await response.json();

        if (!response.ok) {
          console.error("[COINBASE] Transaction error:", data);
          return new Response(
            JSON.stringify({
              error: data.message || "Failed to get transaction",
            }),
            {
              status: response.status,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }

        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      default:
        return new Response(JSON.stringify({ error: "Invalid action" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
  } catch (error: unknown) {
    console.error("[COINBASE] Headless onramp error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    
    // Even on error, we need valid CORS headers - but origin was already validated above
    const corsHeaders = getCoinbaseCorsHeaders(origin)!;
    
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
