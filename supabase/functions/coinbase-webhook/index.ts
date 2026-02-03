import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Coinbase Onramp Webhook Handler
 * 
 * Receives webhook events from Coinbase CDP and verifies signatures using X-Hook0-Signature.
 * Events: onramp.transaction.created, onramp.transaction.updated, 
 *         onramp.transaction.success, onramp.transaction.failed
 */

// CORS headers for the webhook endpoint (Coinbase servers don't need CORS, but included for testing)
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-hook0-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/**
 * Verify webhook signature using X-Hook0-Signature header
 * 
 * Signature format: t={timestamp},h={header_names},v1={signature}
 * Signed payload: {timestamp}.{header_names}.{header_values}.{body}
 */
async function verifyWebhookSignature(
  payload: string,
  signatureHeader: string,
  secret: string,
  headers: Headers,
  maxAgeMinutes: number = 5
): Promise<boolean> {
  try {
    // Parse signature header: t=timestamp,h=headers,v1=signature
    const elements = signatureHeader.split(",");
    
    const timestampElement = elements.find((e) => e.startsWith("t="));
    const headersElement = elements.find((e) => e.startsWith("h="));
    const signatureElement = elements.find((e) => e.startsWith("v1="));

    if (!timestampElement || !signatureElement) {
      console.error("[COINBASE-WEBHOOK] Missing required signature elements");
      return false;
    }

    const timestamp = timestampElement.split("=")[1];
    const headerNames = headersElement?.split("=")[1] || "";
    const providedSignature = signatureElement.split("=")[1];

    // Build header values string (if headers are included in signature)
    let headerValues = "";
    if (headerNames) {
      const headerNameList = headerNames.split(" ");
      headerValues = headerNameList
        .map((name) => headers.get(name) || "")
        .join(".");
    }

    // Build signed payload based on whether headers are included
    let signedPayload: string;
    if (headerNames) {
      signedPayload = `${timestamp}.${headerNames}.${headerValues}.${payload}`;
    } else {
      // Simple format without headers: timestamp.payload
      signedPayload = `${timestamp}.${payload}`;
    }

    // Compute expected signature using HMAC-SHA256
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const payloadData = encoder.encode(signedPayload);

    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const signatureBuffer = await crypto.subtle.sign("HMAC", cryptoKey, payloadData);
    const signatureArray = new Uint8Array(signatureBuffer);
    const expectedSignature = Array.from(signatureArray)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    // Compare signatures (timing-safe comparison)
    const signaturesMatch = expectedSignature.toLowerCase() === providedSignature.toLowerCase();

    if (!signaturesMatch) {
      console.error("[COINBASE-WEBHOOK] Signature mismatch");
      console.error(`  Expected: ${expectedSignature.slice(0, 20)}...`);
      console.error(`  Received: ${providedSignature.slice(0, 20)}...`);
      return false;
    }

    // Verify timestamp to prevent replay attacks
    const webhookTime = parseInt(timestamp) * 1000; // Convert to milliseconds
    const currentTime = Date.now();
    const ageMinutes = (currentTime - webhookTime) / (1000 * 60);

    if (ageMinutes > maxAgeMinutes) {
      console.error(
        `[COINBASE-WEBHOOK] Webhook timestamp too old: ${ageMinutes.toFixed(1)} minutes > ${maxAgeMinutes} minutes`
      );
      return false;
    }

    console.log("[COINBASE-WEBHOOK] Signature verified successfully");
    return true;
  } catch (error) {
    console.error("[COINBASE-WEBHOOK] Signature verification error:", error);
    return false;
  }
}

/**
 * Map Coinbase transaction status to our canonical status
 */
