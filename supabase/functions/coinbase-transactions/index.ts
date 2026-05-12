import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { SignJWT, importPKCS8, importJWK } from "https://deno.land/x/jose@v5.2.0/index.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
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

const CDP_API_HOST = "api.developer.coinbase.com";
const CDP_API_BASE = `https://${CDP_API_HOST}`;
const TX_PATH = "/onramp/v1/buy/transactions";

// Rate limiting (per client)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 30;

function checkRateLimit(clientId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(clientId);
  if (!entry || now > entry.resetTime) {
    rateLimitMap.set(clientId, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX_REQUESTS) return false;
  entry.count++;
  return true;
}

// ---- JWT generation (mirrors coinbase-headless) ----
async function convertSec1ToPkcs8(sec1Pem: string): Promise<string> {
  const base64Content = sec1Pem
    .replace(/-----BEGIN EC PRIVATE KEY-----/, "")
    .replace(/-----END EC PRIVATE KEY-----/, "")
    .replace(/\s/g, "");
  const sec1Der = Uint8Array.from(atob(base64Content), (c) => c.charCodeAt(0));
  const ecPublicKeyOid = new Uint8Array([0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01]);
  const secp256r1Oid = new Uint8Array([0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07]);
  const concat = (...arrays: Uint8Array[]) => {
    const total = arrays.reduce((s, a) => s + a.length, 0);
    const r = new Uint8Array(total);
    let o = 0;
    for (const a of arrays) { r.set(a, o); o += a.length; }
    return r;
  };
  const derLength = (len: number): Uint8Array => {
    if (len < 128) return new Uint8Array([len]);
    const bytes: number[] = [];
    let n = len;
    while (n > 0) { bytes.unshift(n & 0xff); n >>= 8; }
    return new Uint8Array([0x80 | bytes.length, ...bytes]);
  };
  const wrapTag = (tag: number, content: Uint8Array): Uint8Array =>
    concat(new Uint8Array([tag]), derLength(content.length), content);
  const algId = wrapTag(0x30, concat(wrapTag(0x06, ecPublicKeyOid), wrapTag(0x06, secp256r1Oid)));
  const version = wrapTag(0x02, new Uint8Array([0x00]));
  const privateKeyOctet = wrapTag(0x04, sec1Der);
  const pkcs8Der = wrapTag(0x30, concat(version, algId, privateKeyOctet));
  const pkcs8Base64 = btoa(String.fromCharCode(...pkcs8Der));
  const lines = pkcs8Base64.match(/.{1,64}/g) || [];
  return `-----BEGIN PRIVATE KEY-----\n${lines.join("\n")}\n-----END PRIVATE KEY-----`;
}

async function generateCDPJWT(
  apiKeyId: string,
  apiKeySecret: string,
  method: string,
  host: string,
  path: string,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const nonce = crypto.randomUUID();
  let normalizedSecret = apiKeySecret.replace(/\\n/g, "\n").replace(/\\r/g, "\r").trim();

  let privateKey: CryptoKey;
  let algorithm: string;

  if (normalizedSecret.includes("-----BEGIN")) {
    algorithm = "ES256";
    if (normalizedSecret.includes("BEGIN EC PRIVATE KEY")) {
      normalizedSecret = await convertSec1ToPkcs8(normalizedSecret);
    }
    privateKey = await importPKCS8(normalizedSecret, algorithm) as CryptoKey;
  } else if (normalizedSecret.startsWith("{")) {
    algorithm = "EdDSA";
    const parsed = JSON.parse(normalizedSecret);
    const keyData = parsed.privateKey || parsed.private_key || parsed.key || parsed.d;
    if (!keyData) throw new Error("No private key field in JSON secret");
    let b64 = keyData.replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4 !== 0) b64 += "=";
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).slice(0, 32);
    const d = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    privateKey = await importJWK({ kty: "OKP", crv: "Ed25519", d }, "EdDSA") as CryptoKey;
  } else {
    algorithm = "EdDSA";
    let b64 = normalizedSecret.replace(/\s/g, "").replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4 !== 0) b64 += "=";
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).slice(0, 32);
    const d = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    privateKey = await importJWK({ kty: "OKP", crv: "Ed25519", d }, "EdDSA") as CryptoKey;
  }

  return await new SignJWT({
    sub: apiKeyId,
    iss: "cdp",
    nbf: now,
    exp: now + 120,
    uris: [`${method} ${host}${path}`],
  })
    .setProtectedHeader({ alg: algorithm, kid: apiKeyId, typ: "JWT", nonce })
    .sign(privateKey);
}

