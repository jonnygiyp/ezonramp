-- First, ensure RLS is enabled on transaction_audit_log
ALTER TABLE public.transaction_audit_log ENABLE ROW LEVEL SECURITY;

-- Drop the existing restrictive SELECT policy and recreate as permissive admin-only
DROP POLICY IF EXISTS "Admins can view transaction audit logs" ON public.transaction_audit_log;

-- Create a permissive policy that only allows admins to SELECT
CREATE POLICY "Admins can view transaction audit logs" 
ON public.transaction_audit_log 
FOR SELECT 
TO authenticated
USING (public.is_admin(auth.uid()));

-- Ensure no public access - add a restrictive policy to explicitly deny anonymous access
DROP POLICY IF EXISTS "Deny anonymous access" ON public.transaction_audit_log;
CREATE POLICY "Deny anonymous access"
ON public.transaction_audit_log
AS RESTRICTIVE
FOR ALL
TO anon
USING (false);