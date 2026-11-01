-- Finances: freeze what an order's goods cost when it is delivered.
--
-- WHY
-- Profit is worked out from the product cost on file *today*. Change a product's
-- cost and every past delivered order silently re-prices: last month's profit
-- moves although nothing about last month changed. orders.product_cost exists
-- for this (admin-only margin column) but has been NULL on every row.
--
-- WHAT THIS CHANGES
--   1. orders.item_unit_costs numeric[]: the unit cost of each item line, in the
--      same order as orders.items. An element is NULL when no cost was on file
--      for that line. Like product_cost it is NOT granted to `authenticated`
--      (the column grant of 20261021090000 is a column list, so a new column is
--      not readable until granted, and this one is deliberately not).
--   2. order_item_unit_costs(tenant, items) and order_items_total_cost(items,
--      costs): the cost lookup and the line total. Internal; execute is revoked
--      from every API role. A line matches its variant, then its product by id,
--      then by SKU when it carries no product id; a cost of 0 counts as unknown,
--      the same rule as lib/finance/item-cost.ts in the app.
--   3. orders_snapshot_item_costs(): BEFORE INSERT OR UPDATE trigger. When an
--      order becomes delivered/completed (or its items change while it is), it
--      stamps item_unit_costs and product_cost (the total, only when every line
--      has a cost). Left alone otherwise, so a later cost edit never moves it.
--      An order that stops being delivered loses the snapshot. Whatever a client
--      sends for either column is ignored, so a member cannot rewrite history
--      through the table grant. Returns/refund rows never carry a cost.
--   4. finance_order_costs(tenant, from): the snapshots for a caller who may see
--      product cost (can_see_product_cost), SECURITY DEFINER, nothing for anyone
--      else. This is how the Finances page reads them.
--   5. Backfill: every delivered/completed order gets its snapshot from the
--      costs on file now (the best available for history; 2931 of 2932 orders
--      were fully costed when measured on 2026-11-01). Run with triggers off so
--      updated_at, version, loyalty, stock and notification triggers do not
--      fire for 3,000 untouched orders.
--
-- WHAT KEEPS WORKING
--   * No column the app reads changes. Orders written before this keep working;
--     the app falls back to the live product cost for any order without a
--     snapshot.
--   * RLS on orders is untouched; the RPC is tenant-scoped by its argument and
--     gated by can_see_product_cost, which checks membership.

BEGIN;

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS item_unit_costs numeric[];

COMMENT ON COLUMN public.orders.item_unit_costs IS
    'Unit cost of each line of orders.items (same order), frozen when the order was delivered. NULL element = no cost on file. Admin-only: not granted to authenticated; read through finance_order_costs().';

