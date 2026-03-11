import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Coinbase CDP Webhook Handler
 * 
 * Receives and verifies webhooks from Coinbase Onramp.
 * Signature verification uses X-Hook0-Signature header with HMAC-SHA256.
 * 
 * The secret is returned as metadata.secret when creating the subscription
 * via the CDP API and must be stored as COINBASE_WEBHOOK_SECRET.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-hook0-signature",
};

/**
 * Verify webhook signature using the X-Hook0-Signature header
 * Format: t=timestamp,h=header1 header2,v1=signature
 */
async function verifyWebhookSignature(
  payload: string,
  signatureHeader: string,
  secret: string,
  headers: Headers,
  maxAgeMinutes = 5
): Promise<boolean> {
  try {
    // Parse signature header: t=timestamp,h=headers,v1=signature
    const elements = signatureHeader.split(",");
    const timestampPart = elements.find((e) => e.startsWith("t="));
    const headersPart = elements.find((e) => e.startsWith("h="));
    const signaturePart = elements.find((e) => e.startsWith("v1="));

    if (!timestampPart || !headersPart || !signaturePart) {
      console.error("[COINBASE-WEBHOOK] Missing signature components");
      return false;
    }

    const timestamp = timestampPart.split("=")[1];
    const headerNames = headersPart.split("=")[1];
    const providedSignature = signaturePart.split("=")[1];

    // Build header values string
    const headerNameList = headerNames.split(" ");
    const headerValues = headerNameList
      .map((name) => headers.get(name) || "")
      .join(".");

    // Build signed payload: timestamp.headerNames.headerValues.payload
    const signedPayload = `${timestamp}.${headerNames}.${headerValues}.${payload}`;

    // Compute expected signature using HMAC-SHA256
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const signatureBytes = await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(signedPayload)
    );

    // Convert to hex
    const expectedSignature = Array.from(new Uint8Array(signatureBytes))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    // Compare signatures (constant-time comparison)
    const signaturesMatch = expectedSignature === providedSignature;

    if (!signaturesMatch) {
      console.error("[COINBASE-WEBHOOK] Signature mismatch");
      return false;
    }

    // Verify timestamp to prevent replay attacks
    const webhookTime = parseInt(timestamp) * 1000; // Convert to milliseconds
    const currentTime = Date.now();
    const ageMinutes = (currentTime - webhookTime) / (1000 * 60);

    if (ageMinutes > maxAgeMinutes) {
      console.error(
        `[COINBASE-WEBHOOK] Webhook timestamp exceeds maximum age: ${ageMinutes.toFixed(1)} minutes > ${maxAgeMinutes} minutes`
      );
      return false;
    }

    return true;
  } catch (error) {
    console.error("[COINBASE-WEBHOOK] Signature verification error:", error);
    return false;
  }
}

/**
 * Map Coinbase transaction status to canonical status
 */
