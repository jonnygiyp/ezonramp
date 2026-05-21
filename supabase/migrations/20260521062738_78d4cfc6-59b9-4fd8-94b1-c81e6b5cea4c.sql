ALTER TABLE public.purchase_attempts ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE public.stripe_onramp_sessions ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE public.coinbase_transactions ADD COLUMN IF NOT EXISTS source text;
CREATE INDEX IF NOT EXISTS idx_purchase_attempts_partner_ref_source ON public.purchase_attempts(partner_user_ref);