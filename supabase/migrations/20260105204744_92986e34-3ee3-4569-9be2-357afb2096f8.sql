-- Create a security definer function to serve site content without exposing admin user IDs
CREATE OR REPLACE FUNCTION public.get_public_site_content()
RETURNS TABLE(
  id uuid,
  section text,
  content jsonb,
  updated_at timestamp with time zone
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, section, content, updated_at
  FROM public.site_content;
$$;

-- Grant execute permission to authenticated and anonymous users
GRANT EXECUTE ON FUNCTION public.get_public_site_content() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_site_content() TO anon;