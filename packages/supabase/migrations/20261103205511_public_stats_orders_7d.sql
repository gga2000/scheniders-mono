-- =====================================================================
-- tenant_public_stats.orders_7d — orders placed in the last 7 days
-- =====================================================================
-- The product page's «طلب هذا الأسبوع» pill reads this pre-aggregated
-- count (anon never reads `orders`). An order is a placed order: abandoned
-- checkouts (`pending_checkout`), soft-deleted and test orders are not.
--
-- The window is anchored at refresh time and the refresh skips when no
-- order was written, so the count can only lag; the storefront drops the
-- pill when `refreshed_at` is older than a few hours, so a quiet spell
-- never leaves an old week on screen.
-- =====================================================================

ALTER TABLE public.tenant_public_stats
  ADD COLUMN IF NOT EXISTS orders_7d integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.refresh_tenant_public_stats()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
    v_fp bigint := public.orders_write_fingerprint();
begin
    if not public.cron_refresh_due('tenant_public_stats', v_fp) then
        return;
    end if;

    INSERT INTO public.tenant_public_stats AS s (
        tenant_id, completed_orders, customers,
        governorates_served, first_order_at, orders_7d, refreshed_at
    )
    SELECT
        o.tenant_id,
        count(*) FILTER (WHERE o.status = 'completed'),
        count(DISTINCT public.normalize_phone(o.phone))
            FILTER (WHERE o.phone IS NOT NULL AND o.phone <> ''),
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
        count(*) FILTER (
            WHERE o.created_at > now() - interval '7 days'
              AND o.status <> 'pending_checkout'
        ),
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
        orders_7d           = EXCLUDED.orders_7d,
        refreshed_at        = EXCLUDED.refreshed_at;

    perform public.cron_refresh_done('tenant_public_stats', v_fp);
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.refresh_tenant_public_stats()
  FROM public, anon, authenticated;

-- Fill the new column now instead of waiting for the next order write.
DELETE FROM public.cron_refresh_state WHERE job = 'tenant_public_stats';
SELECT public.refresh_tenant_public_stats();

NOTIFY pgrst, 'reload schema';
