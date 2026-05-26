-- 1) Remove purchase_attempts from public Realtime publication.
-- The table has user-scoped RLS, but client subscriptions still expose
-- broadcast topics; polling already exists in the client as a fallback.
ALTER PUBLICATION supabase_realtime DROP TABLE public.purchase_attempts;

-- 2) Prevent authenticated users from tampering with server-managed
-- attribution/financial fields on their own purchase_attempts. Lifecycle
-- diagnostic fields (status, lifecycle_state, popup_*, etc.) remain
-- client-writable because the UI legitimately reports them.
CREATE OR REPLACE FUNCTION public.protect_purchase_attempt_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Service role and admin bypass.
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Immutable identity / attribution / financial fields.
  NEW.id := OLD.id;
  NEW.user_id := OLD.user_id;
  NEW.partner_user_ref := OLD.partner_user_ref;
  NEW.provider := OLD.provider;
  NEW.wallet_address := OLD.wallet_address;
  NEW.amount := OLD.amount;
  NEW.currency := OLD.currency;
  NEW.crypto_currency := OLD.crypto_currency;
  NEW.network := OLD.network;
  NEW.source := OLD.source;
  NEW.created_at := OLD.created_at;

  -- coinbase_transaction_id is set by webhook / edge function only.
  -- Allow client to set it once (NULL -> value) but never overwrite.
  IF OLD.coinbase_transaction_id IS NOT NULL THEN
    NEW.coinbase_transaction_id := OLD.coinbase_transaction_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_purchase_attempt_fields_trg ON public.purchase_attempts;
CREATE TRIGGER protect_purchase_attempt_fields_trg
BEFORE UPDATE ON public.purchase_attempts
FOR EACH ROW
EXECUTE FUNCTION public.protect_purchase_attempt_fields();

-- 3) Revoke EXECUTE on internal SECURITY DEFINER functions from public roles.
-- They are called by RLS, triggers, or service-role edge functions only.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_transaction_audit_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_purchase_attempts_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.protect_purchase_attempt_fields() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_tracking_code(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM PUBLIC, anon, authenticated;

-- get_public_site_content and get_public_onramp_providers are intentionally
-- callable by anon/authenticated clients and remain executable.