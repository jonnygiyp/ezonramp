import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  getCorsHeaders,
  validateAuth,
  unauthorizedResponse,
  getClientId,
  logSecurityEvent,
  validateOrigin,
} from "../_shared/auth.ts";

interface VerifyRequest {
  action: 'send' | 'check';
  channel: 'sms' | 'email';
  to: string;
  code?: string;
}

// Rate limiting
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW_MS = 60000;
const RATE_LIMIT_MAX_REQUESTS = 5; // Stricter limit for verification codes

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
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Validate origin
  const originError = validateOrigin(origin, corsHeaders);
  if (originError) return originError;

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
      logSecurityEvent('RATE_LIMIT_EXCEEDED', { clientId, function: 'twilio-verify' });
      return new Response(JSON.stringify({ error: 'Too many requests. Please try again later.' }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ========================================
    // AUTHENTICATION CHECK - Verification requires auth
    // ========================================
    const authResult = await validateAuth(req);
    
    if (!authResult.authenticated) {
      logSecurityEvent('AUTH_FAILED_TWILIO_VERIFY', {
        clientId,
        error: authResult.error,
      });
      return unauthorizedResponse(corsHeaders, authResult.error);
    }

    console.log(`[AUTH] Twilio verify request authorized for user ${authResult.userId?.slice(0, 8)}...`);

    // ========================================
    // TWILIO VERIFICATION
    // ========================================
    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const serviceSid = Deno.env.get('TWILIO_VERIFY_SERVICE_SID');

    if (!accountSid || !authToken || !serviceSid) {
      console.error('Twilio credentials not configured');
      return new Response(JSON.stringify({ error: 'Verification service not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body: VerifyRequest = await req.json();
    const { action, channel, to, code } = body;

    if (!action || !channel || !to) {
      return new Response(JSON.stringify({ error: 'Missing required fields: action, channel, to' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action !== 'send' && action !== 'check') {
      return new Response(JSON.stringify({ error: 'Invalid action. Use "send" or "check"' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (channel !== 'sms' && channel !== 'email') {
      return new Response(JSON.stringify({ error: 'Invalid channel. Use "sms" or "email"' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate input format
    if (channel === 'email') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(to)) {
        return new Response(JSON.stringify({ error: 'Invalid email format' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    } else if (channel === 'sms') {
      const phoneRegex = /^\+[1-9]\d{6,14}$/;
      if (!phoneRegex.test(to)) {
        return new Response(JSON.stringify({ error: 'Invalid phone format. Use E.164 format (e.g., +14155551234)' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const auth = btoa(`${accountSid}:${authToken}`);
    const baseUrl = `https://verify.twilio.com/v2/Services/${serviceSid}`;

    if (action === 'send') {
      console.log(`[VERIFY] Sending ${channel} verification to: ${to.slice(0, 5)}*** for user ${authResult.userId?.slice(0, 8)}...`);

      const response = await fetch(`${baseUrl}/Verifications`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: to,
          Channel: channel,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        console.error('Twilio send error:', data);
        return new Response(JSON.stringify({ 
          error: data.message || 'Failed to send verification code',
          code: data.code,
        }), {
          status: response.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      console.log('[VERIFY] Verification sent successfully, status:', data.status);

      return new Response(JSON.stringify({ 
        success: true,
        status: data.status,
        channel: data.channel,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } else if (action === 'check') {
      if (!code) {
        return new Response(JSON.stringify({ error: 'Code is required for check action' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (!/^\d{4,8}$/.test(code)) {
        return new Response(JSON.stringify({ error: 'Invalid code format' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      console.log(`[VERIFY] Checking ${channel} verification for: ${to.slice(0, 5)}*** for user ${authResult.userId?.slice(0, 8)}...`);

      const response = await fetch(`${baseUrl}/VerificationCheck`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: to,
          Code: code,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        console.error('Twilio check error:', data);
        return new Response(JSON.stringify({ 
          error: data.message || 'Failed to verify code',
          code: data.code,
        }), {
          status: response.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const verified = data.status === 'approved';
      console.log('[VERIFY] Verification check result:', data.status);

      return new Response(JSON.stringify({ 
        success: true,
        verified,
        status: data.status,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Invalid request' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Twilio verify error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
