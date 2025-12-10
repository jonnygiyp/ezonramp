import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
      
      // Log without sensitive data
      console.log('Card2Crypto callback received:', { 
        hasValueCoin: !!valueCoin, 
        orderId: orderId ? `${orderId.slice(0, 8)}***` : null 
      });
      
      // Here you could update order status in your database
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Handle payment link generation (POST request)
    if (req.method === 'POST') {
      const body = await req.json();
      const { amount, provider, email, currency, orderId } = body;

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
        orderId: orderId ? `${String(orderId).slice(0, 8)}***` : 'auto-generated'
      });

      // Step 1: Create encrypted wallet address
      const safeOrderId = orderId || Date.now();
      const callbackUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/card2crypto?action=callback&order_id=${safeOrderId}`;
      const encodedCallback = encodeURIComponent(callbackUrl);
      
      const walletResponse = await fetch(
        `https://api.card2crypto.org/control/wallet.php?address=${PAYOUT_WALLET}&callback=${encodedCallback}`
      );
      
      if (!walletResponse.ok) {
        console.error('Failed to create wallet - status:', walletResponse.status);
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

      return new Response(JSON.stringify({ 
        paymentUrl,
        trackingAddress: walletData.polygon_address_in ? redactWallet(walletData.polygon_address_in) : null
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
