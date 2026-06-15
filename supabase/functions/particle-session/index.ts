// particle-session
//
// Exchanges a Particle Network (Auth Core) UUID + token for a Supabase session.
//
// Flow:
//   1. Client calls POST { particleUuid, particleToken, walletAddress?, walletChain? }
//   2. Function verifies the (uuid, token) pair by calling Particle's
//      getUserInfo JSON-RPC endpoint with Basic auth (PARTICLE_PROJECT_ID:PARTICLE_SERVER_KEY).
//   3. Function maps the Particle UUID to a deterministic Supabase auth user
//      (created on first sight, via admin.createUser).
//   4. Function syncs profile.particle_uuid and—only if the wallet address
//      is in Particle's authoritative wallet list—profile.wallet_address.
//   5. Function mints Supabase access + refresh tokens via admin.generateLink
//      ('magiclink') -> auth.verifyOtp({ token_hash }).
//   6. Returns { access_token, refresh_token, user_id } to the client, which
//      calls supabase.auth.setSession(...) to hydrate the session.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://ezonramp.com",
  "https://www.ezonramp.com",
  "https://ezonramp.lovable.app",
  "https://id-preview--7b38c753-20a4-4c8b-8302-f8796fd8f46e.lovable.app",
  "https://id-preview-fedc815f--7b38c753-20a4-4c8b-8302-f8796fd8f46e.lovable.app",
];

if (Deno.env.get("DEVELOPMENT_MODE") === "true") {
  ALLOWED_ORIGINS.push("http://localhost:5173", "http://localhost:3000", "http://localhost:8080");
}

function corsFor(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
  };
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

const PARTICLE_PROJECT_ID = "e7041872-c6f2-4de1-826a-8c20f4d26e7f"; // publishable
const PARTICLE_SERVER_KEY = Deno.env.get("PARTICLE_SERVER_KEY") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

interface ParticleWalletEntry {
  chain_name?: string;
  chain?: string;
  publicAddress?: string;
  public_address?: string;
}

interface ParticleUserInfo {
  uuid: string;
  wallets?: ParticleWalletEntry[];
  email?: string | null;
}

