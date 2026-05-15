DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inbound_tracking_events_campaign_id_fkey') THEN
    ALTER TABLE public.inbound_tracking_events
      ADD CONSTRAINT inbound_tracking_events_campaign_id_fkey
      FOREIGN KEY (campaign_id) REFERENCES public.inbound_tracking_campaigns(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inbound_tracking_events_session_id_fkey') THEN
    ALTER TABLE public.inbound_tracking_events
      ADD CONSTRAINT inbound_tracking_events_session_id_fkey
      FOREIGN KEY (session_id) REFERENCES public.inbound_tracking_sessions(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inbound_tracking_attributions_campaign_id_fkey') THEN
    ALTER TABLE public.inbound_tracking_attributions
      ADD CONSTRAINT inbound_tracking_attributions_campaign_id_fkey
      FOREIGN KEY (campaign_id) REFERENCES public.inbound_tracking_campaigns(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inbound_tracking_attributions_session_id_fkey') THEN
    ALTER TABLE public.inbound_tracking_attributions
      ADD CONSTRAINT inbound_tracking_attributions_session_id_fkey
      FOREIGN KEY (session_id) REFERENCES public.inbound_tracking_sessions(id) ON DELETE SET NULL;
  END IF;
END $$;

DROP POLICY IF EXISTS "Admins can delete archived campaigns" ON public.inbound_tracking_campaigns;
CREATE POLICY "Admins can delete archived campaigns"
ON public.inbound_tracking_campaigns
FOR DELETE
TO authenticated
USING (is_admin(auth.uid()) AND is_active = false);