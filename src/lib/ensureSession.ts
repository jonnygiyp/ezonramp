import { supabase } from "@/integrations/supabase/client";
import type { Session } from "@supabase/supabase-js";

export interface EnsureSessionResult {
  session: Session | null;
  source: "existing" | "refreshed" | "anonymous" | "none";
  error?: string;
}

/**
 * Ensures a Supabase session exists before initializing a ramp provider.
 *
 * Resolution order:
 *   1. Existing session from supabase.auth.getSession()
 *   2. Attempt supabase.auth.refreshSession() if a stale session exists
 *   3. Create an anonymous session (used when a Particle wallet is connected
 *      but the user has not signed in with email/password)
 *
 * The Coinbase and Stripe ramps both require a Supabase JWT to call edge
 * functions. Without this helper, a Particle-only wallet user appears
 * "logged in" in the UI but has no Supabase session, producing misleading
 * "Authentication Required" errors.
 */
export async function ensureSupabaseSession(opts?: {
  allowAnonymous?: boolean;
}): Promise<EnsureSessionResult> {
  // Anonymous sign-ins are disabled at the auth provider level. Both ramps
  // now require a real Supabase login (email/password or OAuth).
  const allowAnonymous = opts?.allowAnonymous ?? false;

  try {
    const { data: getData } = await supabase.auth.getSession();
    if (getData.session) {
      const exp = getData.session.expires_at ?? 0;
      const nowSec = Math.floor(Date.now() / 1000);
      if (exp && exp - nowSec < 60) {
        const { data: refreshed, error: refreshErr } = await supabase.auth.refreshSession();
        if (refreshErr || !refreshed.session) {
          return { session: getData.session, source: "existing" };
        }
        return { session: refreshed.session, source: "refreshed" };
      }
      return { session: getData.session, source: "existing" };
    }

    const { data: refreshed } = await supabase.auth.refreshSession();
    if (refreshed.session) {
      return { session: refreshed.session, source: "refreshed" };
    }

    if (!allowAnonymous) {
      return { session: null, source: "none", error: "Sign-in required" };
    }

    const { data: anon, error: anonErr } = await supabase.auth.signInAnonymously();
    if (anonErr || !anon.session) {
      return { session: null, source: "none", error: anonErr?.message || "Anonymous sign-in failed" };
    }
    return { session: anon.session, source: "anonymous" };
  } catch (err) {
    return {
      session: null,
      source: "none",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
