import { generateJwt } from "npm:@coinbase/cdp-sdk/auth";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKeyId = Deno.env.get("COINBASE_API_KEY");
    const apiKeySecret = Deno.env.get("COINBASE_API_SECRET");

    if (!apiKeyId || !apiKeySecret) {
      console.error("Missing Coinbase API credentials");
      return new Response(
        JSON.stringify({ error: "Server configuration error" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const { addresses, assets } = await req.json();
    console.log("Generating session token for:", { addresses, assets });

    const requestMethod = "POST";
    const requestHost = "api.developer.coinbase.com";
    const requestPath = "/onramp/v1/token";

    console.log("Generating JWT via CDP SDK...");

    const jwt = await generateJwt({
      apiKeyId,
      apiKeySecret,
      requestMethod,
      requestHost,
      requestPath,
      expiresIn: 120,
    });

    console.log("JWT generated successfully");

    const response = await fetch(
      "https://api.developer.coinbase.com/onramp/v1/token",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${jwt}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ addresses, assets }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Coinbase API error:", response.status, errorText);
      return new Response(
        JSON.stringify({
          error: "Failed to generate session token",
          details: errorText,
        }),
        {
          status: response.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const data = await response.json();
    console.log("Session token generated successfully");

    return new Response(
      JSON.stringify({ token: data.token, channel_id: data.channel_id }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error in generate-coinbase-token function:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
