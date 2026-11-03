-- Prime link, phase 1 screens: the Prime branch a tenant's parcels go
-- through (e.g. «فرع الكوت»), shown on the order cards' Prime track and on
-- the dispatch desk. Set by the platform operator with the rest of the
-- connection; null shows a generic "Prime branch". RLS is unchanged: the
-- table stays service-role only (no browser role reads or writes it).

ALTER TABLE public.prime_connections
    ADD COLUMN IF NOT EXISTS branch_name TEXT
        CHECK (branch_name IS NULL OR length(btrim(branch_name)) BETWEEN 1 AND 60);

COMMENT ON COLUMN public.prime_connections.branch_name IS 'Prime branch the tenant''s parcels go through, as staff call it (e.g. فرع الكوت); null shows a generic label.';
