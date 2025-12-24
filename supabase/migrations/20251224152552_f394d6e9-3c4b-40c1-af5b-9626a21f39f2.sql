-- Drop the validate_invite_token function
DROP FUNCTION IF EXISTS public.validate_invite_token(text);

-- Update handle_new_user trigger to remove invite logic
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Create profile
  INSERT INTO public.profiles (id)
  VALUES (new.id);
  
  -- Grant default user role
  INSERT INTO public.user_roles (user_id, role) VALUES (new.id, 'user');
  
  RETURN new;
END;
$$;

-- Drop the admin_invites table (this will also drop its RLS policies)
DROP TABLE IF EXISTS public.admin_invites;