-- Drop the existing public SELECT policy that exposes updated_by
DROP POLICY IF EXISTS "Anyone can view site content" ON public.site_content;

-- Create a more restrictive policy - admins can access all columns directly
-- Public users should use the get_public_site_content() RPC function instead
CREATE POLICY "Only admins can view site content directly" 
ON public.site_content 
FOR SELECT 
USING (is_admin(auth.uid()));