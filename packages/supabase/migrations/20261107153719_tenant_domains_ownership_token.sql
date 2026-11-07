-- A custom domain is verified only when its owner proves control with a TXT
-- record holding this per-row token. A CNAME alone proves "points at
-- Scheniders", not "belongs to this store", so without it one store could
-- claim a domain another store set up DNS for.
ALTER TABLE public.tenant_domains
    ADD COLUMN IF NOT EXISTS verification_token text NOT NULL
    DEFAULT replace(gen_random_uuid()::text, '-', '');

-- The store's own admins read it to copy into DNS. Rows other stores can see
-- are verified ones, whose token is already spent.
GRANT SELECT (verification_token) ON public.tenant_domains TO authenticated;
