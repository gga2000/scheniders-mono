-- =====================================================================
-- tenant_public_stats — aggregates a public storefront may read
-- =====================================================================
-- The storefront renders for `anon`. `orders` is tenant-private and must
-- never be readable there, so the home page's proof ledge reads only
-- these pre-aggregated counts: no order rows, no phones, no addresses,
-- no revenue.
--
-- Refreshed on a schedule rather than counted per request — a public
-- page must not run an aggregate over the whole order book on every hit.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.tenant_public_stats (
  tenant_id           uuid PRIMARY KEY
                        REFERENCES public.tenants(id) ON DELETE CASCADE,
  completed_orders    integer NOT NULL DEFAULT 0,
  customers           integer NOT NULL DEFAULT 0,
  governorates_served integer NOT NULL DEFAULT 0,
  first_order_at      timestamptz,
  refreshed_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tenant_public_stats ENABLE ROW LEVEL SECURITY;

-- Readable by anyone who can already see the storefront, using the SAME
-- predicate as `public_storefront_read` on tenants. No INSERT/UPDATE/
-- DELETE grant to anon: only the SECURITY DEFINER refresh writes here.
DROP POLICY IF EXISTS public_stats_read ON public.tenant_public_stats;
CREATE POLICY public_stats_read
  ON public.tenant_public_stats
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.tenants t
      WHERE t.id = tenant_public_stats.tenant_id
        AND t.status IN ('trial', 'active')
    )
  );

REVOKE ALL ON public.tenant_public_stats FROM anon, authenticated;
GRANT SELECT ON public.tenant_public_stats TO anon, authenticated;

-- ---------------------------------------------------------------------
-- Refresh
-- ---------------------------------------------------------------------
-- NOTE: do NOT gate this on `current_user <> 'service_role'`. That
-- predicate is always true inside a SECURITY DEFINER function because
-- current_user is the owner (postgres). That exact bug has been fixed
-- four times in this codebase. There is no caller gate here at all --
-- the function is not granted to anon, and it only ever writes
-- aggregates.
CREATE OR REPLACE FUNCTION public.refresh_tenant_public_stats()
  RETURNS void
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
  INSERT INTO public.tenant_public_stats AS s (
    tenant_id, completed_orders, customers,
    governorates_served, first_order_at, refreshed_at
  )
  SELECT
    o.tenant_id,
    count(*) FILTER (WHERE o.status = 'completed'),
    count(DISTINCT o.phone) FILTER (WHERE o.phone IS NOT NULL AND o.phone <> ''),
    -- Blank codes are not a governorate. Counting them returns 19 for a
    -- country that has 18, which would publish a false number.
    count(DISTINCT coalesce(o.validated_governorate_code, o.governorate_code))
      FILTER (
        WHERE coalesce(o.validated_governorate_code, o.governorate_code)
              IS NOT NULL
          AND coalesce(o.validated_governorate_code, o.governorate_code) <> ''
      ),
    min(o.created_at),
    now()
  FROM public.orders o
  GROUP BY o.tenant_id
  ON CONFLICT (tenant_id) DO UPDATE SET
    completed_orders    = EXCLUDED.completed_orders,
    customers           = EXCLUDED.customers,
    governorates_served = EXCLUDED.governorates_served,
    first_order_at      = EXCLUDED.first_order_at,
    refreshed_at        = EXCLUDED.refreshed_at;
$function$;

REVOKE EXECUTE ON FUNCTION public.refresh_tenant_public_stats() FROM public, anon;

-- Supports the FILTERed aggregate above.
CREATE INDEX IF NOT EXISTS idx_orders_tenant_status_stats
  ON public.orders (tenant_id, status);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'refresh-tenant-public-stats') THEN
    PERFORM cron.unschedule('refresh-tenant-public-stats');
  END IF;
  PERFORM cron.schedule(
    'refresh-tenant-public-stats',
    '*/30 * * * *',
    'SELECT public.refresh_tenant_public_stats()'
  );
END$$;

SELECT public.refresh_tenant_public_stats();

NOTIFY pgrst, 'reload schema';;
