import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/auth.ts";

serve(async (req) => {
  const cors = getCorsHeaders(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { ref } = await req.json();
    if (!ref || typeof ref !== "string" || ref.length > 64) {
      return new Response(JSON.stringify({ valid: false }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data, error } = await supabase.rpc("validate_tracking_code", { _code: ref });
    if (error || !data || (Array.isArray(data) && data.length === 0)) {
      return new Response(JSON.stringify({ valid: false }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    const row = Array.isArray(data) ? data[0] : data;
    return new Response(
      JSON.stringify({
        valid: true,
        campaign_id: row.campaign_id,
        destination_path: row.destination_path,
      }),
      { headers: { ...cors, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[tracking-validate]", e);
    return new Response(JSON.stringify({ valid: false }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
