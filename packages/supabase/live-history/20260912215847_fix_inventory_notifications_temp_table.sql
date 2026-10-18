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

REVOKE ALL ON FUNCTION public.log_inventory_notifications() FROM PUBLIC, anon, authenticated;;
