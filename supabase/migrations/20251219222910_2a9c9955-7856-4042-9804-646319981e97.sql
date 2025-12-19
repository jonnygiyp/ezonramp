-- Update the handle_new_user function to remove first-user-becomes-admin logic
-- Admin role will only be granted through valid admin invites
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  invite_record RECORD;
BEGIN
  -- Create profile
  INSERT INTO public.profiles (id)
  VALUES (new.id);
  
  -- Check if user was invited as admin
  SELECT * INTO invite_record 
  FROM public.admin_invites 
  WHERE email = new.email 
    AND used_at IS NULL 
    AND expires_at > now();
  
  IF FOUND THEN
    -- Grant admin role via valid invite
    INSERT INTO public.user_roles (user_id, role) VALUES (new.id, 'admin');
    -- Mark invite as used
    UPDATE public.admin_invites SET used_at = now() WHERE id = invite_record.id;
  ELSE
    -- Grant default user role
    INSERT INTO public.user_roles (user_id, role) VALUES (new.id, 'user');
  END IF;
  
  RETURN new;
END;
$function$;