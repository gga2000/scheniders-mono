-- Customer tag assignments: one row per (store, normalized phone, tag).
--
-- Bulk "Add tag" upserted on (customer_phone, tag_id), which had no unique
-- constraint, so every call failed with 42P10 and no assignment was ever saved.
-- The phone is stored normalized (7XXXXXXXXX) like blacklist and metadata
-- (the table has no rows yet, so nothing needs rewriting).

CREATE OR REPLACE FUNCTION public.customer_tag_assignments_normalize_phone()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
    NEW.customer_phone := public.normalize_phone_for_search(NEW.customer_phone);
    RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.customer_tag_assignments_normalize_phone() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE TRIGGER trg_customer_tag_assignments_normalize_phone
    BEFORE INSERT OR UPDATE OF customer_phone ON public.customer_tag_assignments
    FOR EACH ROW EXECUTE FUNCTION public.customer_tag_assignments_normalize_phone();

CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_tag_assignments_tenant_phone_tag
    ON public.customer_tag_assignments (tenant_id, customer_phone, tag_id);