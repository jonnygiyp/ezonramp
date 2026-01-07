-- Drop existing problematic policies on transaction_audit_log
DROP POLICY IF EXISTS "Admins can view transaction audit logs" ON public.transaction_audit_log;
DROP POLICY IF EXISTS "Deny anonymous access" ON public.transaction_audit_log;
DROP POLICY IF EXISTS "Service role can insert audit logs" ON public.transaction_audit_log;

-- Create proper PERMISSIVE policy for admin SELECT access
-- Service role automatically bypasses RLS, so no INSERT policy is needed
CREATE POLICY "Admins can view transaction audit logs"
ON public.transaction_audit_log
FOR SELECT
TO authenticated
USING (public.is_admin(auth.uid()));

-- Block all non-admin access (no other permissive policies exist, so this is implicit)
-- But we add an explicit deny for extra safety on INSERT/UPDATE/DELETE for regular users
CREATE POLICY "Block all client inserts"
ON public.transaction_audit_log
FOR INSERT
TO authenticated
WITH CHECK (false);

CREATE POLICY "Block all client updates"
ON public.transaction_audit_log
FOR UPDATE
TO authenticated
USING (false);

CREATE POLICY "Block all client deletes"
ON public.transaction_audit_log
FOR DELETE
TO authenticated
USING (false);