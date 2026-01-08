-- Drop existing SELECT policy on transaction_audit_log
DROP POLICY IF EXISTS "Admins can view transaction audit logs" ON public.transaction_audit_log;

-- Create PERMISSIVE policy restricted to authenticated users who are admins
CREATE POLICY "Admins can view transaction audit logs"
ON public.transaction_audit_log
FOR SELECT
TO authenticated
USING (public.is_admin(auth.uid()));