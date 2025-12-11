-- Update the handle_new_user function to make the first user an admin automatically
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  invite_record RECORD;
  admin_count INTEGER;
BEGIN
  -- Create profile
  INSERT INTO public.profiles (id, email)
  VALUES (new.id, new.email);
  
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