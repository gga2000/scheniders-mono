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
     OR (COALESCE(l.sku, '') = ''
          AND lower(btrim(l.name)) = lower(btrim(p.name)))
   )
  GROUP BY p.id;
$$;;
