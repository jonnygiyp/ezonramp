import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, stripe-signature",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!webhookSecret) {
    console.error("[STRIPE-WEBHOOK] STRIPE_WEBHOOK_SECRET not configured");
    return new Response(
      JSON.stringify({ error: "Server configuration error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!stripeKey) {
    console.error("[STRIPE-WEBHOOK] STRIPE_SECRET_KEY not configured");
    return new Response(
      JSON.stringify({ error: "Server configuration error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Read raw body for signature verification
  const rawBody = await req.text();
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    console.error("[STRIPE-WEBHOOK] Missing stripe-signature header");
    return new Response(
      JSON.stringify({ error: "Missing stripe-signature header" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Verify signature
  let event: Stripe.Event;
  try {
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    event = await stripe.webhooks.constructEventAsync(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error("[STRIPE-WEBHOOK] Signature verification failed:", err instanceof Error ? err.message : err);
    return new Response(
      JSON.stringify({ error: "Invalid signature" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Structured log
  console.log("[STRIPE-WEBHOOK] Event received:", {
    eventId: event.id,
    eventType: event.type,
    livemode: event.livemode,
  });

  // Initialize Supabase with service role
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error("[STRIPE-WEBHOOK] Missing Supabase configuration");
    return new Response(
      JSON.stringify({ error: "Server configuration error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Idempotency check — skip if we've already processed this event
    const { data: existingEvent } = await supabase
      .from("stripe_webhook_events")
      .select("id")
      .eq("stripe_event_id", event.id)
      .maybeSingle();

    if (existingEvent) {
      console.log(`[STRIPE-WEBHOOK] Duplicate event ${event.id} — skipping`);
      return new Response(
        JSON.stringify({ success: true, duplicate: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Record event for idempotency
    await supabase.from("stripe_webhook_events").insert({
      stripe_event_id: event.id,
      event_type: event.type,
      livemode: event.livemode,
      payload: event as unknown as Record<string, unknown>,
    });

    // Handle crypto.onramp_session.updated
    if (event.type === "crypto.onramp_session.updated") {
      const session = event.data?.object as Record<string, unknown>;
      const sessionId = session?.id as string;
      const sessionStatus = session?.status as string;
      const transactionId = (session?.transaction_details as Record<string, unknown>)?.transaction_id as string | undefined;

      console.log("[STRIPE-WEBHOOK] Onramp session update:", {
        sessionId,
        sessionStatus,
        transactionId: transactionId || "none",
      });

      if (sessionId) {
        // Update the session record
        const { error: updateError } = await supabase
          .from("stripe_onramp_sessions")
          .update({
            status: sessionStatus || "unknown",
            last_stripe_event_id: event.id,
            callback_data: session as unknown as Record<string, unknown>,
          })
          .eq("stripe_session_id", sessionId);

        if (updateError) {
          console.error("[STRIPE-WEBHOOK] Session update error:", updateError);
        } else {
          console.log(`[STRIPE-WEBHOOK] Updated session ${sessionId} to status: ${sessionStatus}`);
        }

        // Also update transaction_audit_log if a record exists for this session
        const { error: auditError } = await supabase
          .from("transaction_audit_log")
          .update({
            status: mapStripeStatus(sessionStatus),
            callback_data: session as unknown as Record<string, unknown>,
          })
          .eq("request_id", sessionId)
          .eq("provider", "stripe");

        if (auditError) {
          console.error("[STRIPE-WEBHOOK] Audit log update error:", auditError);
        }
      }
    } else {
      console.log(`[STRIPE-WEBHOOK] Unhandled event type: ${event.type}`);
    }

    return new Response(
      JSON.stringify({ success: true, eventId: event.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[STRIPE-WEBHOOK] Processing error:", error);
    return new Response(
      JSON.stringify({ error: "Webhook processing failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

/**
 * Map Stripe onramp session status to canonical transaction_status enum
 */
function mapStripeStatus(status: string | undefined): string {
  switch (status) {
    case "fulfillment_complete":
      return "success";
    case "fulfillment_processing":
    case "payment_complete":
    case "initialized":
      return "pending";
    case "rejected":
    case "expired":
      return "failed";
    default:
      return "callback_received";
  }
}
