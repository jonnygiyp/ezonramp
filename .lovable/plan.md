
# MoonPay Headless Onramp — Replacement Plan

Targets: `/express` (PartnerPortal) and the main onramp surface (`ApiIntegration` + `MoonPayOnramp`). Sandbox first (`api.moonpay.dev`, `sk_test_...`). Diagnostics and `/dark` keep the existing widget until we promote sandbox to production.

## Important reality check on "fully headless"

MoonPay's Platform API is the new product, and it is headless for everything *you* care about (quotes, transaction creation, status, history). However, three things still go through MoonPay-hosted iframes ("frames"), because they touch PCI / KYC scope:

- **Connect frame** — initial customer connect / login to their MoonPay account
- **Add Card frame** — PCI-compliant card capture (we cannot collect PANs ourselves)
- **Challenge frame** — 3-D Secure and identity-verification challenges

The actual **Buy frame** is truly headless (no UI rendered) and runs invisibly to evaluate requirements and submit the transaction. Your confirmation screen, loading states, success/failure UI — all yours.

This is the modern way MoonPay does "headless" and it is what every Platform partner uses today. If you wanted to also self-host the card form and KYC document upload, that would require MoonPay's enterprise PCI Level 1 program and is not something we can ship from this stack.

## Architecture

```text
Browser (React)                 Edge Functions (Deno)         MoonPay Platform
─────────────                   ─────────────────────          ────────────────
MoonPayHeadless.tsx  ───────►   moonpay-session   ─────────►  POST /platform/v1/sessions
  (quote/confirm UI)            (mints session token)         (returns sessionToken)
        │
        ▼
@moonpay/moonpay-js SDK  ─────────────────────────────────►   Connect / Add Card /
  (renders required frames)                                    Buy / Challenge frames
        │
        ▼
MoonPayHeadless.tsx  ───────►   moonpay-quote    ─────────►  POST /platform/v1/quotes/buy
                                moonpay-tx       ─────────►  GET  /platform/v1/transactions/:id
                                moonpay-tx-list  ─────────►  GET  /platform/v1/transactions

MoonPay  ───►  moonpay-webhook  ──►  purchase_attempts + transaction_audit_log + Realtime
```

All server-to-MoonPay calls use the **new** secret key `MOONPAY_PLATFORM_SECRET_KEY` (a `sk_test_...` token). The existing `MOONPAY_SECRET_KEY` and `MOONPAY_PUBLISHABLE_KEY` stay in place for the legacy widget on `/dark` and Diagnostics until cut-over.

## Work breakdown

### 1. Secrets & config
- Request `MOONPAY_PLATFORM_SECRET_KEY` (sandbox `sk_test_...`) via the secrets tool.
- Add `MOONPAY_PLATFORM_BASE_URL` default `https://api.moonpay.dev` (sandbox) — flipping to `https://api.moonpay.com` is a single config change.

### 2. Edge functions (all behind Supabase JWT, strict CORS via `_shared/auth.ts`)
- `moonpay-session` — POST: creates a Platform session for the authenticated user, returns `sessionToken` + `customerId`.
- `moonpay-quote` — POST: proxies `POST /platform/v1/quotes/buy` (amount, currency, network, wallet address). Validates wallet matches the user's linked Particle address.
- `moonpay-payment-methods` — GET: lists stored payment methods.
- `moonpay-transaction` — GET `?id=…`: returns single transaction.
- `moonpay-transactions` — GET: paginated list for the connected user (powers "your purchases").
- `moonpay-webhook` — public (signature-verified): writes/upserts into `purchase_attempts`, `transaction_audit_log`, broadcasts via existing realtime pipeline.

### 3. Frontend
- Add `@moonpay/moonpay-js` (Platform SDK).
- New `src/components/MoonPayHeadlessOnramp.tsx`:
  - Wallet input (auto-filled from Particle, same UX as today).
  - Amount + currency selector, defaulting to USDC on Solana.
  - Live quote (`moonpay-quote` debounced) showing fees, network fee, total, exchange rate.
  - "Continue" runs SDK `connect()` (Connect frame) if not yet connected.
  - First-time users → SDK `addCard()` (Add Card frame) to store a card.
  - Confirm screen → SDK `buy()` (headless Buy frame). We handle Challenge frame popups for 3-D Secure.
  - Granular state machine mirroring our existing Coinbase headless tracking: `quoting → connecting → adding_card → confirming → processing → success | failed | challenge_required`.
- Wire into `ApiIntegration.tsx` and `PartnerPortal.tsx` behind a `moonpay_headless` provider id; geo defaults from `rampSelection.ts` are unchanged.
- Keep `MoonPayOnramp.tsx` (widget) mounted for `/dark` and Diagnostics; mark it deprecated in a code comment.

### 4. Database
Reuse existing `purchase_attempts` schema (already has `provider`, `lifecycle_state`, `failure_reason_code`). Add provider value `'moonpay_headless'`. No migration needed unless we want a dedicated `moonpay_transactions` mirror table parallel to `coinbase_transactions` (recommend yes, for parity):
- `moonpay_transactions` table: `transaction_id`, `customer_id`, `user_id`, `wallet_address`, `status`, `fiat_value/currency`, `crypto_value/currency`, `network`, `payload jsonb`, `failure_reason_code`, plus the standard `created_at/updated_at`. Service-role writes only; SELECT scoped to `auth.uid()` like `coinbase_transactions`.

### 5. Cut-over plan
1. Ship sandbox build behind a feature-flag-style URL param `?moonpayHeadless=1` so internal testing can run alongside the current widget.
2. Once sandbox passes our test matrix (US card, EU card, 3DS challenge, failed quote, abandoned KYC), set `moonpay_headless` as the registered `moonpay` provider in `onramp_providers` table and add `MOONPAY_PLATFORM_BASE_URL=https://api.moonpay.com` + live `sk_live_...`.
3. After 1 week of clean live traffic, remove `MoonPayOnramp.tsx`, `moonpay-sign` edge function, `MOONPAY_SECRET_KEY`, and `VITE_MOONPAY_PUBLISHABLE_KEY`.

## Technical details

- SDK init expects `{ flow: 'buy', environment: 'sandbox' | 'production', sessionToken }`. Session tokens are short-lived (~minutes); the frontend re-mints via `moonpay-session` on expiry.
- Webhook signature: HMAC-SHA256 over the raw body with the `Moonpay-Signature-V2` header, secret `MOONPAY_WEBHOOK_SECRET` (new). Function returns 500 if secret unset (same hardening as `coinbase-webhook`).
- Wallet binding: `moonpay-quote` and `moonpay-session` reject any wallet address that does not match `profiles.wallet_address` for the calling user. This carries the same guarantee that already protects Coinbase headless.
- CORS: all new functions use `getCorsHeaders(origin)` from `_shared/auth.ts`. No new origins required.
- RLS: any new `moonpay_transactions` table follows the established pattern — `service_role` for writes, authenticated SELECT scoped to `auth.uid()` and wallet match.

## What I will NOT do in this pass
- Touch `/dark` portal or Diagnostics — the legacy widget keeps working there until production cut-over.
- Self-host the card form or KYC document capture — would require PCI scope we don't carry.
- Change geo routing or default-provider selection logic.
- Remove `moonpay-sign` / `MOONPAY_SECRET_KEY` until step 5 above.

## Open question I'll resolve as I build
Whether to fold "stored payment methods" into the confirm screen on first ship, or hide it behind an "Use saved card" toggle. I'll default to showing stored cards if `moonpay-payment-methods` returns ≥1 result; otherwise straight to Add Card frame.
