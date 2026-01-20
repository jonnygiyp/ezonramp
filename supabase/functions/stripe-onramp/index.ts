import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import {
  getCorsHeaders,
  getClientId,
  logSecurityEvent,
  validateOrigin,
} from "../_shared/auth.ts";


// Rate limiting
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW_MS = 60000;
const RATE_LIMIT_MAX_REQUESTS = 10;

function checkRateLimit(clientId: string): boolean {
  const now = Date.now();
  const clientData = rateLimitMap.get(clientId);
  
  if (!clientData || now > clientData.resetTime) {
    rateLimitMap.set(clientId, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  
  if (clientData.count >= RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }
  
  clientData.count++;
  return true;
}

serve(async (req) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Validate origin
  const originError = validateOrigin(origin, corsHeaders);
  if (originError) return originError;

  // Only allow POST
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const clientId = getClientId(req);

  try {
    // Rate limiting
    if (!checkRateLimit(clientId)) {
      logSecurityEvent('RATE_LIMIT_EXCEEDED', { clientId, function: 'stripe-onramp' });
      return new Response(JSON.stringify({ error: 'Too many requests' }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ========================================
    // PUBLIC ENDPOINT (NO USER AUTH)
    // We intentionally do not require an end-user JWT for onramp session creation.
    // Protection relies on strict CORS + rate limiting + input validation.
    // ========================================

    console.log(
      `[STRIPE] Stripe onramp request accepted for client ${clientId.slice(0, 10)}...`
    );

    // ========================================
    // STRIPE SESSION CREATION
    // ========================================
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      console.error('STRIPE_SECRET_KEY not configured');
      return new Response(JSON.stringify({ error: 'Stripe not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const stripe = new Stripe(stripeKey, {
      apiVersion: "2025-08-27.basil",
    });

    const { walletAddress, destinationCurrency, destinationNetwork, sourceAmount } = await req.json();

    if (!walletAddress || typeof walletAddress !== 'string') {
      return new Response(JSON.stringify({ error: 'Wallet address is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate wallet address format (basic validation)
    if (walletAddress.length < 20 || walletAddress.length > 100) {
      return new Response(JSON.stringify({ error: 'Invalid wallet address format' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const walletAddresses: Record<string, string> = {};
    const network = destinationNetwork || "solana";
    
    const networkMapping: Record<string, string> = {
      solana: "solana",
      ethereum: "ethereum",
      polygon: "polygon",
      base: "base",
      bitcoin: "bitcoin",
      avalanche: "avalanche",
      stellar: "stellar",
    };
    
    if (networkMapping[network]) {
      walletAddresses[networkMapping[network]] = walletAddress;
    }

    console.log(
      `[STRIPE] Creating onramp session for client ${clientId.slice(0, 10)}... wallet ${walletAddress.slice(0, 10)}...`
    );


    const response = await fetch("https://api.stripe.com/v1/crypto/onramp_sessions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${stripeKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        ...(Object.keys(walletAddresses).length > 0 && {
          [`wallet_addresses[${network}]`]: walletAddress,
        }),
        ...(destinationCurrency && { destination_currency: destinationCurrency }),
        ...(destinationNetwork && { destination_network: destinationNetwork }),
        ...(sourceAmount && { source_amount: sourceAmount.toString() }),
        lock_wallet_address: "true",
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Stripe API error:", errorData);
      return new Response(JSON.stringify({ error: 'Failed to create onramp session' }), {
        status: response.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const session = await response.json();
    console.log("[STRIPE] Onramp session created:", {
      id: session.id,
      status: session.status,
      clientId: clientId.slice(0, 10),
    });


    return new Response(
      JSON.stringify({ 
        clientSecret: session.client_secret,
        sessionId: session.id,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Error creating onramp session:", error);
    return new Response(
      JSON.stringify({ error: 'Failed to create onramp session' }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
