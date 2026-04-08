-- Fix: Remove purchase_attempts from realtime publication to prevent data leakage
ALTER PUBLICATION supabase_realtime DROP TABLE public.purchase_attempts;