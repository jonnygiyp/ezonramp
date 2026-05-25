# Coinbase Global Transaction UX & Lifecycle Overhaul

A focused upgrade to the Coinbase Global (non-US) onramp flow. Stripe and Coinbase US logic stay untouched except for shared types. All existing JWT auth, CORS allowlists, webhook signature verification, and admin RLS remain intact.

## 1. Database (migration)

Extend `purchase_attempts` (backward compatible — all new columns nullable):

- `lifecycle_state` text — canonical frontend state (see §3)
- `failure_reason_code` text — normalized (`card_declined`, `verification_failed`, `abandoned`, `popup_closed`, `timeout`, `unknown`, etc.)
- `failure_reason_raw` text — raw Coinbase reason string
- `status_source` text — `webhook | polling | popup-closed | timeout | abandoned | resumed-session | sdk-callback`
- `popup_opened_at`, `popup_closed_at`, `webhook_received_at`, `failure_detected_at`, `completed_at` timestamptz
- `visibility_events` jsonb (small append-only log capped client-side)
- `last_sdk_callback_at` timestamptz

Extend `coinbase_transactions`:

- `failure_reason_code` text
- `failure_reason_raw` text
- `intermediate_statuses` jsonb — array of `{status, at, source}` entries

No changes to RLS. Service role keeps full access; admins keep read.

## 2. Edge functions

**`coinbase-webhook`**

- Map Coinbase failure reasons → normalized `failure_reason_code` (table below).
- Append every event to `coinbase_transactions.intermediate_statuses` and to `purchase_attempts` (when `partner_user_ref` matches).
- Persist `webhook_received_at`, set `status_source = 'webhook'`, keep raw payload.
- Preserve existing signature verification + 5-minute replay window.

**`coinbase-transactions`** (admin list + polling)

- Return new columns to admin panel.
- When the periodic sync detects a terminal Coinbase state, write `failure_reason_*` and `status_source = 'polling'`.

Failure-reason mapping:

```text
ONRAMP_TRANSACTION_FAILURE_REASON_BUY_FAILED + ERROR_CODE_CARD_DECLINED → card_declined
*_BUY_FAILED + ERROR_CODE_UNSPECIFIED                                   → unknown
*_KYC_FAILED / *_IDENTITY_*                                             → verification_failed
*_USER_CANCELED                                                          → abandoned
*_TIMEOUT                                                                → timeout
fallback                                                                 → unknown
```

## 3. Frontend lifecycle (`CoinbaseHeadlessOnramp.tsx`)

Single state machine `lifecycle_state`:

```text
idle
  → initializing       (creating session)
  → waiting_coinbase   (popup open, pre-auth)
  → waiting_card_auth  (3DS / card challenge)
  → waiting_verification (KYC)
  → processing         (Coinbase confirmed, awaiting webhook)
  → complete
  → incomplete         (popup closed, no terminal webhook in 60–90s)
  → card_declined
  → verification_failed
  → failed
  → unknown_failure
```

Transitions driven by: SDK callbacks, popup `window.closed` poll (1s), `document.visibilitychange`, webhook updates via Supabase Realtime on `purchase_attempts`, and a 5-minute hard timeout (down from 15).

Tracked locally + posted to `purchase_attempts` via existing authenticated edge route:
- `popup_opened_at`, `popup_closed_at`, `last_sdk_callback_at`
- `visibility_events` (capped at 20 entries)
- `status_source` when frontend wins the race

Incomplete detection: if `popup_closed_at` set AND no webhook within 75s AND no terminal SDK callback → `incomplete`, `status_source = 'popup-closed'`.

## 4. UI changes

New `CoinbaseLifecycleBanner` component rendered above the widget:

- Maps each state to label + subcopy (per spec messaging).
- Shows spinner for waiting/processing states, error icon for failures.
- Renders **Start Again** button on `incomplete | card_declined | verification_failed | failed | unknown_failure`.

Start Again handler:
- Clears local state, popup ref, timers, lifecycle store.
- Marks current `purchase_attempts` row `status='abandoned_by_user'` if not already terminal.
- Re-mounts the headless widget via `key` bump.
- Leaves Supabase/Particle session intact.

Styling uses existing semantic tokens (`bg-card`, `text-foreground`, `text-destructive`, etc.) — no hardcoded colors, dark mode preserved, mobile-friendly.

## 5. Admin panel (`CoinbaseTransactions.tsx`)

Add columns: **Failure Reason**, **Status Source**, and a popover with timestamps (created / popup opened / popup closed / webhook / failure / completed). Existing Domain logic untouched.

## 6. Diagnostics

`src/lib/coinbaseDiagnostics.ts` — namespaced `console.debug('[CB-GLOBAL]', …)` for: popup open/close, visibility, sdk callback, webhook arrival (via realtime), timeout, terminal resolution. Never logs raw payloads, only IDs + state.

## 7. Files changed

- migration (purchase_attempts + coinbase_transactions extensions)
- `src/components/CoinbaseHeadlessOnramp.tsx` — state machine, popup/visibility tracking, timeout reduction, Start Again
- `src/components/coinbase/CoinbaseLifecycleBanner.tsx` (new)
- `src/lib/coinbaseLifecycle.ts` (new — types + reason mapping shared with edge)
- `src/lib/coinbaseDiagnostics.ts` (new)
- `src/components/admin/CoinbaseTransactions.tsx` — new columns + timestamps popover
- `supabase/functions/coinbase-webhook/index.ts` — normalized reasons + intermediate statuses
- `supabase/functions/coinbase-transactions/index.ts` — return new columns, write polling source

## 8. Out of scope (unchanged)

Stripe components/functions, Coinbase US widget, Particle auth, RLS policies, CORS allowlist, webhook signature scheme, admin role management.

## 9. Verification

- Build passes.
- Manual: simulate popup-close-early, complete purchase, force decline (test card), webhook delay (block network), refresh mid-flow (state restored from `purchase_attempts`).
- Confirm admin table shows new fields and timestamps for a new transaction.
