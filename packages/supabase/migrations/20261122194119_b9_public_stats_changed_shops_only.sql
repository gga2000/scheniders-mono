-- B9 step 2 (load test, 22 Nov): the storefront's public counts are worked out
-- again only for shops whose orders changed.
--
-- refresh_tenant_public_stats runs at :18 and :48. Whenever any order anywhere
-- had changed, it counted every shop's whole order book again (customers,
-- governorates, completed orders): 1.9 s idle and 4 to 10 s under load on the
-- 200-shop copy, growing with all orders ever written. When no order had
-- changed it skipped the run, so "orders this week" stopped moving and the
-- storefront hid it once refreshed_at was 6 hours old.
--
-- Now each run:
--   1. counts again only the shops with an order written since their counts
--      were last worked out (counts_refreshed_at, an hour further back for a
--      change that commits late), the same counts as before. A shop whose
--      orders all left the counts (deleted, test, taken stock) loses its row,
--      so the storefront drops the slot as it does for a shop with no row;
--   2. moves every other shop's "orders this week" on from the last 7 days of
--      orders (the created_at index), so it falls as orders age, every run.
-- refreshed_at stays what the storefront reads it as: when orders_7d was last
-- right. counts_refreshed_at is new: when the other counts were.
-- On the 200-shop copy, idle: 168 ms when no shop changed, 293 ms when 20
-- did, 1.3 s when all 200 did.
--
-- Rollback: re-run refresh_tenant_public_stats from
-- 20261104011510_orders_stock_taken_excluded_from_sales.sql. The new column
-- can stay.

ALTER TABLE public.tenant_public_stats ADD COLUMN IF NOT EXISTS counts_refreshed_at timestamptz;
COMMENT ON COLUMN public.tenant_public_stats.counts_refreshed_at IS
    'B9: when completed_orders, customers, governorates_served and first_order_at were last counted. refreshed_at is when orders_7d was.';

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

-- Its skip-when-nothing-changed state is no longer read.
DELETE FROM public.cron_refresh_state WHERE job = 'tenant_public_stats';

-- Fill counts_refreshed_at: every shop is counted once more under the new rule.
SELECT public.refresh_tenant_public_stats();
