/**
 * Particle is used ONLY for wallet authentication / connection in EZOnramp.
 * Particle's native onramp (buy / swap / bridge / deposit / funding screens)
 * must never be triggered from our UI.
 *
 * The `useModal().setOpen(true)` call from Particle Connectkit opens the
 * connect modal when no wallet is connected, but once a wallet IS connected
 * it can surface Particle's embedded wallet UI (which exposes Buy/Onramp).
 * On mobile this slides up from the bottom and tries to initiate a purchase
 * through Particle's own onramp — that is the bug we are guarding against.
 *
 * Always route Particle modal opens through this helper.
 */
export function openParticleConnectModalIfDisconnected(
  setOpen: (open: boolean) => void,
  isConnected: boolean,
): boolean {
  if (isConnected) {
    // Already connected — refuse to open Particle modal so its onramp /
    // wallet panel can never appear. Callers should handle the connected
    // case explicitly (e.g. refresh Supabase session, show toast).
    console.warn('[Particle] Refusing to open modal: wallet already connected. Particle onramp is disabled.');
    return false;
  }
  setOpen(true);
  return true;
}
