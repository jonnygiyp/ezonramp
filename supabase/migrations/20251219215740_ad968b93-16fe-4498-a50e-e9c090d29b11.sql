-- Remove email column from profiles table to prevent email harvesting
-- Emails are already stored securely in auth.users and should not be duplicated

-- First update the handle_new_user function to not insert email
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  invite_record RECORD;
  admin_count INTEGER;
BEGIN
  -- Create profile (without email - it's stored in auth.users)
  INSERT INTO public.profiles (id)
  VALUES (new.id);
  
  -- Check if user was invited as admin
  SELECT * INTO invite_record 
  FROM public.admin_invites 
  WHERE email = new.email 
    AND used_at IS NULL 
    AND expires_at > now();
  
  IF FOUND THEN
    -- Grant admin role
    INSERT INTO public.user_roles (user_id, role) VALUES (new.id, 'admin');
    -- Mark invite as used
    UPDATE public.admin_invites SET used_at = now() WHERE id = invite_record.id;
  ELSE
    -- Check if there are any existing admins
    SELECT COUNT(*) INTO admin_count FROM public.user_roles WHERE role = 'admin';
    
    IF admin_count = 0 THEN
      -- First user becomes admin automatically
      INSERT INTO public.user_roles (user_id, role) VALUES (new.id, 'admin');
    ELSE
      -- Grant default user role
      INSERT INTO public.user_roles (user_id, role) VALUES (new.id, 'user');
    END IF;
  END IF;
  
  RETURN new;
END;
$$;

-- Now remove the email column from profiles
ALTER TABLE public.profiles DROP COLUMN IF EXISTS email;