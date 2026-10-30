-- Customers R4-04: a tag and its assignments always belong to one store.
-- tenant_id is required (filled from the active store when a writer leaves it
-- out), and an assignment can only point at a tag of its own store. Both
-- tables are empty today, so nothing needs backfilling.

ALTER TABLE public.customer_tags
    ALTER COLUMN tenant_id SET DEFAULT public.require_current_tenant(),
    ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE public.customer_tag_assignments
    ALTER COLUMN tenant_id SET DEFAULT public.require_current_tenant(),
    ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE public.customer_tags
    ADD CONSTRAINT customer_tags_tenant_id_id_key UNIQUE (tenant_id, id);

ALTER TABLE public.customer_tag_assignments
    ADD CONSTRAINT customer_tag_assignments_tag_same_store_fkey
    FOREIGN KEY (tenant_id, tag_id) REFERENCES public.customer_tags (tenant_id, id) ON DELETE CASCADE;