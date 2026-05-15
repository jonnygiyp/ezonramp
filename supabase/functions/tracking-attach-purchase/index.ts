import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, validateAuth, unauthorizedResponse } from "../_shared/auth.ts";

/**
 * Records a purchase attribution against a tracking session.
 * Callable by:
 *   - authenticated users (client reporting their own onramp start/finish)
 *   - service role (webhooks attributing server-side)
 */
serve(async (req) => {
  const cors = getCorsHeaders(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const isServiceRole =
    req.headers.get("authorization") ===
    `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`;

  let userId: string | undefined;
  if (!isServiceRole) {
    const auth = await validateAuth(req);
    if (!auth.authenticated || !auth.userId) {
      return unauthorizedResponse(cors, auth.error || "Unauthorized");
    }
    userId = auth.userId;
  }

  try {
    const body = await req.json();
    const sessionId = body.session_id ? String(body.session_id).slice(0, 64) : null;
    const ref = String(body.ref || "").slice(0, 64);
    const provider = String(body.onramp_provider || "").slice(0, 32);
    const transactionId = String(body.transaction_id || "").slice(0, 128);
    const status = body.purchase_status ? String(body.purchase_status).slice(0, 32) : null;
    const fiatAmount = body.fiat_amount != null ? Number(body.fiat_amount) : null;
    const fiatCurrency = body.fiat_currency ? String(body.fiat_currency).slice(0, 8) : "USD";
    const cryptoAmount = body.crypto_amount != null ? Number(body.crypto_amount) : null;
    const cryptoCurrency = body.crypto_currency ? String(body.crypto_currency).slice(0, 16) : "USDC";
    const chain = body.chain ? String(body.chain).slice(0, 32) : null;
    const walletAddress = body.wallet_address ? String(body.wallet_address).slice(0, 128) : null;

    if (!ref || !provider || !transactionId) {
      return new Response(JSON.stringify({ error: "bad request" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Look up campaign by ref
    const { data: validData } = await supabase.rpc("validate_tracking_code", { _code: ref });
    const campaign = Array.isArray(validData) ? validData[0] : validData;
    if (!campaign?.campaign_id) {
      return new Response(JSON.stringify({ error: "invalid code" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const { error: upErr } = await supabase
      .from("inbound_tracking_attributions")
      .upsert(
        {
          session_id: sessionId,
          campaign_id: campaign.campaign_id,
          tracking_code: ref,
          user_id: userId ?? body.user_id ?? null,
          wallet_address: walletAddress,
          onramp_provider: provider,
          transaction_id: transactionId,
          purchase_status: status,
          fiat_amount: fiatAmount,
          fiat_currency: fiatCurrency,
          crypto_amount: cryptoAmount,
          crypto_currency: cryptoCurrency,
          chain,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "onramp_provider,transaction_id" },
      );

    if (upErr) {
      console.error("[tracking-attach-purchase] upsert", upErr);
      return new Response(JSON.stringify({ error: "upsert failed" }), {
        status: 500,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    if (sessionId) {
      const eventType =
        status && /complete|success|succeed/i.test(status)
          ? "purchase_completed"
          : status && /fail|reject|expired/i.test(status)
            ? "purchase_failed"
            : "onramp_started";
      await supabase.from("inbound_tracking_events").insert({
        session_id: sessionId,
        campaign_id: campaign.campaign_id,
        tracking_code: ref,
        event_type: eventType,
        metadata: { provider, transaction_id: transactionId, status },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[tracking-attach-purchase]", e);
    return new Response(JSON.stringify({ error: "server error" }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
