
CREATE TABLE public.coinbase_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  transaction_id TEXT NOT NULL UNIQUE,
  partner_user_ref TEXT,
  user_id UUID,
  wallet_address TEXT,
  status TEXT NOT NULL DEFAULT 'unknown',
  fiat_value NUMERIC,
  fiat_currency TEXT,
  crypto_value NUMERIC,
  crypto_currency TEXT,
  asset TEXT,
  network TEXT,
  tx_created_at TIMESTAMPTZ,
  tx_updated_at TIMESTAMPTZ,
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_coinbase_tx_partner_ref ON public.coinbase_transactions (partner_user_ref);
CREATE INDEX idx_coinbase_tx_user_id ON public.coinbase_transactions (user_id);
CREATE INDEX idx_coinbase_tx_wallet ON public.coinbase_transactions (wallet_address);
CREATE INDEX idx_coinbase_tx_created ON public.coinbase_transactions (tx_created_at DESC);
CREATE INDEX idx_coinbase_tx_status ON public.coinbase_transactions (status);

ALTER TABLE public.coinbase_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on coinbase_transactions"
  ON public.coinbase_transactions
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Admins can view coinbase_transactions"
  ON public.coinbase_transactions
  FOR SELECT
  TO authenticated
  USING (is_admin(auth.uid()));

CREATE POLICY "Block client inserts on coinbase_transactions"
  ON public.coinbase_transactions
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

CREATE POLICY "Block client updates on coinbase_transactions"
  ON public.coinbase_transactions
  FOR UPDATE
  TO authenticated
  USING (false);

CREATE POLICY "Block client deletes on coinbase_transactions"
  ON public.coinbase_transactions
  FOR DELETE
  TO authenticated
  USING (false);

CREATE TRIGGER trg_coinbase_tx_updated_at
  BEFORE UPDATE ON public.coinbase_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_transaction_audit_updated_at();
