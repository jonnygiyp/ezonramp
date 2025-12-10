import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Get allowed origins from environment or default to restrictive list
const ALLOWED_ORIGINS = Deno.env.get('ALLOWED_ORIGINS')?.split(',') || [];

const getCorsHeaders = (origin: string | null) => {
  // Check if origin is allowed
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0] || '';
  
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
};

// Initialize Supabase client with service role for audit logging
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Allowed payment providers whitelist
const ALLOWED_PROVIDERS = ['stripe', 'card2crypto', 'paypal'];

// Rate limiting map (in production, use Redis or similar)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW_MS = 60000; // 1 minute
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

// Input validation schemas
function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length <= 254;
}

function validateAmount(amount: number): boolean {
  return typeof amount === 'number' && amount > 0 && amount <= 10000;
}

function validateProvider(provider: string): boolean {
  return ALLOWED_PROVIDERS.includes(provider.toLowerCase());
}

function validateCurrency(currency: string): boolean {
  const allowedCurrencies = ['USD', 'EUR', 'GBP', 'USDC', 'USDT'];
  return allowedCurrencies.includes(currency.toUpperCase());
}

// Hash function for PII (simple hash for audit purposes)
async function hashForAudit(value: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(value + Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.slice(0, 10));
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

// Redact sensitive data for logging
function redactEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '***@***';
  return `${local.slice(0, 2)}***@${domain}`;
}

function redactWallet(wallet: string): string {
  if (wallet.length < 10) return '***';
  return `${wallet.slice(0, 6)}...${wallet.slice(-4)}`;
}

// Audit logging function
async function logTransaction(data: {
  wallet_address: string;
  amount: number;
  email: string;
  provider: string;
  currency: string;
  crypto_currency: string;
  status: 'pending' | 'success' | 'failed' | 'callback_received';
  client_ip: string;
  error_message?: string;
  payment_url?: string;
  request_id?: string;
  callback_data?: Record<string, unknown>;
}) {
  try {
    const emailHash = await hashForAudit(data.email);
    const ipHash = await hashForAudit(data.client_ip);
    
    const { error } = await supabase.from('transaction_audit_log').insert({
      wallet_address: data.wallet_address,
      amount: data.amount,
      email_hash: emailHash,
      provider: data.provider,
      currency: data.currency,
      crypto_currency: data.crypto_currency,
      status: data.status,
      client_ip_hash: ipHash,
      error_message: data.error_message,
      payment_url: data.payment_url,
      request_id: data.request_id,
      callback_data: data.callback_data,
    });
    
    if (error) {
      console.error('Failed to log transaction:', error.message);
    }
  } catch (err) {
    console.error('Audit log error:', err instanceof Error ? err.message : 'Unknown');
  }
}

// Update transaction status
async function updateTransactionStatus(
  requestId: string,
  status: 'pending' | 'success' | 'failed' | 'callback_received',
  updates?: { error_message?: string; callback_data?: Record<string, unknown> }
) {
  try {
    const { error } = await supabase
      .from('transaction_audit_log')
      .update({ status, ...updates })
      .eq('request_id', requestId);
    
    if (error) {
      console.error('Failed to update transaction status:', error.message);
    }
  } catch (err) {
    console.error('Status update error:', err instanceof Error ? err.message : 'Unknown');
  }
}

serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Only allow POST method for payment creation
  if (req.method !== 'POST' && req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get('action');

    // Get client identifier for rate limiting
    const clientId = req.headers.get('x-forwarded-for') || 
                     req.headers.get('cf-connecting-ip') || 
                     'unknown';

    // Check rate limit
    if (!checkRateLimit(clientId)) {
      console.warn(`Rate limit exceeded for client: ${clientId.slice(0, 10)}***`);
      return new Response(JSON.stringify({ error: 'Too many requests. Please try again later.' }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Handle callback from Card2Crypto (GET request)
    if (action === 'callback') {
      const valueCoin = url.searchParams.get('value_coin');
      const orderId = url.searchParams.get('order_id');
      const requestId = url.searchParams.get('request_id');
      
      // Log without sensitive data
      console.log('Card2Crypto callback received:', { 
        hasValueCoin: !!valueCoin, 
        orderId: orderId ? `${orderId.slice(0, 8)}***` : null 
      });
      
      // Update transaction status if we have a request_id
      if (requestId) {
        await updateTransactionStatus(requestId, 'callback_received', {
          callback_data: { value_coin: valueCoin, order_id: orderId }
        });
      }
      
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Handle payment link generation (POST request)
    if (req.method === 'POST') {
      const body = await req.json();
      const { amount, provider, email, currency, orderId } = body;
      const requestId = crypto.randomUUID();

      // Validate all required fields
      const validationErrors: string[] = [];

      if (!amount || !validateAmount(amount)) {
        validationErrors.push('Invalid amount: must be between 0 and 10,000');
      }

      if (!provider || !validateProvider(provider)) {
        validationErrors.push(`Invalid provider: must be one of ${ALLOWED_PROVIDERS.join(', ')}`);
      }

      if (!email || !validateEmail(email)) {
        validationErrors.push('Invalid email address');
      }

      if (!currency || !validateCurrency(currency)) {
        validationErrors.push('Invalid currency');
      }

      if (validationErrors.length > 0) {
        console.warn('Validation failed:', validationErrors);
        return new Response(JSON.stringify({ 
          error: 'Validation failed', 
          details: validationErrors 
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Get payout wallet from secrets
      const PAYOUT_WALLET = Deno.env.get('PAYOUT_WALLET');
      if (!PAYOUT_WALLET) {
        console.error('PAYOUT_WALLET not configured');
        return new Response(JSON.stringify({ error: 'Payment configuration error' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Log without PII
      console.log('Generating payment link:', { 
        amount, 
        provider: provider.toLowerCase(), 
        currency: currency.toUpperCase(),
        email: redactEmail(email),
        orderId: orderId ? `${String(orderId).slice(0, 8)}***` : 'auto-generated',
        requestId
      });

      // Step 1: Create encrypted wallet address
      const safeOrderId = orderId || Date.now();
      const callbackUrl = `${supabaseUrl}/functions/v1/card2crypto?action=callback&order_id=${safeOrderId}&request_id=${requestId}`;
      const encodedCallback = encodeURIComponent(callbackUrl);
      
      const walletResponse = await fetch(
        `https://api.card2crypto.org/control/wallet.php?address=${PAYOUT_WALLET}&callback=${encodedCallback}`
      );
      
      if (!walletResponse.ok) {
        console.error('Failed to create wallet - status:', walletResponse.status);
        
        // Log failed transaction
        await logTransaction({
          wallet_address: PAYOUT_WALLET,
          amount: Number(amount),
          email,
          provider: provider.toLowerCase(),
          currency: currency.toUpperCase(),
          crypto_currency: 'USDC',
          status: 'failed',
          client_ip: clientId,
          error_message: `Wallet creation failed: ${walletResponse.status}`,
          request_id: requestId,
        });
        
        return new Response(JSON.stringify({ error: 'Failed to create payment wallet' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const walletData = await walletResponse.json();
      
      // Log wallet creation without exposing full addresses
      console.log('Wallet created:', { 
        hasAddressIn: !!walletData.address_in,
        addressPreview: walletData.address_in ? redactWallet(walletData.address_in) : null
      });

      // Step 2: Generate payment URL
      const encodedEmail = encodeURIComponent(email);
      const paymentUrl = `https://pay.card2crypto.org/process-payment.php?address=${walletData.address_in}&amount=${amount}&provider=${provider.toLowerCase()}&email=${encodedEmail}&currency=${currency.toUpperCase()}`;

      // Log successful transaction creation
      await logTransaction({
        wallet_address: walletData.address_in || PAYOUT_WALLET,
        amount: Number(amount),
        email,
        provider: provider.toLowerCase(),
        currency: currency.toUpperCase(),
        crypto_currency: 'USDC',
        status: 'pending',
        client_ip: clientId,
        payment_url: paymentUrl,
        request_id: requestId,
      });

      return new Response(JSON.stringify({ 
        paymentUrl,
        trackingAddress: walletData.polygon_address_in ? redactWallet(walletData.polygon_address_in) : null,
        requestId
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Invalid request' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    // Log error without exposing internals
    console.error('Error in card2crypto function:', error instanceof Error ? error.message : 'Unknown error');
    return new Response(JSON.stringify({ error: 'An error occurred processing your request' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
