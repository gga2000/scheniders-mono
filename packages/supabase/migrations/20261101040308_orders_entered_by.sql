ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS entered_by uuid
  REFERENCES public.user_profiles(id) ON DELETE SET NULL;
GRANT SELECT (entered_by) ON public.orders TO authenticated;