
-- 1. transaction_audit_log: restrict wallet lookup to authenticated role only
DROP POLICY IF EXISTS "Users can view own transactions by wallet" ON public.transaction_audit_log;
CREATE POLICY "Users can view own transactions by wallet"
ON public.transaction_audit_log
FOR SELECT
TO authenticated
USING (
  wallet_address IN (
    SELECT profiles.wallet_address
    FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.wallet_address IS NOT NULL
  )
);

-- 2. purchase_attempts: attach field-protection trigger to prevent tampering
DROP TRIGGER IF EXISTS protect_purchase_attempt_fields_trg ON public.purchase_attempts;
CREATE TRIGGER protect_purchase_attempt_fields_trg
BEFORE UPDATE ON public.purchase_attempts
FOR EACH ROW EXECUTE FUNCTION public.protect_purchase_attempt_fields();

-- 3. Revoke EXECUTE on the seed-admin trigger function from public roles
REVOKE EXECUTE ON FUNCTION public.grant_admin_to_seed_emails() FROM PUBLIC, anon, authenticated;
