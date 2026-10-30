-- Products page, round 1 fixes (audit: customers-products-audit/round1/products-*.md).
--
-- 1. get_product_sales(p_tenant_id): sold units and revenue per product, matched
--    on the order line's product_id, counted only from delivered orders. Uses the
--    same rule as the Customers page's spend: a sale is a non-return order in
--    completed/delivered; a delivered refund (return row in refund_delivered)
--    subtracts its units and abs(price); deleted, archived and test orders never
--    count. The old zero-argument function matched lines by sku-or-name (Wafer
--    showed 0 sold), counted cancelled/rejected orders, had no date window and
--    was EXECUTE-able by anon.
-- 2. Product permissions (Ali, 2026-10-30: "Edit and restock only"): employees
--    keep editing products and stock (products.edit); deleting products and the
--    inventory tools (Zero oversold, Recalculate) are admin-only
--    (products.manage). Viewers can no longer write products at all.
-- 3. Product audit tables (price history, inventory history, activity log) become
--    insert-only for members.
-- 4. anon loses product_variants.cost and its table-wide write grants.
-- 5. Zero oversold writes one ledger row per product it changes, with the delta.
-- 6. Money columns on products and variants are whole, non-negative IQD.

-- ---------------------------------------------------------------------------
-- 1. Product sales
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_product_sales();

