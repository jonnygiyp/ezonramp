-- Drop the existing overly restrictive policy
DROP POLICY IF EXISTS "Service role only" ON public.transaction_audit_log;

-- Create policy allowing admins to view audit logs for monitoring
CREATE POLICY "Admins can view transaction audit logs"
ON public.transaction_audit_log
FOR SELECT
USING (public.is_admin(auth.uid()));

-- Create policy for service role inserts (edge functions use service role which bypasses RLS, 
-- but this documents intent and provides defense in depth)
CREATE POLICY "Service role can insert audit logs"
ON public.transaction_audit_log
FOR INSERT
WITH CHECK (false);  -- Only service role (which bypasses RLS) can insert