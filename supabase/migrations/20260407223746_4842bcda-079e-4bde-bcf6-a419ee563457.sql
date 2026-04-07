
-- Table to track Stripe Crypto Onramp sessions and enable webhook correlation
CREATE TABLE public.stripe_onramp_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_session_id text UNIQUE NOT NULL,
  user_id uuid NOT NULL,
  wallet_address text NOT NULL,
  destination_currency text,
  destination_network text,
  source_amount numeric,
  status text NOT NULL DEFAULT 'created',
  last_stripe_event_id text,
  callback_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Index for fast webhook lookups
CREATE INDEX idx_stripe_onramp_sessions_stripe_id ON public.stripe_onramp_sessions(stripe_session_id);
CREATE INDEX idx_stripe_onramp_sessions_user_id ON public.stripe_onramp_sessions(user_id);

-- Enable RLS
ALTER TABLE public.stripe_onramp_sessions ENABLE ROW LEVEL SECURITY;

-- Service role has full access (for edge functions)
CREATE POLICY "Service role full access"
  ON public.stripe_onramp_sessions
  FOR ALL
  TO public
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Users can read their own sessions
CREATE POLICY "Users can view own sessions"
  ON public.stripe_onramp_sessions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Admins can view all
CREATE POLICY "Admins can view all sessions"
  ON public.stripe_onramp_sessions
  FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

-- Updated_at trigger
CREATE TRIGGER update_stripe_onramp_sessions_updated_at
  BEFORE UPDATE ON public.stripe_onramp_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_transaction_audit_updated_at();

-- Webhook events log for idempotency
CREATE TABLE public.stripe_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id text UNIQUE NOT NULL,
  event_type text NOT NULL,
  livemode boolean NOT NULL DEFAULT false,
  processed_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb
);

ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on webhook events"
  ON public.stripe_webhook_events
  FOR ALL
  TO public
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Admins can view webhook events"
  ON public.stripe_webhook_events
  FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));
