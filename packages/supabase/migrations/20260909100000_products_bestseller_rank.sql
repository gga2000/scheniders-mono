-- =====================================================================
-- products.bestseller_rank — real "best sellers", not manual ordering
-- =====================================================================
-- The storefront's product_grid supports `query.sort = "bestsellers"`, and
-- the signature template's home page heads that grid with "اكثر العطور
-- مبيعاً" (our best-selling perfumes). Until now nothing backed the claim:
-- the sort fell through to the merchant's `display_order`, so the live
-- store led with a product that had sold 13 units while its actual
-- best seller (1,454 units) sat seventh.
--
-- This adds a rank computed from fulfilled orders. Deliberately a RANK and
-- not a unit count: rank is exactly what the storefront needs to order a
-- grid, while unit volumes are commercially sensitive and `anon` can read
-- every column it is granted. Only the ordinal is exposed.
--
-- Ranking window is trailing 180 days so "best seller" means what it says
-- today rather than what sold two years ago; ties break on units then id
-- so the order is stable between refreshes. (90 days was tried first and
-- covered only 66 fulfilled orders for the flagship tenant — enough to rank
-- 4 products for an 8-card grid. 180 days covers 1,355 and ranks 7.)
-- =====================================================================

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS bestseller_rank smallint;

COMMENT ON COLUMN public.products.bestseller_rank IS
  '1 = best seller for this tenant over the trailing 180 days of fulfilled orders; NULL = outside the top 20. Maintained by refresh_bestseller_ranks(); never set by hand.';

-- Partial index: the storefront only ever filters/sorts on ranked rows.
CREATE INDEX IF NOT EXISTS idx_products_tenant_bestseller_rank
  ON public.products (tenant_id, bestseller_rank)
  WHERE bestseller_rank IS NOT NULL;

-- The ordinal is public (it only reveals ordering, which the grid shows
-- anyway); the underlying volumes never leave the database.
GRANT SELECT (bestseller_rank) ON public.products TO anon, authenticated;

-- =====================================================================
-- refresh_bestseller_ranks() — recompute every tenant's top 20
-- =====================================================================
-- Orders keep their line items in `orders.items` (jsonb), so units are
-- summed by expanding that array. Only fulfilled orders count: 'completed'
-- and 'delivered'. Cancelled / rejected / no-response orders are demand
-- signals, not sales, and counting them would inflate the claim again.
CREATE OR REPLACE FUNCTION public.refresh_bestseller_ranks(
    p_window_days int DEFAULT 180,
    p_top_n int DEFAULT 20
  )
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_ranked integer;
BEGIN
  WITH sales AS (
    SELECT
      o.tenant_id,
      (it->>'product_id')::uuid AS product_id,
      SUM(COALESCE(NULLIF(it->>'quantity', '')::int, 1)) AS units
    FROM public.orders o
    CROSS JOIN LATERAL jsonb_array_elements(o.items) it
    WHERE o.status IN ('completed', 'delivered')
      AND o.created_at >= now() - make_interval(days => p_window_days)
      AND it ? 'product_id'
      AND (it->>'product_id') ~ '^[0-9a-fA-F-]{36}$'
    GROUP BY 1, 2
  ),
  ranked AS (
    SELECT
      s.tenant_id,
      s.product_id,
      ROW_NUMBER() OVER (
        PARTITION BY s.tenant_id
        ORDER BY s.units DESC, s.product_id
      )::smallint AS rnk
    FROM sales s
    -- Only rank products the store still sells; an archived or hidden
    -- product must not occupy a slot in a live grid.
    JOIN public.products p
      ON p.id = s.product_id
     AND p.tenant_id = s.tenant_id
     AND p.is_archived = false
     AND p.is_visible = true
  )
  UPDATE public.products p
     SET bestseller_rank = r.rnk
    FROM ranked r
   WHERE p.id = r.product_id
     AND r.rnk <= p_top_n
     AND p.bestseller_rank IS DISTINCT FROM r.rnk;

  GET DIAGNOSTICS v_ranked = ROW_COUNT;

  -- Clear stale ranks: products that dropped out of the top N (or stopped
  -- selling entirely) must not keep yesterday's badge.
  UPDATE public.products p
     SET bestseller_rank = NULL
   WHERE p.bestseller_rank IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
         FROM public.orders o
         CROSS JOIN LATERAL jsonb_array_elements(o.items) it
        WHERE o.tenant_id = p.tenant_id
          AND o.status IN ('completed', 'delivered')
          AND o.created_at >= now() - make_interval(days => p_window_days)
          AND (it->>'product_id') = p.id::text
     );

  RETURN v_ranked;
END;
$function$;

-- Maintenance only: never callable from the browser.
REVOKE EXECUTE ON FUNCTION public.refresh_bestseller_ranks(int, int) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_bestseller_ranks(int, int) TO service_role;

-- Nightly at 02:15 UTC — sales ranks do not need to be live to the minute,
-- and the storefront caches tenant data for 60s anyway.
SELECT cron.schedule(
  'refresh-bestseller-ranks',
  '15 2 * * *',
  $$SELECT public.refresh_bestseller_ranks();$$
)
WHERE NOT EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'refresh-bestseller-ranks'
);

-- Seed immediately so the first page view after deploy is already honest.
SELECT public.refresh_bestseller_ranks();
