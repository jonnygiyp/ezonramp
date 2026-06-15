---
name: Particle onramp disabled
description: Particle is wallet-auth only — its wallet plugin (Buy/Swap/Bridge/Onramp) must never be enabled, and useModal().setOpen must never fire when already connected
type: constraint
---
Particle Network is used ONLY for wallet connection, authentication, and
address retrieval in EZOnramp. Particle's native onramp (Buy / Swap / Bridge /
Deposit / Funding) must never be triggered from any UI.

Rules:
1. Do NOT add `@particle-network/connectkit/wallet` `wallet({...})` plugin to
   the connectkit `createConfig({ plugins: [...] })` array. That plugin is
   what surfaces Particle's embedded wallet UI containing Buy/Swap/Onramp.
2. Never call `useModal().setOpen(true)` directly. Always route through
   `openParticleConnectModalIfDisconnected(setOpen, isConnected)` from
   `src/lib/particleModal.ts`. When a wallet is already connected, that
   helper refuses to open the modal (preventing Particle's wallet/onramp
   panel from sliding up — the mobile bug from June 2026).
3. Ramp Continue buttons (Stripe, Coinbase Global, Coinbase Headless) must
   only verify wallet connection + Supabase session, then launch the chosen
   provider. Never fall back to Particle's onramp.

**Why:** Particle was intercepting Continue actions on mobile and showing its
own purchase flow, breaking Coinbase/Stripe purchases.
