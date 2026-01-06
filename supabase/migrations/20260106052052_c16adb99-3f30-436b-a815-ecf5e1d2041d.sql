-- Add restrictive INSERT policy to profiles table
-- Profile creation should only happen through the handle_new_user trigger (SECURITY DEFINER)
-- This policy explicitly denies all direct INSERT attempts from users
CREATE POLICY "Profiles created only via trigger"
ON public.profiles
AS RESTRICTIVE
FOR INSERT
TO authenticated, anon
WITH CHECK (false);