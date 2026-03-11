
-- Create purchase_attempts table for tracking Coinbase headless onramp purchase lifecycle
CREATE TABLE public.purchase_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  wallet_address text NOT NULL,
  provider text NOT NULL DEFAULT 'coinbase',
  amount numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  crypto_currency text NOT NULL DEFAULT 'USDC',
  network text NOT NULL DEFAULT 'solana',
  partner_user_ref text NOT NULL UNIQUE,
  coinbase_transaction_id text,
  status text NOT NULL DEFAULT 'idle',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.purchase_attempts ENABLE ROW LEVEL SECURITY;

-- Users can view their own purchase attempts
CREATE POLICY "Users can view own purchase attempts"
ON public.purchase_attempts
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Users can insert their own purchase attempts
CREATE POLICY "Users can insert own purchase attempts"
ON public.purchase_attempts
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Users can update their own purchase attempts (for UI state tracking)
CREATE POLICY "Users can update own purchase attempts"
ON public.purchase_attempts
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Admins can view all purchase attempts
CREATE POLICY "Admins can view all purchase attempts"
ON public.purchase_attempts
FOR SELECT
TO authenticated
USING (is_admin(auth.uid()));

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.update_purchase_attempts_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_purchase_attempts_updated_at
  BEFORE UPDATE ON public.purchase_attempts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_purchase_attempts_updated_at();

-- Enable realtime for live status updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.purchase_attempts;
