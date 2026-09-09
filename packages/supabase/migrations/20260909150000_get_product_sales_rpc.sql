-- PERF-D1 (final consumer). `use-products-crud` pulled the ENTIRE order book —
-- ~7 MB after risk_data was split out — for one purpose: to fold every order's
-- `items` array into per-product sales totals. That made /products, /products/[id]
-- and every screen importing a product component a full-book route.
--
-- The fold belongs in SQL. 22 products and 40,972 order lines collapse to 22 rows.
--
-- MATCHING RULES ARE PORTED EXACTLY from calculateProductSales(), including the
-- part that is wrong (see 20260909150500, which fixes it as its own change):
--   * product HAS a sku  -> only lines whose own sku matches count
--   * product has NO sku -> only lines whose name matches count
-- `line_count` is the number of matched LINES, not orders — the client called it
-- orderCount and divided revenue by it to get "averageOrderValue". Name kept
-- honest here; the client still computes the same average from it.
--
-- SECURITY INVOKER: RLS scopes both tables to the caller. The explicit
-- tenant_id join additionally stops a multi-tenant user's products from matching
-- another of their tenants' order lines.
--
-- Mirrors the client's scope: is_archived = false AND deleted_at IS NULL (the
-- latter because v_orders_with_risk already filters it, so the browser never saw
-- soft-deleted orders either). Order STATUS is deliberately not filtered — the
-- client counted every status, rejected included, and this is a faithful port.
CREATE OR REPLACE FUNCTION public.get_product_sales()
RETURNS TABLE (
  product_id     uuid,
  times_sold     numeric,
  total_revenue  numeric,
  line_count     bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
  WITH lines AS (
    SELECT o.tenant_id,
           e->>'sku'  AS sku,
           e->>'name' AS name,
           COALESCE((e->>'quantity')::numeric, 0) AS qty,
           COALESCE((e->>'price')::numeric, 0)    AS price
    FROM public.orders o
    CROSS JOIN LATERAL jsonb_array_elements(o.items) e
    WHERE o.is_archived = false
      AND o.deleted_at IS NULL
      AND jsonb_typeof(o.items) = 'array'
  )
  SELECT p.id,
         COALESCE(sum(l.qty), 0)::numeric,
         COALESCE(sum(l.price * l.qty), 0)::numeric,
         count(l.name)
  FROM public.products p
  LEFT JOIN lines l
    ON l.tenant_id = p.tenant_id
   AND (
        (COALESCE(p.sku, '') <> '' AND COALESCE(l.sku, '') <> ''
          AND lower(btrim(l.sku)) = lower(btrim(p.sku)))
     OR (COALESCE(p.sku, '') = ''
          AND lower(btrim(l.name)) = lower(btrim(p.name)))
   )
  GROUP BY p.id;
$$;

REVOKE ALL ON FUNCTION public.get_product_sales() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_product_sales() TO authenticated;
