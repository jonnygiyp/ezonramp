-- Add explicit policy - only service role can access (service role bypasses RLS anyway)
-- This policy allows authenticated service role operations while blocking regular users
CREATE POLICY "Service role only" ON public.transaction_audit_log
FOR ALL USING (false);