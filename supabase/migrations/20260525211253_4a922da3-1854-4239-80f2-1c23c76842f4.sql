
ALTER TABLE public.purchase_attempts
  ADD COLUMN IF NOT EXISTS lifecycle_state text,
  ADD COLUMN IF NOT EXISTS failure_reason_code text,
  ADD COLUMN IF NOT EXISTS failure_reason_raw text,
  ADD COLUMN IF NOT EXISTS status_source text,
  ADD COLUMN IF NOT EXISTS popup_opened_at timestamptz,
  ADD COLUMN IF NOT EXISTS popup_closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS webhook_received_at timestamptz,
  ADD COLUMN IF NOT EXISTS failure_detected_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_sdk_callback_at timestamptz,
  ADD COLUMN IF NOT EXISTS visibility_events jsonb;

ALTER TABLE public.coinbase_transactions
  ADD COLUMN IF NOT EXISTS failure_reason_code text,
  ADD COLUMN IF NOT EXISTS failure_reason_raw text,
  ADD COLUMN IF NOT EXISTS intermediate_statuses jsonb;
