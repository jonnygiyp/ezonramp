/**
 * Centralized diagnostic logging for auth/session/onramp flows.
 * Use to capture device, browser, session, and token state at any failure point.
 */
import { supabase } from "@/integrations/supabase/client";

const isBrowser = typeof window !== "undefined" && typeof navigator !== "undefined";

export function getDeviceContext() {
  if (!isBrowser) return { runtime: "ssr" };
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua);
  const isAndroid = /Android/.test(ua);
  const isSafari = /^((?!chrome|android).)*safari/i.test(ua);
  const isMobile = isIOS || isAndroid || /Mobi/.test(ua);
  let storageAvailable = false;
  try {
    const k = "__ezo_test__";
    window.localStorage.setItem(k, "1");
    window.localStorage.removeItem(k);
    storageAvailable = true;
  } catch { storageAvailable = false; }
  return {
    userAgent: ua,
    isMobile,
    isIOS,
    isAndroid,
    isSafari,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    cookiesEnabled: navigator.cookieEnabled,
    localStorageAvailable: storageAvailable,
  };
}

export async function logAuthDiagnostics(label: string, extra: Record<string, unknown> = {}) {
  const device = getDeviceContext();
  let sessionInfo: Record<string, unknown> = { hasSession: false };
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) {
      sessionInfo = { hasSession: false, sessionError: error.message };
    } else if (session) {
      const expiresAt = session.expires_at ? session.expires_at * 1000 : null;
      sessionInfo = {
        hasSession: true,
        userId: session.user.id.slice(0, 8),
        hasAccessToken: !!session.access_token,
        tokenExpiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
        tokenExpiresInSec: expiresAt ? Math.round((expiresAt - Date.now()) / 1000) : null,
      };
    }
  } catch (e) {
    sessionInfo = { hasSession: false, getSessionThrew: e instanceof Error ? e.message : String(e) };
  }
  // Single grouped log line so it's easy to grep in production logs.
  console.log(`[AuthDiag:${label}]`, { ...device, ...sessionInfo, ...extra });
}