function jsonResponse(body: unknown, status: number, corsHeaders: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  const origin = req.headers.get("origin");
  if (!isOriginAllowed(origin)) {
    console.warn(`[COINBASE-TX] CORS denied: ${origin || "(missing)"}`);
    return forbiddenCorsResponse();
  }
  const corsHeaders = getCoinbaseCorsHeaders(origin)!;

  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "GET" && req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405, corsHeaders);
  }

  const clientId = getClientId(req);
  if (!checkRateLimit(clientId)) {
    return jsonResponse({ error: "Rate limit exceeded" }, 429, corsHeaders);
  }

  // Authenticate Supabase user
  const auth = await validateCoinbaseAuth(req);
  if (!auth.authenticated || !auth.userId) {
    return coinbaseUnauthorizedResponse(corsHeaders, auth.error || "Unauthorized");
  }

  // Admin gate
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceKey);
    const { data: roleRow, error: roleErr } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", auth.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (roleErr || !roleRow) {
      logCoinbaseSecurityEvent("ADMIN_DENIED", { clientId, userId: auth.userId });
      return coinbaseForbiddenResponse(corsHeaders, "Admin access required");
    }
  } catch (e) {
    console.error("[COINBASE-TX] admin check failed", e);
    return coinbaseForbiddenResponse(corsHeaders, "Admin verification failed");
  }

  // Parse query params (support both GET ?... and POST {body})
  const url = new URL(req.url);
  let partnerUserRef = url.searchParams.get("partnerUserRef") || "";
  let pageKey = url.searchParams.get("page_key") || "";
  let pageSize = url.searchParams.get("page_size") || "";

  if (req.method === "POST") {
    try {
      const body = await req.json();
      partnerUserRef = body.partnerUserRef ?? partnerUserRef;
      pageKey = body.page_key ?? pageKey;
      pageSize = body.page_size ?? pageSize;
    } catch {}
  }

  // Required Coinbase secrets — accept both new and legacy names
  const apiKeyId =
    Deno.env.get("COINBASE_API_KEY_ID") || Deno.env.get("COINBASE_API_KEY");
  const apiKeySecret =
    Deno.env.get("COINBASE_API_KEY_SECRET") || Deno.env.get("COINBASE_API_SECRET");

  if (!apiKeyId || !apiKeySecret) {
    console.error("[COINBASE-TX] Missing Coinbase API credentials");
    return jsonResponse(
      { error: "Coinbase API credentials not configured on server" },
      500,
      corsHeaders,
    );
  }

  // Build query string
  const qs = new URLSearchParams();
  if (partnerUserRef) qs.set("partner_user_ref", partnerUserRef);
  if (pageKey) qs.set("page_key", pageKey);
  if (pageSize) qs.set("page_size", pageSize);
  const fullPath = qs.toString() ? `${TX_PATH}?${qs.toString()}` : TX_PATH;

  // Generate JWT
  let jwt: string;
  try {
    jwt = await generateCDPJWT(apiKeyId, apiKeySecret, "GET", CDP_API_HOST, TX_PATH);
  } catch (e) {
    console.error("[COINBASE-TX] JWT generation failed:", e);
    return jsonResponse(
      { error: "Failed to generate Coinbase JWT", detail: String(e instanceof Error ? e.message : e) },
      500,
      corsHeaders,
    );
  }

  // Call Coinbase Transaction Status API
  let cbResp: Response;
  try {
    cbResp = await fetch(`${CDP_API_BASE}${fullPath}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[COINBASE-TX] Network error calling Coinbase:", e);
    return jsonResponse({ error: "Network error contacting Coinbase" }, 502, corsHeaders);
  }

  const rawText = await cbResp.text();
  let parsed: any = null;
  try { parsed = rawText ? JSON.parse(rawText) : null; } catch { /* leave null */ }

  if (cbResp.status === 401 || cbResp.status === 403) {
    console.error("[COINBASE-TX] Coinbase auth failed", cbResp.status, rawText.slice(0, 300));
    return jsonResponse(
      { error: "Coinbase rejected our credentials", coinbaseStatus: cbResp.status, detail: parsed ?? rawText },
      cbResp.status,
      corsHeaders,
    );
  }
  if (cbResp.status === 429) {
    return jsonResponse(
      { error: "Coinbase rate limit hit, retry later", coinbaseStatus: 429, detail: parsed ?? rawText },
      429,
      corsHeaders,
    );
  }
  if (!cbResp.ok) {
    console.error("[COINBASE-TX] Coinbase non-200", cbResp.status, rawText.slice(0, 500));
    return jsonResponse(
      { error: "Coinbase API error", coinbaseStatus: cbResp.status, detail: parsed ?? rawText },
      502,
      corsHeaders,
    );
  }

  const transactions = parsed?.transactions ?? parsed?.data ?? [];
  const next_page_key = parsed?.next_page_key ?? parsed?.pagination?.next_page_key ?? null;
  const total_count = parsed?.total_count ?? parsed?.pagination?.total_count ?? null;

  return jsonResponse(
    { transactions, next_page_key, total_count, raw: parsed },
    200,
    corsHeaders,
  );
});
