# Inbound Referral Tracking System

A complete `?ref=` campaign attribution system for ezonramp.com and /express, modeled on the existing admin Transactions tab.

## 1. Database (new migration)

Four new tables, all RLS-enabled, all admin-read-only via `is_admin(auth.uid())`.

**inbound_tracking_campaigns**
- id, tracking_code (unique short slug, default `encode(gen_random_bytes(6),'base64')`-style), campaign_name, destination_path (`/` or `/express`), notes, created_by uuid, is_active bool, created_at, updated_at

**inbound_tracking_sessions**
- id, tracking_code, campaign_id, landing_path, full_landing_url, referrer_url, user_agent, country (set server-side via Cloudflare/edge geo header — never raw IP), first_seen_at, last_seen_at, session_duration_seconds (generated/computed on update), signed_in_user_id, wallet_address, sign_in_at, created_at, updated_at

**inbound_tracking_events**
- id, session_id, campaign_id, tracking_code, event_type (enum: landing, page_view, sign_in, wallet_connected, onramp_started, purchase_completed, purchase_failed, session_heartbeat), metadata jsonb, created_at

**inbound_tracking_attributions**
- id, session_id, campaign_id, tracking_code, user_id, wallet_address, onramp_provider, transaction_id (text), purchase_status, fiat_amount, fiat_currency, crypto_amount, crypto_currency, chain, created_at, updated_at
- unique on (transaction_id, onramp_provider) to dedupe

**RLS**
- campaigns: admins ALL; nobody else
- sessions/events/attributions: service_role full; admins SELECT; clients blocked (writes go through edge functions with service role)
- A separate `validate_tracking_code(text)` SECURITY DEFINER function returns campaign id+destination if active, used by anon clients without exposing the table

## 2. Edge Functions (new)

All use the existing `_shared/auth.ts` CORS allowlist pattern. Anonymous endpoints validate the body schema only (no JWT required, since unauth visitors must call them); authenticated endpoints require a Supabase JWT.

- **tracking-validate** (anon) — `POST {ref}` → returns `{valid, campaign_id, destination_path}` via the SECURITY DEFINER function
- **tracking-session** (anon) — `POST` create/upsert session: `{ref, session_id?, landing_path, full_landing_url, referrer_url, user_agent}` → returns `session_id`. Country comes from `cf-ipcountry` / `x-vercel-ip-country` header. Inserts a `landing` event on first create.
- **tracking-event** (anon) — `POST {session_id, ref, event_type, metadata?}` → inserts event, updates `last_seen_at` and `session_duration_seconds = last_seen_at - first_seen_at`
- **tracking-attach-user** (auth required) — `POST {session_id, ref}` → reads `auth.uid()` + profiles.wallet_address, sets `signed_in_user_id`, `wallet_address`, `sign_in_at`; inserts `sign_in` / `wallet_connected` events
- **tracking-attach-purchase** (service-callable from existing webhooks) — `POST {session_id, ref, provider, transaction_id, status, fiat_amount, crypto_amount, ...}` → upserts `inbound_tracking_attributions` row

The existing `coinbase-webhook` and `stripe-webhook` get a small addition: when a transaction completes/fails, look up the most recent active session for that `user_id` (or `wallet_address`) within the last 30 days and write an attribution row. No transaction data is duplicated beyond ID + status + amounts needed for reporting.

## 3. Frontend tracking utility

`src/lib/tracking.ts` — small singleton:
- On import, read `?ref=` from URL; if present, validate via `tracking-validate`; on success, store `{ref, session_id}` in localStorage + sessionStorage + first-party cookie (`ez_ref`, `ez_sid`, 90-day expiry, `SameSite=Lax`, `Secure`)
- `initTracking()` called from `App.tsx` → triggers `tracking-session` if no `session_id` yet, sends `landing`
- `trackEvent(type, metadata?)` helper
- `startHeartbeat()` — `setInterval` every 45s while tab visible (uses `document.visibilityState`); pauses when hidden
- `attachUserOnSignIn()` — called from `useAuth` after sign-in / from `useWalletSync` after wallet binding
- `trackOnrampStart(provider)` — wired into the existing onramp launch points (Coinbase widget, Stripe iframe, MoonPay, Coinflow)

Removes `?ref=` from the URL after capture (history.replaceState) so it doesn't pollute analytics or share links.

## 4. Admin UI

