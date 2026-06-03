
-- Mirror table for MoonPay headless onramp transactions (parallels coinbase_transactions)
CREATE TABLE public.moonpay_transactions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  transaction_id text NOT NULL,
  external_customer_id text,
  partner_user_ref text,
  user_id uuid,
  wallet_address text,
  status text NOT NULL DEFAULT 'unknown',
  fiat_value numeric,
  fiat_currency text,
  crypto_value numeric,
  crypto_currency text,
  asset text,
  network text,
  tx_created_at timestamp with time zone,
  tx_updated_at timestamp with time zone,
  last_synced_at timestamp with time zone NOT NULL DEFAULT now(),
  payload jsonb,
  source text,
  failure_reason_code text,
  failure_reason_raw text,
  intermediate_statuses jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT moonpay_transactions_transaction_id_key UNIQUE (transaction_id)
);

CREATE INDEX idx_moonpay_tx_user_id    ON public.moonpay_transactions (user_id);
CREATE INDEX idx_moonpay_tx_wallet     ON public.moonpay_transactions (wallet_address);
CREATE INDEX idx_moonpay_tx_status     ON public.moonpay_transactions (status);
CREATE INDEX idx_moonpay_tx_created    ON public.moonpay_transactions (tx_created_at DESC);
CREATE INDEX idx_moonpay_tx_partner_ref ON public.moonpay_transactions (partner_user_ref);

-- GRANTs: authenticated can SELECT their own rows (via RLS); service_role writes via edge functions
GRANT SELECT ON public.moonpay_transactions TO authenticated;
GRANT ALL    ON public.moonpay_transactions TO service_role;

ALTER TABLE public.moonpay_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own moonpay transactions"
  ON public.moonpay_transactions
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins view all moonpay transactions"
  ON public.moonpay_transactions
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Block client deletes on moonpay_transactions"
  ON public.moonpay_transactions
  FOR DELETE TO authenticated
  USING (false);

CREATE POLICY "Block client inserts on moonpay_transactions"
  ON public.moonpay_transactions
  FOR INSERT TO authenticated
  WITH CHECK (false);

CREATE POLICY "Block client updates on moonpay_transactions"
  ON public.moonpay_transactions
  FOR UPDATE TO authenticated
  USING (false) WITH CHECK (false);

CREATE TRIGGER update_moonpay_transactions_updated_at
  BEFORE UPDATE ON public.moonpay_transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
