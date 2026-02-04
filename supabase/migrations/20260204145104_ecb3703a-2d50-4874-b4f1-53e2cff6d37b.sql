-- Add published column to site_content table
ALTER TABLE public.site_content 
ADD COLUMN IF NOT EXISTS published boolean NOT NULL DEFAULT true;

-- Drop existing restrictive policies that block public access
DROP POLICY IF EXISTS "Only admins can view site content directly" ON public.site_content;

-- Create PERMISSIVE SELECT policy for public read access (published content only)
CREATE POLICY "Public can read published site content"
ON public.site_content
FOR SELECT
USING (published = true);

-- Keep the existing admin management policy for INSERT/UPDATE/DELETE
-- The "Admins can manage site content" policy already exists and handles ALL operations for admins
-- But we need to ensure admins can also SELECT unpublished content
DROP POLICY IF EXISTS "Admins can manage site content" ON public.site_content;

-- Admin can do everything (including view unpublished)
CREATE POLICY "Admins can manage all site content"
ON public.site_content
FOR ALL
USING (is_admin(auth.uid()))
WITH CHECK (is_admin(auth.uid()));