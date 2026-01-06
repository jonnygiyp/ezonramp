import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface VerifyRequest {
  action: 'send' | 'check';
  channel: 'sms' | 'email';
  to: string; // phone number or email
  code?: string; // only for 'check' action
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
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
      // Basic phone validation - should start with + and contain only digits
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
      // Send verification code
      console.log(`Sending ${channel} verification to:`, to.slice(0, 5) + '***');

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

      console.log('Verification sent successfully, status:', data.status);

      return new Response(JSON.stringify({ 
        success: true,
        status: data.status,
        channel: data.channel,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } else if (action === 'check') {
      // Check verification code
      if (!code) {
        return new Response(JSON.stringify({ error: 'Code is required for check action' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Validate code format (typically 4-8 digits)
      if (!/^\d{4,8}$/.test(code)) {
        return new Response(JSON.stringify({ error: 'Invalid code format' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      console.log(`Checking ${channel} verification for:`, to.slice(0, 5) + '***');

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
      console.log('Verification check result:', data.status);

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
