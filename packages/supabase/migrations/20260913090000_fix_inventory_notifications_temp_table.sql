-- Fix: every order status change fails with 42P07 "relation _crossed already exists".
--
-- `log_inventory_notifications` (20260912100000) built a TEMP TABLE named
-- `_crossed` on each firing. The table is `ON COMMIT DROP`, so it survives for
-- the whole transaction — and one order update produces TWO UPDATE statements on
-- `products`: `inv_order_changed` calls `inv_apply` once to release the old
-- status' reservation and once to take the new one. The second statement-level
-- firing then tries to create a table that already exists and aborts the whole
-- transaction, so the order update itself fails. The same happens on any
-- multi-statement write touching products (a bulk status move, a refund, a
-- scheduled-date change that also rewrites items).
--
-- The transition set never needed to outlive the statement, so it becomes a CTE:
-- no temp table, no cross-statement state, and no per-statement catalog churn.
CREATE OR REPLACE FUNCTION public.log_inventory_notifications()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_emitted INTEGER;
BEGIN
    -- Only the transition matters. Staying low is not news; going low is.
    WITH crossed AS (
        SELECT n.id, n.tenant_id, n.name, n.stock_quantity,
               COALESCE(n.low_stock_threshold, 0) AS threshold,
               (n.stock_quantity <= 0) AS is_out
        FROM new_rows n
        JOIN old_rows o ON o.id = n.id
        WHERE n.tenant_id IS NOT NULL
          AND n.stock_quantity IS NOT NULL
          AND o.stock_quantity IS DISTINCT FROM n.stock_quantity
          AND (
                (n.stock_quantity <= 0 AND o.stock_quantity > 0)
             OR (COALESCE(n.low_stock_threshold, 0) > 0
                 AND n.stock_quantity > 0
                 AND n.stock_quantity <= n.low_stock_threshold
                 AND o.stock_quantity > COALESCE(o.low_stock_threshold, 0))
          )
    ),
    tally AS (SELECT count(*) AS n FROM crossed),
    -- A stock take or bulk import crosses many products at once; one summary
    -- beats a flood of individual notifications.
    bulk AS (
        INSERT INTO public.notifications (
            tenant_id, type, category, audience, actor_name,
            entity_type, entity_id, entity_label, payload, priority, group_key
        )
        SELECT c.tenant_id, 'inventory.bulk_low', 'inventory', 'tenant', 'Automation',
               NULL, NULL, NULL,
               jsonb_build_object('count', count(*),
                                  'out_of_stock', count(*) FILTER (WHERE c.is_out)),
               'high', 'inventory_bulk:' || txid_current()::text
        FROM crossed c
        WHERE (SELECT n FROM tally) > 5
        GROUP BY c.tenant_id
        RETURNING 1
    ),
    individual AS (
        INSERT INTO public.notifications (
            tenant_id, type, category, audience, actor_name,
            entity_type, entity_id, entity_label, payload, priority, group_key
        )
        SELECT c.tenant_id,
               CASE WHEN c.is_out THEN 'inventory.out_of_stock' ELSE 'inventory.low_stock' END,
               'inventory', 'tenant', 'Automation',
               'product', c.id, c.name,
               jsonb_build_object('stock', c.stock_quantity, 'threshold', c.threshold),
               CASE WHEN c.is_out THEN 'urgent' ELSE 'high' END,
               'product:' || c.id::text
        FROM crossed c
        WHERE (SELECT n FROM tally) <= 5
        RETURNING 1
    )
    SELECT count(*) INTO v_emitted
    FROM (SELECT 1 FROM bulk UNION ALL SELECT 1 FROM individual) emitted;

    RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.log_inventory_notifications() FROM PUBLIC, anon, authenticated;
