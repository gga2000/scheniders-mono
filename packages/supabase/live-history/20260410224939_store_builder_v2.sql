ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS store_config_draft JSONB DEFAULT NULL;;