async function verifyWithParticle(uuid: string, token: string): Promise<ParticleUserInfo> {
  const basic = btoa(`${PARTICLE_PROJECT_ID}:${PARTICLE_SERVER_KEY}`);
  const resp = await fetch("https://api.particle.network/server/rpc", {
    method: "POST",
    headers: {
      "Authorization": `Basic ${basic}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getUserInfo",
      params: [uuid, token],
    }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Particle verify HTTP ${resp.status}: ${text.slice(0, 200)}`);
  }
  const json = await resp.json();
  if (json.error) {
    throw new Error(`Particle verify error: ${JSON.stringify(json.error).slice(0, 200)}`);
  }
  const result = json.result as ParticleUserInfo | undefined;
  if (!result || !result.uuid || result.uuid !== uuid) {
    throw new Error("Particle verify mismatch: uuid does not match token");
  }
  return result;
}

function walletAuthorized(
  info: ParticleUserInfo,
  addr: string | null | undefined,
): { ok: boolean; network: string | null } {
  if (!addr) return { ok: false, network: null };
  const lower = addr.toLowerCase();
  for (const w of info.wallets || []) {
    const pub = (w.publicAddress || w.public_address || "").toLowerCase();
    if (pub && pub === lower) {
      const chain = (w.chain_name || w.chain || "").toLowerCase();
      const network = chain.includes("solana")
        ? "solana"
        : chain.includes("evm") || chain.includes("ether") || /^0x/.test(addr)
          ? "ethereum"
          : chain || null;
      return { ok: true, network };
    }
  }
  return { ok: false, network: null };
}

serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  const headers = { ...corsFor(origin), "Content-Type": "application/json" };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsFor(origin) });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), { status: 405, headers });
  }
  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    return new Response(JSON.stringify({ error: "origin_not_allowed" }), { status: 403, headers });
  }
  if (!PARTICLE_SERVER_KEY) {
    console.error("[particle-session] PARTICLE_SERVER_KEY missing");
    return new Response(JSON.stringify({ error: "server_misconfigured" }), { status: 500, headers });
  }

  let body: { particleUuid?: string; particleToken?: string; walletAddress?: string; walletChain?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid_json" }), { status: 400, headers });
  }

  const particleUuid = (body.particleUuid || "").trim();
  const particleToken = (body.particleToken || "").trim();
  const walletAddress = (body.walletAddress || "").trim() || null;

  if (!particleUuid || !particleToken) {
    return new Response(JSON.stringify({ error: "missing_credentials" }), { status: 400, headers });
  }
  // Loose UUID sanity check
  if (!/^[0-9a-f-]{32,36}$/i.test(particleUuid)) {
    return new Response(JSON.stringify({ error: "invalid_uuid" }), { status: 400, headers });
  }

  // 1. Verify with Particle.
  let info: ParticleUserInfo;
  try {
    info = await verifyWithParticle(particleUuid, particleToken);
  } catch (e) {
    console.warn("[particle-session] verify failed:", (e as Error).message);
    return new Response(JSON.stringify({ error: "particle_verify_failed" }), { status: 401, headers });
  }

  const walletCheck = walletAuthorized(info, walletAddress);
  if (walletAddress && !walletCheck.ok) {
    console.warn("[particle-session] wallet address not in Particle wallet list — ignoring claim");
  }

  // 2/5. Provision Supabase user + mint session.
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const deterministicEmail = `particle-${particleUuid}@users.ezonramp.local`;

  // Try to create the user (idempotent: ignore already-exists error).
  const createRes = await admin.auth.admin.createUser({
    email: deterministicEmail,
    email_confirm: true,
    user_metadata: { particle_uuid: particleUuid, source: "particle-session" },
  });
  if (createRes.error && !/already (registered|been registered|exists)|email.*exists/i.test(createRes.error.message)) {
    console.error("[particle-session] createUser error:", createRes.error.message);
    return new Response(JSON.stringify({ error: "user_provision_failed" }), { status: 500, headers });
  }

  // Use admin.generateLink to (a) find user id whether new or existing and (b) get a hashed_token.
  const linkRes = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: deterministicEmail,
  });
  if (linkRes.error || !linkRes.data?.user?.id || !linkRes.data?.properties?.hashed_token) {
    console.error("[particle-session] generateLink failed:", linkRes.error?.message);
    return new Response(JSON.stringify({ error: "session_mint_failed" }), { status: 500, headers });
  }
  const userId = linkRes.data.user.id;
  const tokenHash = linkRes.data.properties.hashed_token;

  // 4. Sync profile in two safe steps so a wallet-collision cannot block particle_uuid binding.
  // 4a. Always upsert particle_uuid (uniqueness on particle_uuid is partial; user_id is PK).
  const baseUpsert: Record<string, unknown> = {
    id: userId,
    particle_uuid: particleUuid,
    updated_at: new Date().toISOString(),
  };
  const { error: baseErr } = await admin.from("profiles").upsert(baseUpsert, { onConflict: "id" });
  if (baseErr) {
    // Do not include raw message details that may echo user data.
    console.warn("[particle-session] profile uuid sync warn code=", (baseErr as { code?: string }).code || "unknown");
  }

  // 4b. Conditionally bind wallet — only if Particle vouches for it AND no other profile owns it.
  let walletBound = false;
  if (walletAddress && walletCheck.ok) {
    const { data: owner } = await admin
      .from("profiles")
      .select("id")
      .eq("wallet_address", walletAddress)
      .maybeSingle();
    if (!owner || owner.id === userId) {
      const { error: walletErr } = await admin
        .from("profiles")
        .update({
          wallet_address: walletAddress,
          wallet_network: walletCheck.network || (/^0x/.test(walletAddress) ? "ethereum" : "solana"),
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId);
      if (walletErr) {
        console.warn("[particle-session] wallet bind warn code=", (walletErr as { code?: string }).code || "unknown");
      } else {
        walletBound = true;
      }
    } else {
      console.warn("[particle-session] wallet already bound to a different user — skipping");
    }
  }

  // 5. Exchange token_hash for a real session using the anon client.
  const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: verifyData, error: verifyError } = await anon.auth.verifyOtp({
    token_hash: tokenHash,
    type: "magiclink",
  });
  if (verifyError || !verifyData.session) {
    console.error("[particle-session] verifyOtp failed:", verifyError?.message);
    return new Response(JSON.stringify({ error: "session_exchange_failed" }), { status: 500, headers });
  }

  // Concise, redacted success log. Never include tokens, hashed_token, email, or full wallet.
  const walletTag = walletAddress
    ? `${walletAddress.slice(0, 4)}…${walletAddress.slice(-4)}`
    : "none";
  console.log(
    `[particle-session] ok user=${userId.slice(0, 8)} particle=${particleUuid.slice(0, 8)} wallet=${walletTag} verified=${walletCheck.ok} bound=${walletBound}`,
  );

  return new Response(
    JSON.stringify({
      access_token: verifyData.session.access_token,
      refresh_token: verifyData.session.refresh_token,
      expires_at: verifyData.session.expires_at,
      user_id: userId,
      wallet_verified: walletCheck.ok,
    }),
    { status: 200, headers },
  );
});
