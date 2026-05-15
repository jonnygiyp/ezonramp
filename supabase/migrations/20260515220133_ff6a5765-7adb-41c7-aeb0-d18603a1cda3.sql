
-- Shared updated_at helper
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  CREATE TYPE public.inbound_event_type AS ENUM (
    'landing', 'page_view', 'sign_in', 'wallet_connected',
    'onramp_started', 'purchase_completed', 'purchase_failed', 'session_heartbeat'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE public.inbound_tracking_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tracking_code text NOT NULL UNIQUE,
  campaign_name text NOT NULL,
  destination_path text NOT NULL DEFAULT '/',
  notes text,
  created_by uuid,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inbound_destination_path_chk CHECK (destination_path IN ('/', '/express'))
);
CREATE INDEX idx_inbound_campaigns_code ON public.inbound_tracking_campaigns(tracking_code);
ALTER TABLE public.inbound_tracking_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage campaigns" ON public.inbound_tracking_campaigns
  FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "Service role campaigns" ON public.inbound_tracking_campaigns
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE TRIGGER trg_inbound_campaigns_updated BEFORE UPDATE ON public.inbound_tracking_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.inbound_tracking_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tracking_code text NOT NULL,
  campaign_id uuid NOT NULL REFERENCES public.inbound_tracking_campaigns(id) ON DELETE CASCADE,
  landing_path text,
  full_landing_url text,
  referrer_url text,
  user_agent text,
  country text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  session_duration_seconds integer NOT NULL DEFAULT 0,
  signed_in_user_id uuid,
  wallet_address text,
  sign_in_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_inbound_sessions_campaign ON public.inbound_tracking_sessions(campaign_id);
CREATE INDEX idx_inbound_sessions_user ON public.inbound_tracking_sessions(signed_in_user_id);
CREATE INDEX idx_inbound_sessions_wallet ON public.inbound_tracking_sessions(wallet_address);
CREATE INDEX idx_inbound_sessions_first_seen ON public.inbound_tracking_sessions(first_seen_at DESC);
ALTER TABLE public.inbound_tracking_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read sessions" ON public.inbound_tracking_sessions
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Service role sessions" ON public.inbound_tracking_sessions
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE TRIGGER trg_inbound_sessions_updated BEFORE UPDATE ON public.inbound_tracking_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.inbound_tracking_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.inbound_tracking_sessions(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.inbound_tracking_campaigns(id) ON DELETE CASCADE,
  tracking_code text NOT NULL,
  event_type public.inbound_event_type NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_inbound_events_session ON public.inbound_tracking_events(session_id);
CREATE INDEX idx_inbound_events_campaign ON public.inbound_tracking_events(campaign_id);
CREATE INDEX idx_inbound_events_type ON public.inbound_tracking_events(event_type);
ALTER TABLE public.inbound_tracking_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read events" ON public.inbound_tracking_events
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Service role events" ON public.inbound_tracking_events
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE TABLE public.inbound_tracking_attributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES public.inbound_tracking_sessions(id) ON DELETE SET NULL,
  campaign_id uuid NOT NULL REFERENCES public.inbound_tracking_campaigns(id) ON DELETE CASCADE,
  tracking_code text NOT NULL,
  user_id uuid,
  wallet_address text,
  onramp_provider text NOT NULL,
  transaction_id text NOT NULL,
  purchase_status text,
  fiat_amount numeric,
  fiat_currency text,
  crypto_amount numeric,
  crypto_currency text,
  chain text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inbound_attribution_unique UNIQUE (onramp_provider, transaction_id)
);
CREATE INDEX idx_inbound_attr_campaign ON public.inbound_tracking_attributions(campaign_id);
CREATE INDEX idx_inbound_attr_session ON public.inbound_tracking_attributions(session_id);
ALTER TABLE public.inbound_tracking_attributions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read attributions" ON public.inbound_tracking_attributions
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Service role attributions" ON public.inbound_tracking_attributions
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE TRIGGER trg_inbound_attributions_updated BEFORE UPDATE ON public.inbound_tracking_attributions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.validate_tracking_code(_code text)
RETURNS TABLE(campaign_id uuid, destination_path text, is_active boolean)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, destination_path, is_active
  FROM public.inbound_tracking_campaigns
  WHERE tracking_code = _code AND is_active = true
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.validate_tracking_code(text) TO anon, authenticated;

CREATE OR REPLACE VIEW public.inbound_campaign_stats
WITH (security_invoker = on) AS
SELECT
  c.id, c.tracking_code, c.campaign_name, c.destination_path, c.is_active, c.created_at,
  COALESCE(s.visits, 0) AS visits,
  COALESCE(s.sign_ins, 0) AS sign_ins,
  COALESCE(s.wallets, 0) AS wallets,
  COALESCE(a.purchases, 0) AS purchases,
  COALESCE(a.volume, 0) AS volume,
  CASE WHEN COALESCE(s.visits,0) > 0
    THEN ROUND((COALESCE(s.sign_ins,0)::numeric / s.visits) * 100, 2) ELSE 0 END AS sign_in_rate,
  CASE WHEN COALESCE(s.visits,0) > 0
    THEN ROUND((COALESCE(a.purchases,0)::numeric / s.visits) * 100, 2) ELSE 0 END AS purchase_rate
FROM public.inbound_tracking_campaigns c
LEFT JOIN (
  SELECT campaign_id,
    COUNT(*) AS visits,
    COUNT(signed_in_user_id) AS sign_ins,
    COUNT(wallet_address) AS wallets
  FROM public.inbound_tracking_sessions GROUP BY campaign_id
) s ON s.campaign_id = c.id
LEFT JOIN (
  SELECT campaign_id,
    COUNT(*) FILTER (WHERE lower(purchase_status) IN ('completed','success','succeeded')) AS purchases,
    COALESCE(SUM(fiat_amount) FILTER (WHERE lower(purchase_status) IN ('completed','success','succeeded')), 0) AS volume
  FROM public.inbound_tracking_attributions GROUP BY campaign_id
) a ON a.campaign_id = c.id;
