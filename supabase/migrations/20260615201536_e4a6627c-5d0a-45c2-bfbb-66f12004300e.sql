ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS particle_uuid TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_particle_uuid_key ON public.profiles(particle_uuid) WHERE particle_uuid IS NOT NULL;