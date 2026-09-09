-- Product sales undercounted a product the moment it was given a SKU.
--
-- `calculateProductSales()` decided the matching rule from the PRODUCT:
--   product HAS a sku  -> count only lines whose sku matches
--   product has NO sku -> count only lines whose name matches
--
-- But only 3,300 of 40,972 order lines carry a sku at all (8%). So giving a
-- product a SKU silently discarded every historical line that predated it. The
-- product's sales did not drop — its counter did.
--
-- MEASURED, all tenants, before and after:
--   * 2 of 22 products change
--   * 1 product read "0 sold" while 16 units of it had been sold under its name
--     (ايبسكو / SCHN-EPSCO)
--   * 17 units and 740,500 IQD of product revenue restored
--
-- The rule now keys off the LINE, which is what actually varies:
--   line HAS a sku -> match on sku
--   line has NO sku -> fall back to matching on name
--
-- These two branches are mutually exclusive for any given line, so nothing can
-- be counted twice. Verified before applying: zero duplicate SKUs and zero
-- duplicate product names within a tenant, so a line still resolves to at most
-- one product.
--
-- DOWN MIGRATION: change `COALESCE(l.sku,'') = ''` back to
-- `COALESCE(p.sku,'') = ''` in the second branch.
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
$$;
