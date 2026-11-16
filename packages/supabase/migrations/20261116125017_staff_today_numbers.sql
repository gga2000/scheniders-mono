-- The numbers above the Today desk (board h3): orders since Baghdad midnight,
-- orders yesterday up to the same time, and our fees this Baghdad month so
-- far. They read the views the Numbers pages read (admin_order_facts,
-- admin_income_facts), so Today and Numbers never disagree. Bounds are
-- instants, so the orders index on created_at can serve them.
--
-- A read for the console's service role only.
--
-- Rollback: DROP FUNCTION public.staff_today_numbers(timestamptz);

CREATE OR REPLACE FUNCTION public.staff_today_numbers(_now timestamptz DEFAULT now())
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
WITH clock AS (
    SELECT date_trunc('day', _now AT TIME ZONE 'Asia/Baghdad') AT TIME ZONE 'Asia/Baghdad' AS today,
           date_trunc('month', _now AT TIME ZONE 'Asia/Baghdad') AT TIME ZONE 'Asia/Baghdad' AS month_start
)
SELECT jsonb_build_object(
    'orders_today', (SELECT count(*) FROM public.admin_order_facts f, clock c
                      WHERE f.created_at >= c.today AND f.created_at <= _now),
    'orders_yesterday_by_now', (SELECT count(*) FROM public.admin_order_facts f, clock c
                                 WHERE f.created_at >= c.today - interval '1 day'
                                   AND f.created_at <= _now - interval '1 day'),
    'fees_month', (SELECT coalesce(sum(i.amount_iqd), 0) FROM public.admin_income_facts i, clock c
                    WHERE i.kind <> 'other' AND i.created_at >= c.month_start AND i.created_at <= _now)
)
FROM clock;
$$;
REVOKE ALL ON FUNCTION public.staff_today_numbers(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staff_today_numbers(timestamptz) TO service_role;
