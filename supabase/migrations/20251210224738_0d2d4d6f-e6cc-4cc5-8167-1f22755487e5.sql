-- Create enum for transaction status
CREATE TYPE public.transaction_status AS ENUM ('pending', 'success', 'failed', 'callback_received');

-- Create transaction audit trail table
CREATE TABLE public.transaction_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  wallet_address TEXT NOT NULL,
  amount DECIMAL(18, 2) NOT NULL,
  email_hash TEXT, -- Store hashed email for privacy
  provider TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  crypto_currency TEXT NOT NULL DEFAULT 'USDC',
  status transaction_status NOT NULL DEFAULT 'pending',
  error_message TEXT,
  client_ip_hash TEXT, -- Store hashed IP for privacy
  request_id UUID DEFAULT gen_random_uuid(),
  payment_url TEXT,
  callback_data JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.transaction_audit_log ENABLE ROW LEVEL SECURITY;

-- Only service role can access this table (for edge functions)
-- No public access policies - this is admin/system only

-- Create index for faster queries
CREATE INDEX idx_transaction_audit_created_at ON public.transaction_audit_log(created_at DESC);
CREATE INDEX idx_transaction_audit_status ON public.transaction_audit_log(status);
CREATE INDEX idx_transaction_audit_wallet ON public.transaction_audit_log(wallet_address);

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION public.update_transaction_audit_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_transaction_audit_updated_at
BEFORE UPDATE ON public.transaction_audit_log
FOR EACH ROW
EXECUTE FUNCTION public.update_transaction_audit_updated_at();