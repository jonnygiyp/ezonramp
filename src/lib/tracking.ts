/**
 * Inbound referral tracking client.
 *
 * Captures `?ref=` on landing, validates against backend, persists to
 * localStorage + sessionStorage + first-party cookie, and reports
 * landing/page_view/heartbeat/sign_in/onramp/purchase events to the
 * tracking edge functions.
 */
import { supabase } from "@/integrations/supabase/client";

const REF_KEY = "ez_ref";
const SID_KEY = "ez_sid";
const COOKIE_DAYS = 90;
const HEARTBEAT_MS = 45_000;

let initialized = false;
let heartbeatTimer: number | null = null;

function setCookie(name: string, value: string, days: number) {
  try {
    const expires = new Date(Date.now() + days * 86_400_000).toUTCString();
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax${secure}`;
  } catch {/* ignore */}
}
function getCookie(name: string): string | null {
  try {
    const match = document.cookie.match(new RegExp("(?:^|;\\s*)" + name + "=([^;]+)"));
    return match ? decodeURIComponent(match[1]) : null;
  } catch { return null; }
}

function readStored(key: string): string | null {
  try {
    return (
      window.localStorage.getItem(key) ||
      window.sessionStorage.getItem(key) ||
      getCookie(key)
    );
  } catch { return null; }
}
function writeStored(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
    window.sessionStorage.setItem(key, value);
    setCookie(key, value, COOKIE_DAYS);
  } catch {/* ignore */}
}

export function getCurrentRef(): string | null {
  return readStored(REF_KEY);
}
export function getCurrentSessionId(): string | null {
  return readStored(SID_KEY);
}

async function invoke<T = unknown>(fn: string, body: Record<string, unknown>): Promise<T | null> {
  try {
    const { data, error } = await supabase.functions.invoke(fn, { body });
    if (error) {
      console.warn(`[tracking] ${fn} error`, error.message);
      return null;
    }
    return (data ?? null) as T | null;
  } catch (e) {
    console.warn(`[tracking] ${fn} failed`, e);
    return null;
  }
}

async function ensureSession(ref: string) {
  const existing = getCurrentSessionId();
  const res = await invoke<{ session_id?: string }>("tracking-session", {
    ref,
    session_id: existing,
    landing_path: window.location.pathname,
    full_landing_url: window.location.href,
    referrer_url: document.referrer || null,
  });
  if (res?.session_id) {
    writeStored(SID_KEY, res.session_id);
  }
}

export async function trackEvent(
  eventType:
    | "page_view"
    | "sign_in"
    | "wallet_connected"
    | "onramp_started"
    | "purchase_completed"
    | "purchase_failed"
    | "session_heartbeat",
  metadata?: Record<string, unknown>,
): Promise<void> {
  const ref = getCurrentRef();
  const sid = getCurrentSessionId();
  if (!ref || !sid) return;
  await invoke("tracking-event", {
    session_id: sid,
    ref,
    event_type: eventType,
    metadata: metadata ?? {},
  });
}

export async function attachUserOnSignIn(): Promise<void> {
  const ref = getCurrentRef();
  const sid = getCurrentSessionId();
  if (!ref || !sid) return;
  await invoke("tracking-attach-user", { session_id: sid, ref });
}

export async function trackOnrampStart(
  provider: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  await trackEvent("onramp_started", { provider, ...(metadata ?? {}) });
}

export async function attachPurchase(args: {
  provider: string;
  transactionId: string;
  status?: string;
  fiatAmount?: number;
  fiatCurrency?: string;
  cryptoAmount?: number;
  cryptoCurrency?: string;
  chain?: string;
  walletAddress?: string;
}): Promise<void> {
  const ref = getCurrentRef();
  const sid = getCurrentSessionId();
  if (!ref) return;
  await invoke("tracking-attach-purchase", {
    session_id: sid,
    ref,
    onramp_provider: args.provider,
    transaction_id: args.transactionId,
    purchase_status: args.status ?? null,
    fiat_amount: args.fiatAmount ?? null,
    fiat_currency: args.fiatCurrency ?? "USD",
    crypto_amount: args.cryptoAmount ?? null,
    crypto_currency: args.cryptoCurrency ?? "USDC",
    chain: args.chain ?? null,
    wallet_address: args.walletAddress ?? null,
  });
}

function startHeartbeat() {
  if (heartbeatTimer != null) return;
  heartbeatTimer = window.setInterval(() => {
    if (document.visibilityState !== "visible") return;
    void trackEvent("session_heartbeat");
  }, HEARTBEAT_MS);
}

export async function initTracking(): Promise<void> {
  if (initialized) return;
  initialized = true;

  try {
    const params = new URLSearchParams(window.location.search);
    const refFromUrl = params.get("ref");

    if (refFromUrl) {
      const validation = await invoke<{ valid: boolean }>("tracking-validate", {
        ref: refFromUrl,
      });
      if (validation?.valid) {
        writeStored(REF_KEY, refFromUrl);
        // Clear ref from URL
        params.delete("ref");
        const qs = params.toString();
        const newUrl =
          window.location.pathname + (qs ? `?${qs}` : "") + window.location.hash;
        window.history.replaceState({}, "", newUrl);
      }
    }

    const ref = getCurrentRef();
    if (!ref) return;

    await ensureSession(ref);
    startHeartbeat();

    // Page view on route change (popstate + custom for SPA pushes)
    window.addEventListener("popstate", () => {
      void trackEvent("page_view", { path: window.location.pathname });
    });
  } catch (e) {
    console.warn("[tracking] init failed", e);
  }
}