function mapCoinbaseStatus(status: string, eventType: string): string {
  // Handle order statuses (Apple Pay API format)
  if (status.startsWith("ONRAMP_ORDER_STATUS_")) {
    const orderStatus = status.replace("ONRAMP_ORDER_STATUS_", "");
    switch (orderStatus) {
      case "COMPLETED":
        return "success";
      case "FAILED":
        return "failed";
      default:
        return "pending";
    }
  }

  // Handle transaction statuses (standard format)
  if (status.startsWith("ONRAMP_TRANSACTION_STATUS_")) {
    const txStatus = status.replace("ONRAMP_TRANSACTION_STATUS_", "");
    switch (txStatus) {
      case "SUCCESS":
        return "success";
      case "FAILED":
        return "failed";
      case "IN_PROGRESS":
      case "PENDING_PAYMENT":
      case "PENDING_ON_CHAIN":
        return "pending";
      default:
        return "callback_received";
    }
  }

  // Fallback based on event type
  if (eventType === "onramp.transaction.success") return "success";
  if (eventType === "onramp.transaction.failed") return "failed";

  return "callback_received";
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
    const webhookSecret = Deno.env.get("COINBASE_WEBHOOK_SECRET");
    
    // Get raw body for signature verification
    const rawBody = await req.text();
    
    // Verify signature if secret is configured
    if (webhookSecret) {
      const signatureHeader = req.headers.get("x-hook0-signature");
      
      if (!signatureHeader) {
        console.error("[COINBASE-WEBHOOK] Missing X-Hook0-Signature header");
        return new Response(JSON.stringify({ error: "Missing signature" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const isValid = await verifyWebhookSignature(
        rawBody,
        signatureHeader,
        webhookSecret,
        req.headers
      );

      if (!isValid) {
        console.error("[COINBASE-WEBHOOK] Invalid signature");
        return new Response(JSON.stringify({ error: "Invalid signature" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.log("[COINBASE-WEBHOOK] ✅ Signature verified");
    } else {
      console.warn("[COINBASE-WEBHOOK] ⚠️ No webhook secret configured - skipping verification");
    }

    // Parse the event
    const event = JSON.parse(rawBody);
    
    console.log("[COINBASE-WEBHOOK] Received event:", {
      eventType: event.eventType,
      transactionId: event.transactionId || event.orderId,
      status: event.status,
      walletAddress: event.walletAddress || event.destinationAddress,
    });

    // Initialize Supabase with service role for server-side updates
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("[COINBASE-WEBHOOK] Missing Supabase configuration");
      return new Response(JSON.stringify({ error: "Server configuration error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Extract transaction details - handle both transaction and order formats
    const transactionId = event.transactionId || event.orderId;
    const walletAddress = event.walletAddress || event.destinationAddress;
    const eventType = event.eventType;
    const status = event.status;
    const canonicalStatus = mapCoinbaseStatus(status, eventType);

    // Extract amounts - handle both formats
    let fiatAmount = 0;
    let cryptoAmount = 0;
    let currency = "USD";
    let cryptoCurrency = "USDC";
    let network = "base";

    if (event.paymentTotal) {
      // Check if it's the object format or string format
      if (typeof event.paymentTotal === "object") {
        fiatAmount = parseFloat(event.paymentTotal.value || "0");
        currency = event.paymentTotal.currency || "USD";
      } else {
        fiatAmount = parseFloat(event.paymentTotal);
        currency = event.paymentCurrency || "USD";
      }
    }

    if (event.purchaseAmount) {
      if (typeof event.purchaseAmount === "object") {
        cryptoAmount = parseFloat(event.purchaseAmount.value || "0");
        cryptoCurrency = event.purchaseAmount.currency || event.purchaseCurrency || "USDC";
      } else {
        cryptoAmount = parseFloat(event.purchaseAmount);
        cryptoCurrency = event.purchaseCurrency || "USDC";
      }
    }

    network = event.purchaseNetwork || event.destinationNetwork || "base";

    // Upsert into transaction_audit_log
    const { error: upsertError } = await supabase
      .from("transaction_audit_log")
      .upsert(
        {
          request_id: transactionId,
          provider: "coinbase",
          wallet_address: walletAddress,
          amount: fiatAmount,
          currency: currency,
          crypto_currency: cryptoCurrency,
          status: canonicalStatus,
          callback_data: event,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "request_id",
        }
      );

    if (upsertError) {
      console.error("[COINBASE-WEBHOOK] Database upsert error:", upsertError);
      // Still return 200 to acknowledge receipt
    } else {
      console.log(`[COINBASE-WEBHOOK] Updated transaction ${transactionId} to status: ${canonicalStatus}`);
    }

    // Also update purchase_attempts if partnerUserId is present in webhook payload
    const partnerUserId = event.partnerUserId || event.partner_user_id || event.partnerUserRef;
    if (partnerUserId) {
      let purchaseStatus = 'processing';
      if (canonicalStatus === 'success') purchaseStatus = 'completed';
      else if (canonicalStatus === 'failed') purchaseStatus = 'failed';

      const { error: purchaseUpdateError } = await supabase
        .from("purchase_attempts")
        .update({
          status: purchaseStatus,
          coinbase_transaction_id: transactionId,
        })
        .eq("partner_user_ref", partnerUserId);

      if (purchaseUpdateError) {
        console.error("[COINBASE-WEBHOOK] Purchase attempt update error:", purchaseUpdateError);
      } else {
        console.log(`[COINBASE-WEBHOOK] Updated purchase attempt ${partnerUserId} to status: ${purchaseStatus}`);
      }
    }

    return new Response(JSON.stringify({ success: true, received: transactionId }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[COINBASE-WEBHOOK] Error:", error);
    return new Response(
      JSON.stringify({
        error: "Webhook processing failed",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
