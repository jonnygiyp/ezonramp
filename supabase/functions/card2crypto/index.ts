import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PAYOUT_WALLET = "0x92a2E6fCfaE8ed06d9Cf3B774F34D806174Da5e4";

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get('action');

    // Handle callback from Card2Crypto (GET request)
    if (action === 'callback') {
      const valueCoin = url.searchParams.get('value_coin');
      const orderId = url.searchParams.get('order_id');
      
      console.log('Card2Crypto callback received:', { valueCoin, orderId });
      
      // Here you could update order status in your database
      // For now, we just acknowledge the callback
      return new Response(JSON.stringify({ success: true, valueCoin, orderId }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Handle payment link generation (POST request)
    if (req.method === 'POST') {
      const { amount, provider, email, currency, orderId } = await req.json();
      
      console.log('Generating Card2Crypto payment link:', { amount, provider, email, currency, orderId });

      // Validate required fields
      if (!amount || !provider || !email || !currency) {
        return new Response(JSON.stringify({ error: 'Missing required fields: amount, provider, email, currency' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Step 1: Create encrypted wallet address
      const callbackUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/card2crypto?action=callback&order_id=${orderId || Date.now()}`;
      const encodedCallback = encodeURIComponent(callbackUrl);
      
      const walletResponse = await fetch(
        `https://api.card2crypto.org/control/wallet.php?address=${PAYOUT_WALLET}&callback=${encodedCallback}`
      );
      
      if (!walletResponse.ok) {
        console.error('Failed to create wallet:', await walletResponse.text());
        return new Response(JSON.stringify({ error: 'Failed to create payment wallet' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const walletData = await walletResponse.json();
      console.log('Wallet created:', walletData);

      // Step 2: Generate payment URL
      const encodedEmail = encodeURIComponent(email);
      const paymentUrl = `https://pay.card2crypto.org/process-payment.php?address=${walletData.address_in}&amount=${amount}&provider=${provider}&email=${encodedEmail}&currency=${currency}`;

      return new Response(JSON.stringify({ 
        paymentUrl,
        trackingAddress: walletData.polygon_address_in 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Invalid request method' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Error in card2crypto function:', error);
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
