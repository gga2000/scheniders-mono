-- Merging and un-merging orders needs the orders.edit permission.
--
-- merge_orders_atomic and unmerge_orders_atomic (SECURITY DEFINER) only check
-- that the caller is an active member of the tenant, so a viewer could merge
-- two orders (summing their money and archiving one) or undo a merge. Both
-- write order_merge_log inside their transaction (merge inserts the snapshot,
-- unmerge stamps undone_at), so one guard there covers both without
-- re-declaring the functions: a signed-in caller without orders.edit makes the
-- whole merge or un-merge roll back. Service-role and cron calls
-- (auth.uid() IS NULL) are unchanged.

CREATE OR REPLACE FUNCTION public.order_merge_log_require_edit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
    IF auth.uid() IS NOT NULL
       AND NOT public.has_tenant_permission(NEW.tenant_id, 'orders.edit') THEN
        RAISE EXCEPTION 'You do not have permission to merge orders' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.order_merge_log_require_edit() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE TRIGGER trg_order_merge_log_require_edit
BEFORE INSERT OR UPDATE ON public.order_merge_log
FOR EACH ROW
EXECUTE FUNCTION public.order_merge_log_require_edit();
