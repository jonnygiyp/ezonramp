-- Users can update their own profile
CREATE POLICY "Users can update own profile"
ON public.profiles
FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- Prevent manual profile deletion (profiles are deleted via cascade from auth.users)
CREATE POLICY "Prevent manual profile deletion"
ON public.profiles
FOR DELETE
USING (false);