New tab `Inbound Tracking` in `src/pages/Admin.tsx` (TabsList becomes 8 cols).

**`src/components/admin/InboundTracking.tsx`** — two-view component:

*Campaigns list view*
- Header with "New Campaign" button → dialog: campaign_name, destination (Home/Express radio), notes → POSTs to a `tracking-campaign` admin edge function (or direct insert via RLS since admins have ALL on campaigns)
- Table columns: Campaign, Destination, Tracking URL (with copy button), Visits, Sign-ins, Wallets, Purchases, Volume (USD), Sign-in %, Purchase %, Created, Status, Actions (Archive/Activate, View)
- Aggregates fetched via a SQL view `inbound_campaign_stats` (admin-readable) that joins campaigns ⇽ sessions ⇽ attributions

*Campaign detail view (when "View" clicked)*
- Filters: date range, signed-in only, purchased only, provider, status
- Sessions table: First seen, Last seen, Duration, Landing URL, Referrer, User ID, Wallet, Provider, Tx ID, Status, Amount
- Reuses the same Table primitives, filter Inputs/Selects, and CSV export pattern already used in `CoinbaseTransactions.tsx`

CSV export of full filtered campaign report, matching the existing transactions export pattern.

## 5. Sign-in & purchase wiring

- `useAuth.tsx` — after successful sign-in, call `attachUserOnSignIn()`
- `useWalletSync.tsx` — after wallet bound to profile, call `trackEvent('wallet_connected')` and re-attach
- Onramp components (`CoinbaseOnrampWidget`, `CoinbaseHeadlessOnramp`, `StripeOnramp`, `MoonPayOnramp`, `CoinflowCheckout`) — call `trackOnrampStart(provider)` on launch
- Webhooks attribute server-side; client also fires `purchase_completed`/`purchase_failed` events when it observes terminal status (best-effort, server is source of truth)

## 6. Security

- All client writes go through edge functions with strict body validation (zod) and CORS from `_shared/auth.ts`
- No raw IPs stored; only country header
- `tracking_code` is a random 8-char base62 — no PII
- RLS denies all client SELECT on tracking tables; admins read via `is_admin()`
- `validate_tracking_code()` is the only SECURITY DEFINER read path exposed to anon

## Technical Details

```text
Files created
├── supabase/migrations/<ts>_inbound_tracking.sql
├── supabase/functions/tracking-validate/index.ts
├── supabase/functions/tracking-session/index.ts
├── supabase/functions/tracking-event/index.ts
├── supabase/functions/tracking-attach-user/index.ts
├── supabase/functions/tracking-attach-purchase/index.ts
├── src/lib/tracking.ts
├── src/hooks/useInboundTracking.tsx
├── src/components/admin/InboundTracking.tsx
└── src/components/admin/InboundCampaignDetail.tsx

Files changed
├── src/App.tsx                         (mount tracking init)
├── src/pages/Admin.tsx                 (8th tab)
├── src/hooks/useAuth.tsx               (attach on sign-in)
├── src/hooks/useWalletSync.tsx         (attach on wallet bind)
├── src/components/CoinbaseOnrampWidget.tsx
├── src/components/CoinbaseHeadlessOnramp.tsx
├── src/components/StripeOnramp.tsx
├── src/components/MoonPayOnramp.tsx
├── src/components/CoinflowCheckout.tsx
├── supabase/functions/coinbase-webhook/index.ts   (write attribution)
└── supabase/functions/stripe-webhook/index.ts     (write attribution)

New tables: inbound_tracking_campaigns, inbound_tracking_sessions,
            inbound_tracking_events, inbound_tracking_attributions
New view:   inbound_campaign_stats (admin-only)
New SECURITY DEFINER fn: public.validate_tracking_code(text)
```

## How to test

1. Sign in as admin → Admin → Inbound Tracking → create campaign for `/express` named "Test"
2. Copy URL → open in incognito → confirm `landing` event + session row appear
3. Navigate around → confirm `page_view` + heartbeat events; `last_seen_at` updates
4. Sign in via Particle → confirm `signed_in_user_id` + `wallet_address` populate; `sign_in` event fires
5. Run a Stripe sandbox purchase → confirm `inbound_tracking_attributions` row created with the transaction id and the campaign aggregates update
6. Archive campaign → confirm new `?ref=` visits return invalid and skip session creation
7. Open existing Transactions tab → confirm unchanged

Approve to proceed and I'll create the migration first (for your approval), then implement the rest.