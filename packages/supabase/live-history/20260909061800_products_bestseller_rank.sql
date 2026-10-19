ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS bestseller_rank smallint;

COMMENT ON COLUMN public.products.bestseller_rank IS
  '1 = best seller for this tenant over the trailing 90 days of fulfilled orders; NULL = outside the top 20. Maintained by refresh_bestseller_ranks(); never set by hand.';

CREATE INDEX IF NOT EXISTS idx_products_tenant_bestseller_rank
  ON public.products (tenant_id, bestseller_rank)
  WHERE bestseller_rank IS NOT NULL;

GRANT SELECT (bestseller_rank) ON public.products TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.refresh_bestseller_ranks(
    p_window_days int DEFAULT 90,
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

REVOKE EXECUTE ON FUNCTION public.refresh_bestseller_ranks(int, int) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_bestseller_ranks(int, int) TO service_role;;
