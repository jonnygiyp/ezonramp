import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  getCoinbaseCorsHeaders,
  forbiddenCorsResponse,
  isOriginAllowed,
} from "../_shared/coinbase-auth.ts";

/**
 * Geolocation edge function.
 *
 * Returns a coarse country signal derived from the client's IP address.
 * Used ONLY to pick a default ramp on first load — NOT a hard compliance gate.
 *
 * Resolution order:
 *   1. `cf-ipcountry` header (set by Cloudflare in front of Supabase Edge)
 *   2. `x-vercel-ip-country` (in case the request transits Vercel)
 *   3. Fallback: ipapi.co lookup using the first IP in x-forwarded-for
 *
 * Response shape:
 *   { country_code: string|null, country_name: string|null, is_us: boolean, source: string }
 */

// Minimal ISO 3166-1 alpha-2 -> display name map for the most common cases.
// We don't need every country — only enough so the client can show a friendly
// hint. Unknown codes fall back to the raw code.
const COUNTRY_NAMES: Record<string, string> = {
  US: "United States",
  CA: "Canada",
  GB: "United Kingdom",
  DE: "Germany",
  FR: "France",
  ES: "Spain",
  IT: "Italy",
  NL: "Netherlands",
  PT: "Portugal",
  IE: "Ireland",
  AU: "Australia",
  NZ: "New Zealand",
  JP: "Japan",
  KR: "South Korea",
  SG: "Singapore",
  HK: "Hong Kong",
  IN: "India",
  BR: "Brazil",
  MX: "Mexico",
  AR: "Argentina",
  CL: "Chile",
  CO: "Colombia",
  ZA: "South Africa",
  AE: "United Arab Emirates",
  CH: "Switzerland",
  SE: "Sweden",
  NO: "Norway",
  DK: "Denmark",
  FI: "Finland",
  PL: "Poland",
  TR: "Turkey",
  PH: "Philippines",
  ID: "Indonesia",
  VN: "Vietnam",
  TH: "Thailand",
  MY: "Malaysia",
  NG: "Nigeria",
  KE: "Kenya",
  EG: "Egypt",
};

function nameFor(code: string | null): string | null {
  if (!code) return null;
  return COUNTRY_NAMES[code.toUpperCase()] ?? code.toUpperCase();
}

function firstIp(header: string | null): string | null {
  if (!header) return null;
  const ip = header.split(",")[0]?.trim();
  return ip || null;
}

async function lookupViaIpapi(ip: string): Promise<string | null> {
  try {
    // ipapi.co free tier — no key required for low volume.
    // We only need the country code; this is best-effort and may fail silently.
    const res = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/country/`, {
      headers: { "User-Agent": "ezonramp-geo-detect/1.0" },
    });
    if (!res.ok) return null;
    const text = (await res.text()).trim().toUpperCase();
    // ipapi returns 2-letter ISO code on success; anything else (e.g. "Undefined") is a miss.
    if (/^[A-Z]{2}$/.test(text)) return text;
    return null;
  } catch (err) {
    console.warn("[GEO-DETECT] ipapi lookup failed:", err);
    return null;
  }
}

serve(async (req) => {
  const origin = req.headers.get("origin");

  // Strict CORS — same allowlist as our other public edge functions.
  if (!isOriginAllowed(origin)) {
    console.warn(`[GEO-DETECT] CORS denied for origin: ${origin || "(missing)"}`);
    return forbiddenCorsResponse();
  }

  const corsHeaders = getCoinbaseCorsHeaders(origin)!;

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // 1. Edge-provided country headers (zero latency, zero cost)
    const cfCountry = req.headers.get("cf-ipcountry");
    const vercelCountry = req.headers.get("x-vercel-ip-country");
    let countryCode: string | null = null;
    let source = "unknown";

    if (cfCountry && cfCountry !== "XX" && cfCountry !== "T1") {
      countryCode = cfCountry.toUpperCase();
      source = "cf-ipcountry";
    } else if (vercelCountry) {
      countryCode = vercelCountry.toUpperCase();
      source = "x-vercel-ip-country";
    } else {
      // 2. Fallback to IP -> country lookup
      const ip =
        firstIp(req.headers.get("x-forwarded-for")) ||
        req.headers.get("cf-connecting-ip") ||
        req.headers.get("x-real-ip");

      if (ip) {
        countryCode = await lookupViaIpapi(ip);
        if (countryCode) source = "ipapi";
      }
    }

    const isUs = countryCode === "US";
    const countryName = nameFor(countryCode);

    console.log(
      `[GEO-DETECT] resolved country=${countryCode ?? "null"} is_us=${isUs} source=${source}`,
    );

    return new Response(
      JSON.stringify({
        country_code: countryCode,
        country_name: countryName,
        is_us: isUs,
        source,
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          // Cache briefly so repeated calls in the same browser session stay cheap.
          "Cache-Control": "private, max-age=300",
        },
      },
    );
  } catch (error) {
    console.error("[GEO-DETECT] Error:", error);
    // Fail open: return a neutral response so the client can fall back to
    // its safe default (Coinbase Global) without surfacing an error.
    return new Response(
      JSON.stringify({
        country_code: null,
        country_name: null,
        is_us: false,
        source: "error",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
