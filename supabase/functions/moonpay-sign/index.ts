import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createHmac } from "node:crypto";
import {
  getCorsHeaders,
  validateAuth,
  unauthorizedResponse,
  getClientId,
  logSecurityEvent,
  validateOrigin,
} from "../_shared/auth.ts";

// Rate limiting for signing requests
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW_MS = 60000;
const RATE_LIMIT_MAX_REQUESTS = 20;

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
  if (req.method === 'OPTIONS') {
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
      logSecurityEvent('RATE_LIMIT_EXCEEDED', { clientId, function: 'moonpay-sign' });
      return new Response(JSON.stringify({ error: 'Too many requests' }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ========================================
    // AUTHENTICATION CHECK - Signing requires auth
    // ========================================
    const authResult = await validateAuth(req);
    
    if (!authResult.authenticated) {
      logSecurityEvent("AUTH_FAILED_MOONPAY_SIGN", {
        clientId,
        error: authResult.error,
      });
      return unauthorizedResponse(corsHeaders, authResult.error);
    }

    console.log(`[AUTH] MoonPay sign request authorized for user ${authResult.userId?.slice(0, 8)}...`);

    // ========================================
    // URL SIGNING
    // ========================================
    const secretKey = Deno.env.get('MOONPAY_SECRET_KEY');
    
    if (!secretKey) {
      console.error('MOONPAY_SECRET_KEY not configured');
      return new Response(JSON.stringify({ error: 'MoonPay not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { urlForSigning } = await req.json();
    
    if (!urlForSigning || typeof urlForSigning !== 'string') {
      return new Response(JSON.stringify({ error: 'URL for signing is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate URL is a MoonPay URL
    let url: URL;
    try {
      url = new URL(urlForSigning);
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid URL format' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Only allow signing MoonPay URLs
    if (!url.hostname.includes('moonpay.com') && !url.hostname.includes('moonpay.io')) {
      logSecurityEvent('MOONPAY_INVALID_URL', { clientId, hostname: url.hostname });
      return new Response(JSON.stringify({ error: 'Invalid URL domain' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const queryString = url.search.substring(1);
    
    // Create HMAC signature
    const signature = createHmac('sha256', secretKey)
      .update(queryString)
      .digest('base64');

    console.log(`[SIGN] MoonPay URL signed for user ${authResult.userId?.slice(0, 8)}...`);

    return new Response(
      JSON.stringify({ signature }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('MoonPay sign error:', errorMessage);
    return new Response(
      JSON.stringify({ error: 'Failed to sign URL' }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
