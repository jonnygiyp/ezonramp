import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  getCorsHeaders,
  validateAuth,
  unauthorizedResponse,
  forbiddenResponse,
  logSecurityEvent,
  getClientId,
} from "../_shared/auth.ts";

serve(async (req) => {
  const origin = req.headers.get("Origin");
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const auth = await validateAuth(req);
  if (!auth.authenticated || !auth.userId) {
    return unauthorizedResponse(corsHeaders, auth.error || "Unauthorized");
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  // Verify caller is admin
  const { data: roleRow, error: roleErr } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", auth.userId)
    .eq("role", "admin")
    .maybeSingle();

  if (roleErr || !roleRow) {
    logSecurityEvent("ADMIN_LOOKUP_FORBIDDEN", { clientId: getClientId(req), userId: auth.userId });
    return forbiddenResponse(corsHeaders, "Admin only");
  }

  let body: { user_ids?: string[]; partner_user_refs?: string[]; wallet_search?: string } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const userIds = Array.from(new Set((body.user_ids || []).filter(Boolean))).slice(0, 200);
  const partnerRefs = Array.from(new Set((body.partner_user_refs || []).filter(Boolean))).slice(0, 200);

  // Resolve a wallet address -> { user_ids, partner_user_refs } for search
  const walletSearch = (body.wallet_search || "").trim();
  const walletSearchResult: { user_ids: string[]; partner_user_refs: string[] } = {
    user_ids: [],
    partner_user_refs: [],
  };
  if (walletSearch) {
    const { data: profs } = await admin
      .from("profiles")
      .select("id")
      .eq("wallet_address", walletSearch);
    for (const p of profs || []) {
      walletSearchResult.user_ids.push(p.id);
      userIds.push(p.id);
    }
    const { data: attempts } = await admin
      .from("purchase_attempts")
      .select("partner_user_ref, user_id")
      .eq("wallet_address", walletSearch);
    for (const a of attempts || []) {
      if (a.partner_user_ref) walletSearchResult.partner_user_refs.push(a.partner_user_ref);
      if (a.user_id) {
        walletSearchResult.user_ids.push(a.user_id);
        userIds.push(a.user_id);
      }
    }
    walletSearchResult.user_ids = Array.from(new Set(walletSearchResult.user_ids));
    walletSearchResult.partner_user_refs = Array.from(new Set(walletSearchResult.partner_user_refs));
  }

  // Resolve partner_user_refs -> { user_id, wallet_address }
  const refMap: Record<string, { user_id: string; wallet_address: string | null }> = {};
  if (partnerRefs.length) {
    const { data: attempts } = await admin
      .from("purchase_attempts")
      .select("partner_user_ref, user_id, wallet_address")
      .in("partner_user_ref", partnerRefs);
    for (const a of attempts || []) {
      refMap[a.partner_user_ref] = { user_id: a.user_id, wallet_address: a.wallet_address };
      if (a.user_id) userIds.push(a.user_id);
    }
  }

  const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)));

  // Fetch wallets from profiles
  const walletMap: Record<string, string | null> = {};
  if (uniqueUserIds.length) {
    const { data: profs } = await admin
      .from("profiles")
      .select("id, wallet_address")
      .in("id", uniqueUserIds);
    for (const p of profs || []) walletMap[p.id] = p.wallet_address;
  }

  // Fetch emails from auth.users via admin API (paginated; filter client-side)
  const emailMap: Record<string, string | null> = {};
  if (uniqueUserIds.length) {
    const wanted = new Set(uniqueUserIds);
    let page = 1;
    const perPage = 1000;
    // Cap pages to avoid runaway loops
    for (let i = 0; i < 10 && wanted.size > 0; i++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
      if (error || !data?.users?.length) break;
      for (const u of data.users) {
        if (wanted.has(u.id)) {
          emailMap[u.id] = u.email ?? null;
          wanted.delete(u.id);
        }
      }
      if (data.users.length < perPage) break;
      page++;
    }
  }

  const users: Record<string, { email: string | null; wallet_address: string | null }> = {};
  for (const id of uniqueUserIds) {
    users[id] = {
      email: emailMap[id] ?? null,
      wallet_address: walletMap[id] ?? null,
    };
  }

  return new Response(
    JSON.stringify({ users, partner_user_refs: refMap, wallet_search: walletSearchResult }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
