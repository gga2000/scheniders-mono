-- Store Builder V2: Add draft column for publish/draft workflow
-- The store_config_draft column holds pending changes that haven't been published yet.
-- NULL = no unpublished draft; non-null = pending changes.
-- The storefront always reads from store_config (published state).

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS store_config_draft JSONB DEFAULT NULL;
