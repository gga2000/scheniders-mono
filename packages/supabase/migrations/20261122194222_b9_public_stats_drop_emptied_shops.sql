-- B9 step 2, follow-up to 20261122194119: a shop whose orders were removed
-- outright keeps no stale public counts.
--
-- 20261122194119 counts a shop again when one of its orders was written since
-- its counts were. An order removed outright (DELETE: the demo store's reset,
-- a test shop's clean-up) leaves no updated_at behind, so a shop with no order
-- left at all kept its last counts. On live that was the test shop: "1
-- customer" and no orders. The old job kept such rows too (it only wrote shops
-- that had orders). Now a stored row is also counted again when it was never
-- counted under the new rule, or when its shop has no order left at all; with
-- no counted order, the row goes, and the storefront drops the slot.
--
-- Rollback: re-run refresh_tenant_public_stats from
-- 20261122194119_b9_public_stats_changed_shops_only.sql.

CREATE OR REPLACE FUNCTION public.refresh_tenant_public_stats()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
    v_now timestamptz := now();
begin
    -- 1. Shops whose orders changed since their counts were worked out are
    --    counted again; one with no counted order left loses its row.
    WITH changed AS (
        SELECT t.id AS tenant_id
          FROM public.tenants t
          LEFT JOIN public.tenant_public_stats s ON s.tenant_id = t.id
         WHERE EXISTS (SELECT 1
                         FROM public.orders o
                        WHERE o.tenant_id = t.id
                          AND o.updated_at >= coalesce(s.counts_refreshed_at - interval '1 hour', '-infinity'))
            -- A row never counted under this rule, or whose shop has no order
            -- left at all (orders removed outright leave no updated_at).
            OR (s.tenant_id IS NOT NULL
                AND (s.counts_refreshed_at IS NULL
                     OR NOT EXISTS (SELECT 1 FROM public.orders o WHERE o.tenant_id = t.id)))
    ), counted AS (
        INSERT INTO public.tenant_public_stats AS s (
            tenant_id, completed_orders, customers,
            governorates_served, first_order_at, orders_7d, refreshed_at, counts_refreshed_at
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
                WHERE o.created_at > v_now - interval '7 days'
                  AND o.status <> 'pending_checkout'
            ),
            v_now,
            v_now
        FROM public.orders o
        WHERE o.tenant_id IN (SELECT c.tenant_id FROM changed c)
            AND o.deleted_at IS NULL
            AND coalesce(o.is_test, false) = false
            AND o.take_kind IS NULL
        GROUP BY o.tenant_id
        ON CONFLICT (tenant_id) DO UPDATE SET
            completed_orders    = EXCLUDED.completed_orders,
            customers           = EXCLUDED.customers,
            governorates_served = EXCLUDED.governorates_served,
            first_order_at      = EXCLUDED.first_order_at,
            orders_7d           = EXCLUDED.orders_7d,
            refreshed_at        = EXCLUDED.refreshed_at,
            counts_refreshed_at = EXCLUDED.counts_refreshed_at
        RETURNING s.tenant_id
    )
    DELETE FROM public.tenant_public_stats s
     USING changed c
     WHERE s.tenant_id = c.tenant_id
       AND c.tenant_id NOT IN (SELECT k.tenant_id FROM counted k);

    -- 2. Every other shop: this week's orders, as orders age out of it.
    WITH week AS (
        SELECT o.tenant_id, count(*)::int AS n
          FROM public.orders o
         WHERE o.created_at > v_now - interval '7 days'
           AND o.status <> 'pending_checkout'
           AND o.deleted_at IS NULL
           AND coalesce(o.is_test, false) = false
           AND o.take_kind IS NULL
         GROUP BY o.tenant_id
    )
    UPDATE public.tenant_public_stats s
       SET orders_7d = coalesce(w.n, 0),
           refreshed_at = v_now
      FROM public.tenant_public_stats k
      LEFT JOIN week w ON w.tenant_id = k.tenant_id
     WHERE s.tenant_id = k.tenant_id
       AND s.refreshed_at < v_now;
end;
$function$;
REVOKE ALL ON FUNCTION public.refresh_tenant_public_stats() FROM PUBLIC, anon, authenticated;

SELECT public.refresh_tenant_public_stats();
