-- Staff console: the team's tags on a shop (VIP, At Risk, ...) get a place to
-- be saved. The console's tags wrote to tenants.tags, a column that never
-- existed, so every save failed.
--
-- Tags are the staff's own working labels. They live in their own table, not
-- on tenants, because a merchant reads their own tenants row: a label like
-- "At Risk" must never reach the shop. Only the service role (the console's
-- server) reads or writes this table.

CREATE TABLE IF NOT EXISTS public.staff_shop_tags (
    tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
    tags text[] NOT NULL DEFAULT '{}'
        CHECK (cardinality(tags) <= 20 AND array_position(tags, NULL) IS NULL),
    updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.staff_shop_tags IS
    'Staff tags on a shop, one row per shop. Staff only: merchants must never read it, so no browser role has access.';

ALTER TABLE public.staff_shop_tags ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.staff_shop_tags FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_shop_tags TO service_role;
