import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/auth.ts";

serve(async (req) => {
  const cors = getCorsHeaders(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const body = await req.json();
    const ref = String(body.ref || "").slice(0, 64);
    const sessionId = body.session_id ? String(body.session_id).slice(0, 64) : null;
    const landingPath = body.landing_path ? String(body.landing_path).slice(0, 256) : null;
    const fullLandingUrl = body.full_landing_url ? String(body.full_landing_url).slice(0, 2048) : null;
    const referrerUrl = body.referrer_url ? String(body.referrer_url).slice(0, 2048) : null;
    const userAgent = (req.headers.get("user-agent") || "").slice(0, 512);
    const country = req.headers.get("cf-ipcountry") || req.headers.get("x-vercel-ip-country") || null;

    if (!ref) {
      return new Response(JSON.stringify({ error: "ref required" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Validate code -> get campaign
    const { data: validData } = await supabase.rpc("validate_tracking_code", { _code: ref });
    const campaign = Array.isArray(validData) ? validData[0] : validData;
    if (!campaign?.campaign_id) {
      return new Response(JSON.stringify({ error: "invalid code" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Resume existing session if provided and matches
    if (sessionId) {
      const { data: existing } = await supabase
        .from("inbound_tracking_sessions")
        .select("id, first_seen_at")
        .eq("id", sessionId)
        .eq("tracking_code", ref)
        .maybeSingle();
      if (existing) {
        const nowIso = new Date().toISOString();
        const durSec = Math.max(
          0,
          Math.floor((Date.now() - new Date(existing.first_seen_at).getTime()) / 1000),
        );
        await supabase
          .from("inbound_tracking_sessions")
          .update({ last_seen_at: nowIso, session_duration_seconds: durSec })
          .eq("id", existing.id);
        return new Response(JSON.stringify({ session_id: existing.id, resumed: true }), {
          headers: { ...cors, "Content-Type": "application/json" },
        });
      }
    }

    // Create new session
    const { data: created, error: insertErr } = await supabase
      .from("inbound_tracking_sessions")
      .insert({
        tracking_code: ref,
        campaign_id: campaign.campaign_id,
        landing_path: landingPath,
        full_landing_url: fullLandingUrl,
        referrer_url: referrerUrl,
        user_agent: userAgent,
        country,
      })
      .select("id")
      .single();

    if (insertErr || !created) {
      console.error("[tracking-session] insert failed", insertErr);
      return new Response(JSON.stringify({ error: "insert failed" }), {
        status: 500,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    await supabase.from("inbound_tracking_events").insert({
      session_id: created.id,
      campaign_id: campaign.campaign_id,
      tracking_code: ref,
      event_type: "landing",
      metadata: { landing_path: landingPath, referrer: referrerUrl },
    });

    return new Response(JSON.stringify({ session_id: created.id, resumed: false }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[tracking-session]", e);
    return new Response(JSON.stringify({ error: "server error" }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
