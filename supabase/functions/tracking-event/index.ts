import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/auth.ts";

const VALID_EVENTS = new Set([
  "landing",
  "page_view",
  "sign_in",
  "wallet_connected",
  "onramp_started",
  "purchase_completed",
  "purchase_failed",
  "session_heartbeat",
]);

serve(async (req) => {
  const cors = getCorsHeaders(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const body = await req.json();
    const sessionId = String(body.session_id || "").slice(0, 64);
    const ref = String(body.ref || "").slice(0, 64);
    const eventType = String(body.event_type || "");
    const metadata = body.metadata && typeof body.metadata === "object" ? body.metadata : {};

    if (!sessionId || !ref || !VALID_EVENTS.has(eventType)) {
      return new Response(JSON.stringify({ error: "bad request" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: session } = await supabase
      .from("inbound_tracking_sessions")
      .select("id, campaign_id, first_seen_at")
      .eq("id", sessionId)
      .eq("tracking_code", ref)
      .maybeSingle();

    if (!session) {
      return new Response(JSON.stringify({ error: "session not found" }), {
        status: 404,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const nowIso = new Date().toISOString();
    const durSec = Math.max(
      0,
      Math.floor((Date.now() - new Date(session.first_seen_at).getTime()) / 1000),
    );

    await Promise.all([
      supabase.from("inbound_tracking_events").insert({
        session_id: session.id,
        campaign_id: session.campaign_id,
        tracking_code: ref,
        event_type: eventType,
        metadata,
      }),
      supabase
        .from("inbound_tracking_sessions")
        .update({ last_seen_at: nowIso, session_duration_seconds: durSec })
        .eq("id", session.id),
    ]);

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[tracking-event]", e);
    return new Response(JSON.stringify({ error: "server error" }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
