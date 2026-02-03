import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { SignJWT, importPKCS8, importJWK } from "https://deno.land/x/jose@v5.2.0/index.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Coinbase Webhook Manager
 * 
 * Programmatically manages Coinbase CDP webhook subscriptions.
 * Actions:
 * - create: Create a new webhook subscription (returns signing secret)
 * - list: List all webhook subscriptions
 * - get: Get a specific subscription by ID
 * - update: Update an existing subscription
 * - delete: Delete a subscription
 */

const CDP_API_BASE = "https://api.cdp.coinbase.com";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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

  const jwt = await generateCDPJWT(apiKeyId, apiKeySecret, method, "api.cdp.coinbase.com", path);

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

/**
 * Validate admin user from JWT
 */
async function validateAdminUser(req: Request): Promise<{ isAdmin: boolean; userId?: string; error?: string }> {
  const authHeader = req.headers.get("Authorization");
  
  if (!authHeader?.startsWith("Bearer ")) {
    return { isAdmin: false, error: "Authorization required" };
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

  if (!supabaseUrl || !supabaseAnonKey) {
    return { isAdmin: false, error: "Server configuration error" };
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const token = authHeader.replace("Bearer ", "");
  const { data, error } = await supabase.auth.getClaims(token);

  if (error || !data?.claims) {
    return { isAdmin: false, error: "Invalid token" };
  }

  const userId = data.claims.sub as string;

  // Check if user is admin
  const { data: isAdmin } = await supabase.rpc("is_admin", { _user_id: userId });

  if (!isAdmin) {
    return { isAdmin: false, userId, error: "Admin access required" };
  }

  return { isAdmin: true, userId };
}

serve(async (req) => {
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
    // Validate admin user
    const authResult = await validateAdminUser(req);
    if (!authResult.isAdmin) {
      return new Response(JSON.stringify({ error: authResult.error }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { action } = body;

    console.log(`[COINBASE-WEBHOOK-MANAGER] Admin ${authResult.userId?.slice(0, 8)}... performing action: ${action}`);

    switch (action) {
      case "create": {
        // Create a new webhook subscription
        const { webhookUrl, description } = body;

        if (!webhookUrl) {
          return new Response(JSON.stringify({ error: "webhookUrl is required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const subscriptionBody = {
          description: description || "Onramp transaction status webhook",
          eventTypes: [
            "onramp.transaction.created",
            "onramp.transaction.updated",
            "onramp.transaction.success",
            "onramp.transaction.failed",
          ],
          target: {
            url: webhookUrl,
            method: "POST",
          },
          labels: {},
          isEnabled: true,
        };

        console.log("[COINBASE-WEBHOOK-MANAGER] Creating subscription:", webhookUrl);

        const response = await callCDPApi(
          "POST",
          "/platform/v2/data/webhooks/subscriptions",
          subscriptionBody
        );

        const data = await response.json();

        if (!response.ok) {
          console.error("[COINBASE-WEBHOOK-MANAGER] Create error:", data);
          return new Response(
            JSON.stringify({
              error: data.message || "Failed to create webhook subscription",
              details: data,
            }),
            {
              status: response.status,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }

        // Extract the signing secret from metadata
        const signingSecret = data.metadata?.secret;
        const subscriptionId = data.subscriptionId;

        console.log(`[COINBASE-WEBHOOK-MANAGER] Created subscription: ${subscriptionId}`);
        console.log(`[COINBASE-WEBHOOK-MANAGER] IMPORTANT: Save the signing secret securely!`);

        return new Response(
          JSON.stringify({
            success: true,
            subscriptionId,
            signingSecret,
            message: "IMPORTANT: Save the signingSecret as COINBASE_WEBHOOK_SECRET in your environment!",
            subscription: data,
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      case "list": {
        // List all webhook subscriptions
        console.log("[COINBASE-WEBHOOK-MANAGER] Listing subscriptions");

        const response = await callCDPApi(
          "GET",
          "/platform/v2/data/webhooks/subscriptions"
        );

        const data = await response.json();

        if (!response.ok) {
          console.error("[COINBASE-WEBHOOK-MANAGER] List error:", data);
          return new Response(
            JSON.stringify({
              error: data.message || "Failed to list webhook subscriptions",
              details: data,
            }),
            {
              status: response.status,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }

        return new Response(JSON.stringify({ subscriptions: data }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "get": {
        // Get a specific subscription
        const { subscriptionId } = body;

        if (!subscriptionId) {
          return new Response(JSON.stringify({ error: "subscriptionId is required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        console.log(`[COINBASE-WEBHOOK-MANAGER] Getting subscription: ${subscriptionId}`);

        const response = await callCDPApi(
          "GET",
          `/platform/v2/data/webhooks/subscriptions/${subscriptionId}`
        );

        const data = await response.json();

        if (!response.ok) {
          console.error("[COINBASE-WEBHOOK-MANAGER] Get error:", data);
          return new Response(
            JSON.stringify({
              error: data.message || "Failed to get webhook subscription",
              details: data,
            }),
            {
              status: response.status,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }

        return new Response(JSON.stringify({ subscription: data }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "update": {
        // Update a subscription
        const { subscriptionId, webhookUrl, description, isEnabled } = body;

        if (!subscriptionId) {
          return new Response(JSON.stringify({ error: "subscriptionId is required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const updateBody: Record<string, unknown> = {
          eventTypes: [
            "onramp.transaction.created",
            "onramp.transaction.updated",
            "onramp.transaction.success",
            "onramp.transaction.failed",
          ],
          labels: {},
        };

        if (description !== undefined) updateBody.description = description;
        if (isEnabled !== undefined) updateBody.isEnabled = isEnabled;
        if (webhookUrl) {
          updateBody.target = {
            url: webhookUrl,
            method: "POST",
          };
        }

        console.log(`[COINBASE-WEBHOOK-MANAGER] Updating subscription: ${subscriptionId}`);

        const response = await callCDPApi(
          "PUT",
          `/platform/v2/data/webhooks/subscriptions/${subscriptionId}`,
          updateBody
        );

        const data = await response.json();

        if (!response.ok) {
          console.error("[COINBASE-WEBHOOK-MANAGER] Update error:", data);
          return new Response(
            JSON.stringify({
              error: data.message || "Failed to update webhook subscription",
              details: data,
            }),
            {
              status: response.status,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }

        return new Response(JSON.stringify({ success: true, subscription: data }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "delete": {
        // Delete a subscription
        const { subscriptionId } = body;

        if (!subscriptionId) {
          return new Response(JSON.stringify({ error: "subscriptionId is required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        console.log(`[COINBASE-WEBHOOK-MANAGER] Deleting subscription: ${subscriptionId}`);

        const response = await callCDPApi(
          "DELETE",
          `/platform/v2/data/webhooks/subscriptions/${subscriptionId}`
        );

        if (!response.ok) {
          const data = await response.json();
          console.error("[COINBASE-WEBHOOK-MANAGER] Delete error:", data);
          return new Response(
            JSON.stringify({
              error: data.message || "Failed to delete webhook subscription",
              details: data,
            }),
            {
              status: response.status,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }

        return new Response(JSON.stringify({ success: true, deleted: subscriptionId }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      default:
        return new Response(
          JSON.stringify({
            error: "Invalid action",
            validActions: ["create", "list", "get", "update", "delete"],
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
    }
  } catch (error) {
    console.error("[COINBASE-WEBHOOK-MANAGER] Error:", error);
    return new Response(
      JSON.stringify({
        error: "Request failed",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
