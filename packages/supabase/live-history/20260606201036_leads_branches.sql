ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS branches JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.leads.branches IS 'Optional additional store branches: [{name, city, address, phones:[{title,number}]}].';;
