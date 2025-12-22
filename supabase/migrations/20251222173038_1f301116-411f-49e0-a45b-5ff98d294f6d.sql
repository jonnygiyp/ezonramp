-- Create a security definer function to validate invite tokens
-- This allows unauthenticated users to validate their token without seeing all invites
CREATE OR REPLACE FUNCTION public.validate_invite_token(invite_token text)
RETURNS TABLE (email text, is_valid boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    ai.email,
    (ai.expires_at > now() AND ai.used_at IS NULL) as is_valid
  FROM public.admin_invites ai
  WHERE ai.token = invite_token
  LIMIT 1
$$;

-- Grant execute permission to anonymous and authenticated users
GRANT EXECUTE ON FUNCTION public.validate_invite_token(text) TO anon;
GRANT EXECUTE ON FUNCTION public.validate_invite_token(text) TO authenticated;

-- Drop any permissive SELECT policies that might allow public access
-- The existing "Admins can manage invites" is RESTRICTIVE (ALL command)
-- We need to add a PERMISSIVE SELECT policy for admins only
CREATE POLICY "Admins can view invites"
ON public.admin_invites
FOR SELECT
USING (is_admin(auth.uid()));