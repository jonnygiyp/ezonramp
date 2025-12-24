-- Fix: onramp_providers config exposure
-- Create a security definer function that returns only safe fields for public access

CREATE OR REPLACE FUNCTION public.get_public_onramp_providers()
RETURNS TABLE (
  id uuid,
  name text,
  display_name text,
  enabled boolean,
  sort_order integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, name, display_name, enabled, sort_order
  FROM public.onramp_providers
  WHERE enabled = true
  ORDER BY sort_order ASC;
$$;

-- Drop the overly permissive SELECT policy
DROP POLICY IF EXISTS "Anyone can view enabled providers" ON public.onramp_providers;

-- Create new restrictive policy - only admins can directly access the table
CREATE POLICY "Only admins can view providers directly"
ON public.onramp_providers
FOR SELECT
USING (is_admin(auth.uid()));