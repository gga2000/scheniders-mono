-- =====================================================================
-- tenant_public_stats — hardening follow-up
-- =====================================================================
-- Spec review against the live DB found:
--
-- 1. (security) REVOKE ... FROM public, anon did NOT strip EXECUTE from
--    `authenticated`. Supabase's default privileges explicitly GRANT
--    EXECUTE on new public-schema functions to anon AND authenticated;
--    revoking from the `public` pseudo-role does not remove an explicit
--    role grant. Any logged-in customer could call the refresh function
--    on demand and force an unbounded full scan across every tenant's
--    orders, rewriting every tenant's public stats row. Must revoke
--    from `authenticated` explicitly too.
-- 2. (latent) orders.tenant_id is nullable. GROUP BY o.tenant_id would
--    emit a NULL group that violates the tenant_id PK on a single
--    orphan order, aborting the whole refresh (and failing the cron
--    job silently every 30 minutes thereafter).
-- 3. (correctness) soft-deleted and test orders were counted.
-- 4. (correctness) a blank validated_governorate_code ('') shadowed a
--    valid governorate_code via coalesce(), which only falls through
--    on NULL, not on ''.
-- 5. (correctness) customers counted raw `phone`, not the repo-wide
--    normalized identity key, double-counting the same person under
--    differently formatted numbers.
-- =====================================================================

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
    count(DISTINCT public.normalize_phone(o.phone))
      FILTER (WHERE o.phone IS NOT NULL AND o.phone <> ''),
    -- Blank codes are not a governorate. Counting them returns 19 for a
    -- country that has 18, which would publish a false number. Use
    -- nullif so an empty validated code falls through to the raw code
    -- instead of shadowing it (coalesce alone only falls through on
    -- NULL, not on '').
    count(DISTINCT coalesce(
      nullif(o.validated_governorate_code, ''),
      nullif(o.governorate_code, '')
    )) FILTER (
      WHERE coalesce(
        nullif(o.validated_governorate_code, ''),
        nullif(o.governorate_code, '')
      ) IS NOT NULL
    ),
    min(o.created_at),
    now()
  FROM public.orders o
  WHERE o.tenant_id IS NOT NULL
    AND o.deleted_at IS NULL
    AND coalesce(o.is_test, false) = false
  GROUP BY o.tenant_id
  ON CONFLICT (tenant_id) DO UPDATE SET
    completed_orders    = EXCLUDED.completed_orders,
    customers           = EXCLUDED.customers,
    governorates_served = EXCLUDED.governorates_served,
    first_order_at      = EXCLUDED.first_order_at,
    refreshed_at        = EXCLUDED.refreshed_at;
$function$;

-- REVOKE FROM public does NOT strip an explicit role grant. Supabase's
-- default privileges explicitly grant EXECUTE on new public-schema
-- functions to both anon and authenticated; both must be revoked by
-- name.
REVOKE EXECUTE ON FUNCTION public.refresh_tenant_public_stats()
  FROM public, anon, authenticated;

SELECT public.refresh_tenant_public_stats();

NOTIFY pgrst, 'reload schema';