-- 2. Cost lookup ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.order_item_unit_costs(p_tenant_id uuid, p_items jsonb)
RETURNS numeric[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
    SELECT COALESCE(array_agg(l.unit ORDER BY l.ord), ARRAY[]::numeric[])
    FROM (
        SELECT it.ord,
               (SELECT COALESCE(NULLIF(v.cost, 0), NULLIF(p.cost, 0))
                  FROM (SELECT 1) one
                  LEFT JOIN public.products p
                         ON p.tenant_id = p_tenant_id
                        AND ((it.item->>'product_id' IS NOT NULL AND p.id::text = it.item->>'product_id')
                          OR (it.item->>'product_id' IS NULL AND it.item->>'sku' IS NOT NULL
                              AND lower(p.sku) = lower(it.item->>'sku')))
                  LEFT JOIN public.product_variants v
                         ON v.tenant_id = p_tenant_id
                        AND v.id::text = it.item->>'variant_id'
                 LIMIT 1) AS unit
        FROM jsonb_array_elements(
                 CASE WHEN jsonb_typeof(p_items) = 'array' THEN p_items ELSE '[]'::jsonb END
             ) WITH ORDINALITY AS it(item, ord)
    ) l;
$function$;

CREATE OR REPLACE FUNCTION public.order_items_total_cost(p_items jsonb, p_unit_costs numeric[])
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $function$
    SELECT CASE WHEN count(*) > 0 AND bool_and(c.unit IS NOT NULL) THEN sum(c.unit * c.qty) END
    FROM (
        SELECT u.unit,
               CASE WHEN it.item->>'quantity' ~ '^[0-9]+(\.[0-9]+)?$' THEN (it.item->>'quantity')::numeric ELSE 0 END AS qty
        FROM jsonb_array_elements(
                 CASE WHEN jsonb_typeof(p_items) = 'array' THEN p_items ELSE '[]'::jsonb END
             ) WITH ORDINALITY AS it(item, ord)
        LEFT JOIN unnest(p_unit_costs) WITH ORDINALITY AS u(unit, ord) ON u.ord = it.ord
    ) c;
$function$;

REVOKE ALL ON FUNCTION public.order_item_unit_costs(uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.order_items_total_cost(jsonb, numeric[]) FROM PUBLIC, anon, authenticated;

-- 3. Snapshot trigger -----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.orders_snapshot_item_costs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
    v_final     boolean := NEW.status::text IN ('delivered', 'completed') AND NOT COALESCE(NEW.is_return, false);
    v_was_final boolean := false;
BEGIN
    IF TG_OP = 'UPDATE' THEN
        v_was_final := OLD.status::text IN ('delivered', 'completed') AND NOT COALESCE(OLD.is_return, false);
        -- The snapshot is the database's to write; ignore what the client sent.
        NEW.product_cost := OLD.product_cost;
        NEW.item_unit_costs := OLD.item_unit_costs;
    ELSE
        NEW.product_cost := NULL;
        NEW.item_unit_costs := NULL;
    END IF;

    IF NOT v_final THEN
        NEW.product_cost := NULL;
        NEW.item_unit_costs := NULL;
        RETURN NEW;
    END IF;

    IF NOT v_was_final
       OR NEW.item_unit_costs IS NULL
       OR (TG_OP = 'UPDATE' AND NEW.items IS DISTINCT FROM OLD.items) THEN
        NEW.item_unit_costs := public.order_item_unit_costs(NEW.tenant_id, NEW.items);
        NEW.product_cost := public.order_items_total_cost(NEW.items, NEW.item_unit_costs);
    END IF;
    RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.orders_snapshot_item_costs() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS orders_snapshot_item_costs ON public.orders;
CREATE TRIGGER orders_snapshot_item_costs
    BEFORE INSERT OR UPDATE OF status, items, is_return, product_cost, item_unit_costs ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.orders_snapshot_item_costs();

-- 4. Reading the snapshots ------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finance_order_costs(p_tenant_id uuid, p_from timestamptz DEFAULT NULL)
RETURNS TABLE (order_id uuid, item_unit_costs numeric[])
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
    IF NOT public.can_see_product_cost(p_tenant_id) THEN
        RETURN;
    END IF;
    RETURN QUERY
        SELECT o.id, o.item_unit_costs
          FROM public.orders o
         WHERE o.tenant_id = p_tenant_id
           AND o.item_unit_costs IS NOT NULL
           AND (p_from IS NULL OR o.created_at >= p_from);
END;
$function$;

REVOKE ALL ON FUNCTION public.finance_order_costs(uuid, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finance_order_costs(uuid, timestamptz) TO authenticated;

-- 5. Backfill, triggers off ------------------------------------------------------
SET LOCAL session_replication_role = replica;

UPDATE public.orders o
   SET item_unit_costs = c.costs,
       product_cost = public.order_items_total_cost(o.items, c.costs)
  FROM (
      SELECT x.id, public.order_item_unit_costs(x.tenant_id, x.items) AS costs
        FROM public.orders x
       WHERE x.status::text IN ('delivered', 'completed')
         AND NOT COALESCE(x.is_return, false)
         AND x.item_unit_costs IS NULL
  ) c
 WHERE o.id = c.id;

SET LOCAL session_replication_role = origin;

COMMIT;