CREATE FUNCTION public.get_product_sales(p_tenant_id uuid)
RETURNS TABLE (
    product_id     uuid,
    units_sold     bigint,
    revenue        bigint,
    order_count    bigint,
    units_sold_30d bigint,
    revenue_30d    bigint
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
BEGIN
    IF p_tenant_id IS NULL OR p_tenant_id NOT IN (SELECT public.get_user_tenant_ids()) THEN
        RAISE EXCEPTION 'not a member of this tenant' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    WITH counted AS (
        SELECT o.id,
               o.items,
               o.price AS order_price,
               COALESCE(o.is_return, false) AS is_return,
               CASE WHEN COALESCE(o.is_return, false)
                    THEN COALESCE(o.refunded_at, o.delivered_at, o.completed_at, o.created_at)
                    ELSE COALESCE(o.delivered_at, o.completed_at, o.created_at)
               END AS sold_at
          FROM public.orders o
         WHERE o.tenant_id = p_tenant_id
           AND o.deleted_at IS NULL
           AND NOT o.is_archived
           AND NOT COALESCE(o.is_test, false)
           AND jsonb_typeof(o.items) = 'array'
           AND (   (NOT COALESCE(o.is_return, false) AND o.status IN ('completed', 'delivered'))
                OR (COALESCE(o.is_return, false) AND o.status = 'refund_delivered'))
    ), lines AS (
        SELECT c.id AS order_id,
               c.is_return,
               c.sold_at,
               c.order_price,
               (e->>'product_id')::uuid AS pid,
               GREATEST(COALESCE((e->>'quantity')::numeric, 0), 0) AS qty,
               GREATEST(COALESCE((e->>'price')::numeric, 0), 0) AS unit_price
          FROM counted c
         CROSS JOIN LATERAL jsonb_array_elements(c.items) e
         WHERE jsonb_typeof(e) = 'object'
           AND (e->>'product_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    ), valued AS (
        -- A sale is worth its line total. A refund takes back the amount actually
        -- refunded (abs(order price)), shared across its lines by line value.
        SELECT l.order_id,
               l.is_return,
               l.sold_at,
               l.pid,
               CASE WHEN l.is_return THEN -l.qty ELSE l.qty END AS units,
               CASE WHEN NOT l.is_return THEN l.qty * l.unit_price
                    ELSE -abs(l.order_price) *
                         CASE WHEN sum(l.qty * l.unit_price) OVER w > 0
                              THEN (l.qty * l.unit_price) / sum(l.qty * l.unit_price) OVER w
                              ELSE 1.0 / count(*) OVER w
                         END
               END AS amount
          FROM lines l
        WINDOW w AS (PARTITION BY l.order_id)
    )
    SELECT v.pid,
           round(sum(v.units))::bigint,
           round(sum(v.amount))::bigint,
           count(DISTINCT v.order_id) FILTER (WHERE NOT v.is_return),
           COALESCE(round(sum(v.units) FILTER (WHERE v.sold_at >= now() - interval '30 days')), 0)::bigint,
           COALESCE(round(sum(v.amount) FILTER (WHERE v.sold_at >= now() - interval '30 days')), 0)::bigint
      FROM valued v
      JOIN public.products p ON p.id = v.pid AND p.tenant_id = p_tenant_id
     GROUP BY v.pid;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_product_sales(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_product_sales(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Product permissions
-- ---------------------------------------------------------------------------
-- has_tenant_permission() already returns true for tenant admins; the admin rows
-- keep the role matrix complete for the team settings screen.
INSERT INTO public.role_permissions (role, permission) VALUES
    ('admin', 'products.edit'),
    ('admin', 'products.manage'),
    ('employee', 'products.edit')
ON CONFLICT (role, permission) DO NOTHING;

-- products, product_variants, categories: read stays membership-based; writes
-- need products.edit, and deleting a product needs products.manage.
DROP POLICY IF EXISTS tenant_isolation_insert ON public.products;
DROP POLICY IF EXISTS tenant_isolation_update ON public.products;
DROP POLICY IF EXISTS tenant_isolation_delete ON public.products;
CREATE POLICY products_insert ON public.products FOR INSERT TO authenticated
    WITH CHECK (public.has_tenant_permission(tenant_id, 'products.edit'));
CREATE POLICY products_update ON public.products FOR UPDATE TO authenticated
    USING (public.has_tenant_permission(tenant_id, 'products.edit'))
    WITH CHECK (public.has_tenant_permission(tenant_id, 'products.edit'));
CREATE POLICY products_delete ON public.products FOR DELETE TO authenticated
    USING (public.has_tenant_permission(tenant_id, 'products.manage'));

DROP POLICY IF EXISTS tenant_isolation_insert ON public.product_variants;
DROP POLICY IF EXISTS tenant_isolation_update ON public.product_variants;
DROP POLICY IF EXISTS tenant_isolation_delete ON public.product_variants;
CREATE POLICY product_variants_insert ON public.product_variants FOR INSERT TO authenticated
    WITH CHECK (public.has_tenant_permission(tenant_id, 'products.edit'));
CREATE POLICY product_variants_update ON public.product_variants FOR UPDATE TO authenticated
    USING (public.has_tenant_permission(tenant_id, 'products.edit'))
    WITH CHECK (public.has_tenant_permission(tenant_id, 'products.edit'));
CREATE POLICY product_variants_delete ON public.product_variants FOR DELETE TO authenticated
    USING (public.has_tenant_permission(tenant_id, 'products.edit'));

DROP POLICY IF EXISTS tenant_isolation_insert ON public.categories;
DROP POLICY IF EXISTS tenant_isolation_update ON public.categories;
DROP POLICY IF EXISTS tenant_isolation_delete ON public.categories;
CREATE POLICY categories_insert ON public.categories FOR INSERT TO authenticated
    WITH CHECK (public.has_tenant_permission(tenant_id, 'products.edit'));
CREATE POLICY categories_update ON public.categories FOR UPDATE TO authenticated
    USING (public.has_tenant_permission(tenant_id, 'products.edit'))
    WITH CHECK (public.has_tenant_permission(tenant_id, 'products.edit'));
CREATE POLICY categories_delete ON public.categories FOR DELETE TO authenticated
    USING (public.has_tenant_permission(tenant_id, 'products.edit'));

-- ---------------------------------------------------------------------------
-- 3. Insert-only product audit tables. Cascades from a product delete are
--    referential actions and do not go through these policies.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS tenant_isolation_all ON public.product_price_history;
CREATE POLICY product_price_history_select ON public.product_price_history FOR SELECT TO authenticated
    USING (tenant_id IN (SELECT public.get_user_tenant_ids()));
CREATE POLICY product_price_history_insert ON public.product_price_history FOR INSERT TO authenticated
    WITH CHECK (public.has_tenant_permission(tenant_id, 'products.edit'));

DROP POLICY IF EXISTS tenant_isolation_all ON public.inventory_history;
CREATE POLICY inventory_history_select ON public.inventory_history FOR SELECT TO authenticated
    USING (tenant_id IN (SELECT public.get_user_tenant_ids()));
CREATE POLICY inventory_history_insert ON public.inventory_history FOR INSERT TO authenticated
    WITH CHECK (public.has_tenant_permission(tenant_id, 'products.edit'));

DROP POLICY IF EXISTS tenant_isolation_all ON public.product_activity_log;
CREATE POLICY product_activity_log_select ON public.product_activity_log FOR SELECT TO authenticated
    USING (tenant_id IN (SELECT public.get_user_tenant_ids()));
CREATE POLICY product_activity_log_insert ON public.product_activity_log FOR INSERT TO authenticated
    WITH CHECK (public.has_tenant_permission(tenant_id, 'products.edit'));

REVOKE UPDATE, DELETE, TRUNCATE ON public.product_price_history, public.inventory_history, public.product_activity_log
    FROM authenticated, anon;

-- ---------------------------------------------------------------------------
-- 4. anon: no variant cost, no writes on catalogue tables
-- ---------------------------------------------------------------------------
REVOKE SELECT ON public.product_variants FROM anon;
GRANT SELECT (
    id, product_id, tenant_id, name, price, compare_at_price, stock_quantity,
    reserved_quantity, open_box_quantity, sku, barcode, weight, dimensions_json,
    low_stock_threshold, display_order, option_values, image_url, is_enabled,
    created_at, updated_at
) ON public.product_variants TO anon;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
    ON public.products, public.product_variants, public.categories, public.inventory_ledger
    FROM anon;
REVOKE SELECT ON public.inventory_ledger FROM anon;

-- ---------------------------------------------------------------------------
-- 5. Inventory tools: admin-only, and Zero oversold records what it changed
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.zero_oversold(p_tenant_id uuid DEFAULT NULL::uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
    IF coalesce(auth.role(), '') IN ('authenticated', 'anon')
       AND (p_tenant_id IS NULL OR NOT public.has_tenant_permission(p_tenant_id, 'products.manage')) THEN
        RAISE EXCEPTION 'not allowed to manage this tenant''s inventory' USING ERRCODE = '42501';
    END IF;

    WITH changed AS (
        UPDATE public.products p
           SET stock_quantity = p.reserved_quantity
          FROM public.products old
         WHERE old.id = p.id
           AND NOT p.is_supply AND p.reserved_quantity > p.stock_quantity
           AND (p_tenant_id IS NULL OR p.tenant_id = p_tenant_id)
        RETURNING p.tenant_id, p.id, p.stock_quantity - old.stock_quantity AS delta
    )
    INSERT INTO public.inventory_ledger (tenant_id, product_id, variant_id, order_id, delta_reserved, delta_stock, delta_open_box, reason)
    SELECT tenant_id, id, NULL, NULL, 0, delta, 0, 'zero_oversold' FROM changed;

    WITH changed AS (
        UPDATE public.product_variants v
           SET stock_quantity = v.reserved_quantity
          FROM public.product_variants old
         WHERE old.id = v.id
           AND v.reserved_quantity > v.stock_quantity
           AND (p_tenant_id IS NULL OR v.tenant_id = p_tenant_id)
        RETURNING v.tenant_id, v.product_id, v.id, v.stock_quantity - old.stock_quantity AS delta
    )
    INSERT INTO public.inventory_ledger (tenant_id, product_id, variant_id, order_id, delta_reserved, delta_stock, delta_open_box, reason)
    SELECT tenant_id, product_id, id, NULL, 0, delta, 0, 'zero_oversold' FROM changed;
END;
$function$;

CREATE OR REPLACE FUNCTION public.recompute_inventory(p_tenant_id uuid DEFAULT NULL::uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
    IF coalesce(auth.role(), '') IN ('authenticated', 'anon')
       AND (p_tenant_id IS NULL OR NOT public.has_tenant_permission(p_tenant_id, 'products.manage')) THEN
        RAISE EXCEPTION 'not allowed to manage this tenant''s inventory' USING ERRCODE = '42501';
    END IF;

    IF p_tenant_id IS NULL THEN
        UPDATE public.products         SET reserved_quantity = 0;
        UPDATE public.product_variants SET reserved_quantity = 0;
    ELSE
        UPDATE public.products         SET reserved_quantity = 0 WHERE tenant_id = p_tenant_id;
        UPDATE public.product_variants SET reserved_quantity = 0 WHERE tenant_id = p_tenant_id;
    END IF;

    UPDATE public.products p SET reserved_quantity = sub.qty
      FROM (
        SELECT (e->>'product_id')::uuid AS pid,
               SUM(round((e->>'quantity')::numeric)::integer) AS qty
          FROM public.orders o CROSS JOIN LATERAL jsonb_array_elements(o.items) e
         WHERE o.status = 'confirmed'
           AND NOT COALESCE(o.is_return, false)
           AND (p_tenant_id IS NULL OR o.tenant_id = p_tenant_id)
           AND nullif(e->>'variant_id','') IS NULL
           AND COALESCE((e->>'is_open_box')::boolean, false) = false
           AND nullif(e->>'product_id','') IS NOT NULL
           AND (e->>'product_id') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
         GROUP BY 1
      ) sub
     WHERE p.id = sub.pid AND (p_tenant_id IS NULL OR p.tenant_id = p_tenant_id);

    UPDATE public.product_variants pv SET reserved_quantity = sub.qty
      FROM (
        SELECT (e->>'variant_id')::uuid AS vid,
               SUM(round((e->>'quantity')::numeric)::integer) AS qty
          FROM public.orders o CROSS JOIN LATERAL jsonb_array_elements(o.items) e
         WHERE o.status = 'confirmed'
           AND NOT COALESCE(o.is_return, false)
           AND (p_tenant_id IS NULL OR o.tenant_id = p_tenant_id)
           AND COALESCE((e->>'is_open_box')::boolean, false) = false
           AND nullif(e->>'variant_id','') IS NOT NULL
           AND (e->>'variant_id') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
         GROUP BY 1
      ) sub
     WHERE pv.id = sub.vid AND (p_tenant_id IS NULL OR pv.tenant_id = p_tenant_id);

    INSERT INTO public.inventory_ledger(tenant_id, product_id, order_id, delta_reserved, delta_stock, delta_open_box, reason)
    VALUES (p_tenant_id, NULL, NULL, 0, 0, 0, 'recompute:reserved');
END;
$function$;

-- ---------------------------------------------------------------------------
-- 6. Whole, non-negative IQD on catalogue prices (live data: 0 violations)
-- ---------------------------------------------------------------------------
ALTER TABLE public.products
    ADD CONSTRAINT products_money_whole_iqd CHECK (
            (price IS NULL OR (price >= 0 AND price = trunc(price)))
        AND (cost IS NULL OR (cost >= 0 AND cost = trunc(cost)))
        AND (compare_at_price IS NULL OR (compare_at_price >= 0 AND compare_at_price = trunc(compare_at_price)))
        AND (website_price IS NULL OR (website_price >= 0 AND website_price = trunc(website_price)))
    );
ALTER TABLE public.product_variants
    ADD CONSTRAINT product_variants_money_whole_iqd CHECK (
            (price IS NULL OR (price >= 0 AND price = trunc(price)))
        AND (cost IS NULL OR (cost >= 0 AND cost = trunc(cost)))
        AND (compare_at_price IS NULL OR (compare_at_price >= 0 AND compare_at_price = trunc(compare_at_price)))
    );
