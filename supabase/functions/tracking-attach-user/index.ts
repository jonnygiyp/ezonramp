import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, validateAuth, unauthorizedResponse } from "../_shared/auth.ts";

serve(async (req) => {
  const cors = getCorsHeaders(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const auth = await validateAuth(req);
  if (!auth.authenticated || !auth.userId) {
    return unauthorizedResponse(cors, auth.error || "Unauthorized");
  }

  try {
    const body = await req.json();
    const sessionId = String(body.session_id || "").slice(0, 64);
    const ref = String(body.ref || "").slice(0, 64);
    if (!sessionId || !ref) {
      return new Response(JSON.stringify({ error: "bad request" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: profile } = await supabase
      .from("profiles")
      .select("wallet_address")
      .eq("id", auth.userId)
      .maybeSingle();

    const walletAddress = profile?.wallet_address ?? null;
    const nowIso = new Date().toISOString();

    const { data: session } = await supabase
      .from("inbound_tracking_sessions")
      .select("id, campaign_id, sign_in_at")
      .eq("id", sessionId)
      .eq("tracking_code", ref)
      .maybeSingle();

    if (!session) {
      return new Response(JSON.stringify({ error: "session not found" }), {
        status: 404,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    await supabase
      .from("inbound_tracking_sessions")
      .update({
        signed_in_user_id: auth.userId,
        wallet_address: walletAddress,
        sign_in_at: session.sign_in_at ?? nowIso,
        last_seen_at: nowIso,
      })
      .eq("id", session.id);

    if (!session.sign_in_at) {
      await supabase.from("inbound_tracking_events").insert({
        session_id: session.id,
        campaign_id: session.campaign_id,
        tracking_code: ref,
        event_type: "sign_in",
        metadata: { user_id: auth.userId },
      });
    }
    if (walletAddress) {
      await supabase.from("inbound_tracking_events").insert({
        session_id: session.id,
        campaign_id: session.campaign_id,
        tracking_code: ref,
        event_type: "wallet_connected",
        metadata: { wallet_address: walletAddress },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[tracking-attach-user]", e);
    return new Response(JSON.stringify({ error: "server error" }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
