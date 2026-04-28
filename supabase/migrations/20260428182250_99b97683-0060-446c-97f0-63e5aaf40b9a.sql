ALTER PUBLICATION supabase_realtime ADD TABLE public.purchase_attempts;
ALTER TABLE public.purchase_attempts REPLICA IDENTITY FULL;