-- A soft-deleted order no longer holds stock.
--
-- Orders are deleted by setting deleted_at (app/api/orders/delete). The
-- inventory trigger only looked at status/items/is_return, so a deleted
-- confirmed order kept its units reserved forever: on 2026-11-01 five deleted
-- confirmed orders held 5 reserved units between them, lowering "available"
-- and the Stock today numbers. Restoring an order (deleted_at back to NULL)
-- must take the stock again.
--
-- 1. inv_order_changed(): an order counts for inventory only while deleted_at
--    IS NULL. Setting deleted_at reverses its effect; clearing it re-applies
--    it. A hard DELETE of an already soft-deleted row moves nothing.
-- 2. One-time: reverse the effect still held by orders deleted before this
--    trigger, exactly the ones whose ledger shows a net effect, so nothing that
--    was already corrected by hand is moved twice.

CREATE OR REPLACE FUNCTION public.inv_order_changed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_old_counts boolean;
    v_new_counts boolean;
BEGIN
    IF tg_op = 'INSERT' THEN
        IF NOT COALESCE(new.is_return, false) AND new.deleted_at IS NULL THEN
            PERFORM public.inv_apply(new.id, new.items, new.status, 1, new.tenant_id);
        END IF;
        RETURN new;
    ELSIF tg_op = 'DELETE' THEN
        IF NOT COALESCE(old.is_return, false) AND old.deleted_at IS NULL THEN
            PERFORM public.inv_apply(NULL, old.items, old.status, -1, old.tenant_id);
        END IF;
        RETURN old;
    ELSIF tg_op = 'UPDATE' THEN
        IF old.status IS DISTINCT FROM new.status OR old.items IS DISTINCT FROM new.items
           OR old.is_return IS DISTINCT FROM new.is_return
           OR (old.deleted_at IS NULL) IS DISTINCT FROM (new.deleted_at IS NULL) THEN
            v_old_counts := NOT COALESCE(old.is_return, false) AND old.deleted_at IS NULL;
            v_new_counts := NOT COALESCE(new.is_return, false) AND new.deleted_at IS NULL;
            IF v_old_counts THEN
                PERFORM public.inv_apply(old.id, old.items, old.status, -1, old.tenant_id);
            END IF;
            IF v_new_counts THEN
                PERFORM public.inv_apply(new.id, new.items, new.status,  1, new.tenant_id);
            END IF;
        END IF;
        RETURN new;
    END IF;
    RETURN NULL;
END;
$$;

DO $$
DECLARE
    r record;
BEGIN
    FOR r IN
        SELECT o.id, o.items, o.status, o.tenant_id
        FROM public.orders o
        WHERE o.deleted_at IS NOT NULL
          AND NOT COALESCE(o.is_return, false)
          AND EXISTS (
              SELECT 1 FROM public.inventory_ledger l
              WHERE l.order_id = o.id
              GROUP BY l.order_id
              HAVING sum(l.delta_reserved) <> 0 OR sum(l.delta_stock) <> 0 OR sum(l.delta_open_box) <> 0
          )
    LOOP
        PERFORM public.inv_apply(r.id, r.items, r.status, -1, r.tenant_id);
    END LOOP;
END $$;