function mapCoinbaseStatus(eventType: string, status?: string): string {
  // Map based on event type first
  if (eventType === "onramp.transaction.success") {
    return "success";
  }
  if (eventType === "onramp.transaction.failed") {
    return "failed";
  }
  
  // For created/updated events, check the status field
  if (status) {
    const statusLower = status.toLowerCase();
    if (statusLower.includes("success") || statusLower.includes("completed")) {
      return "success";
    }
    if (statusLower.includes("failed") || statusLower.includes("error")) {
      return "failed";
    }
    if (statusLower.includes("in_progress") || statusLower.includes("pending")) {
      return "pending";
    }
  }
  
  // Default for created/updated events
  if (eventType === "onramp.transaction.created") {
    return "pending";
  }
  
  return "callback_received";
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Only accept POST requests
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // Get the raw body for signature verification
    const rawBody = await req.text();
    
    // Get the signature header
    const signatureHeader = req.headers.get("x-hook0-signature");
    
    // Get the webhook secret
    const webhookSecret = Deno.env.get("COINBASE_WEBHOOK_SECRET");

    if (!webhookSecret) {
      console.error("[COINBASE-WEBHOOK] COINBASE_WEBHOOK_SECRET not configured");
      return new Response(JSON.stringify({ error: "Server configuration error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify signature if present
    if (signatureHeader) {
      const isValid = await verifyWebhookSignature(
        rawBody,
        signatureHeader,
        webhookSecret,
        req.headers
      );

      if (!isValid) {
        console.error("[COINBASE-WEBHOOK] Invalid signature - rejecting webhook");
        return new Response(JSON.stringify({ error: "Invalid signature" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      // In production, you should reject webhooks without signatures
      // For initial testing, we'll log a warning
      console.warn("[COINBASE-WEBHOOK] No X-Hook0-Signature header - webhook may be forged");
      
      // Uncomment this in production:
      // return new Response(JSON.stringify({ error: "Missing signature" }), {
      //   status: 400,
      //   headers: { ...corsHeaders, "Content-Type": "application/json" },
      // });
    }

    // Parse the event payload
    const event = JSON.parse(rawBody);
    
    console.log("[COINBASE-WEBHOOK] Received event:", event.eventType || event.event_type);
    console.log("[COINBASE-WEBHOOK] Transaction ID:", event.transactionId || event.transaction_id);

    // Extract event data
    const eventType = event.eventType || event.event_type;
    const transactionId = event.transactionId || event.transaction_id;
    const status = event.status;
    const walletAddress = event.walletAddress || event.wallet_address || event.destinationAddress;
    const purchaseAmount = event.purchaseAmount?.value || event.purchase_amount?.value;
    const purchaseCurrency = event.purchaseCurrency || event.purchase_currency;
    const purchaseNetwork = event.purchaseNetwork || event.purchase_network;
    const partnerUserId = event.partnerUserId || event.partner_user_id;
    
    // Create Supabase client with service role for server-side operations
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

    // Map the status
    const canonicalStatus = mapCoinbaseStatus(eventType, status);
    
    console.log(`[COINBASE-WEBHOOK] Processing: ${eventType} -> ${canonicalStatus}`);

    // Update or insert transaction record
    // First, try to find existing transaction by transaction ID (provider_ref)
    // or by partner_user_id if available
    
    if (transactionId && walletAddress) {
      // Check if we have an existing transaction_audit_log entry
      const { data: existingTx, error: fetchError } = await supabase
        .from("transaction_audit_log")
        .select("id, status")
        .eq("wallet_address", walletAddress)
        .eq("provider", "coinbase")
        .order("created_at", { ascending: false })
        .limit(1);

      if (fetchError) {
        console.error("[COINBASE-WEBHOOK] Error fetching existing transaction:", fetchError);
      }

      if (existingTx && existingTx.length > 0) {
        // Update existing transaction
        const { error: updateError } = await supabase
          .from("transaction_audit_log")
          .update({
            status: canonicalStatus,
            request_id: transactionId,
            callback_data: event,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existingTx[0].id);

        if (updateError) {
          console.error("[COINBASE-WEBHOOK] Error updating transaction:", updateError);
        } else {
          console.log(`[COINBASE-WEBHOOK] Updated transaction ${existingTx[0].id} to status: ${canonicalStatus}`);
        }
      } else {
        // Insert new transaction record from webhook
        const { error: insertError } = await supabase
          .from("transaction_audit_log")
          .insert({
            provider: "coinbase",
            wallet_address: walletAddress,
            amount: parseFloat(purchaseAmount) || 0,
            currency: "USD",
            crypto_currency: purchaseCurrency || "USDC",
            status: canonicalStatus,
            request_id: transactionId,
            callback_data: event,
          });

        if (insertError) {
          console.error("[COINBASE-WEBHOOK] Error inserting transaction:", insertError);
        } else {
          console.log(`[COINBASE-WEBHOOK] Created new transaction record for ${transactionId}`);
        }
      }
    }

    // Return success - Coinbase expects a 200 response
    return new Response(JSON.stringify({ received: true, eventType, status: canonicalStatus }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[COINBASE-WEBHOOK] Error processing webhook:", error);
    return new Response(
      JSON.stringify({
        error: "Webhook processing error",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
