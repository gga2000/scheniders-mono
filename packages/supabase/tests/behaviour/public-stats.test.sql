-- Behaviour test for the storefront's public counts (B9 step 2), run against
-- the newest definition in packages/supabase/migrations (see run.sh). Every
-- check raises on a wrong result, so psql -v ON_ERROR_STOP=1 fails.
--
-- The rule under test: after each run, every shop's row holds exactly what
-- counting its whole order book gives, as the old job counted it, though only
-- shops with changed orders are counted again: new orders, a status change, a
-- deleted, test or taken-stock order, a phone or governorate edit, a change
-- that commits late, a shop whose orders all leave the counts, and orders
-- ageing out of "this week" with no change at all, a shop whose orders were
-- removed outright, and a stale row from before the rule. refreshed_at says when
-- orders_7d was last right, every run.

\set ON_ERROR_STOP 1

CREATE FUNCTION pg_temp.check(p_ok boolean, p_label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok IS NOT TRUE THEN RAISE EXCEPTION 'FAIL %', p_label; END IF;
END $$;

-- Reference: the counts of refresh_tenant_public_stats from
-- 20261104011510_orders_stock_taken_excluded_from_sales.sql, every shop.
CREATE FUNCTION pg_temp.full_count()
RETURNS TABLE (tenant_id uuid, completed_orders bigint, customers bigint, governorates_served bigint,
               first_order_at timestamptz, orders_7d bigint)
LANGUAGE sql STABLE AS $$
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
        )
    FROM public.orders o
    WHERE o.tenant_id IS NOT NULL
        AND o.deleted_at IS NULL
        AND coalesce(o.is_test, false) = false
        AND o.take_kind IS NULL
    GROUP BY o.tenant_id;
$$;

CREATE FUNCTION pg_temp.same(p_label text, p_since timestamptz) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    PERFORM pg_temp.check(
        NOT EXISTS (SELECT * FROM pg_temp.full_count()
                    EXCEPT SELECT tenant_id, completed_orders, customers, governorates_served, first_order_at, orders_7d
                             FROM public.tenant_public_stats)
        AND NOT EXISTS (SELECT tenant_id, completed_orders, customers, governorates_served, first_order_at, orders_7d
                          FROM public.tenant_public_stats
                        EXCEPT SELECT * FROM pg_temp.full_count()),
        p_label || ': every row is the whole count');
    PERFORM pg_temp.check(NOT EXISTS (SELECT 1 FROM public.tenant_public_stats WHERE refreshed_at < p_since),
                          p_label || ': refreshed_at moved on every row');
END $$;

SELECT setseed(0.48);

INSERT INTO public.tenants (id)
SELECT ('00000000-0000-4000-8000-' || lpad(to_hex(g), 12, '0'))::uuid FROM generate_series(1, 12) g;

-- Shops 1 to 10: 60 days of orders up to 3 hours ago, phones written different ways, some
-- deleted, test, taken stock or abandoned at checkout. Shop 11: test orders
-- only. Shop 12: no orders.
INSERT INTO public.orders (tenant_id, phone, status, governorate_code, validated_governorate_code,
                           created_at, updated_at, deleted_at, is_test, take_kind)
SELECT ('00000000-0000-4000-8000-' || lpad(to_hex(1 + floor(random() * 10)::int), 12, '0'))::uuid,
       CASE floor(random() * 4)::int
           WHEN 0 THEN '0770' || lpad(floor(random() * 300)::text, 7, '0')
           WHEN 1 THEN '+964 770' || lpad(floor(random() * 300)::text, 7, '0')
           WHEN 2 THEN '٠٧٧٠' || lpad(floor(random() * 300)::text, 7, '0')
           ELSE (ARRAY[NULL, ''])[1 + floor(random() * 2)::int] END,
       (ARRAY['pending', 'confirmed', 'delivered', 'completed', 'completed', 'cancelled', 'pending_checkout'])[1 + floor(random() * 7)::int],
       (ARRAY['BGD', 'BSR', 'NJF', '', NULL])[1 + floor(random() * 5)::int],
       (ARRAY['BGD', 'ERB', '', NULL, NULL])[1 + floor(random() * 5)::int],
       c, c,
       CASE WHEN random() < 0.05 THEN c END,
       random() < 0.05,
       CASE WHEN random() < 0.03 THEN 'stock_taken' END
  FROM (SELECT now() - interval '3 hours' - (random() * 60 || ' days')::interval AS c FROM generate_series(1, 3000)) x;
INSERT INTO public.orders (tenant_id, phone, status, created_at, updated_at, is_test)
SELECT '00000000-0000-4000-8000-00000000000b', '07701234567', 'completed', now() - interval '1 day', now() - interval '1 day', true
  FROM generate_series(1, 5);

-- Run 1: every shop counted for the first time.
CREATE TEMP TABLE t1 AS SELECT clock_timestamp() AS t;
SELECT public.refresh_tenant_public_stats();
SELECT pg_temp.same('first run', (SELECT t FROM t1));
SELECT pg_temp.check((SELECT count(*) FROM public.tenant_public_stats) = 10, 'a row per shop with counted orders, none for 11 or 12');
SELECT pg_temp.check((SELECT bool_and(counts_refreshed_at = refreshed_at) FROM public.tenant_public_stats), 'counts_refreshed_at set');

-- The run before this one, an hour and a half ago: shops 1 to 6 counted then.
UPDATE public.tenant_public_stats
   SET counts_refreshed_at = now() - interval '90 minutes', refreshed_at = now() - interval '90 minutes';
-- Changes since: shop 1 new orders, shop 2 a status change, shop 3 a delete,
-- shop 4 a phone edit, shop 5 a governorate edit, shop 6 a change that
-- committed late (stamped 100 minutes ago, before the run, but committed after it). Shops 7 to
-- 10 nothing. Shop 9 every order now a test order, written 2 hours ago (so it
-- is not seen as changed until its row says otherwise): see below.
INSERT INTO public.orders (tenant_id, phone, status, governorate_code)
SELECT '00000000-0000-4000-8000-000000000001', '0771' || lpad(g::text, 7, '0'), 'completed', 'DHK'
  FROM generate_series(1, 7) g;
UPDATE public.orders SET status = 'completed'
 WHERE id = (SELECT id FROM public.orders WHERE tenant_id = '00000000-0000-4000-8000-000000000002'
               AND status = 'pending' AND deleted_at IS NULL AND NOT is_test AND take_kind IS NULL LIMIT 1);
UPDATE public.orders SET deleted_at = now()
 WHERE id IN (SELECT id FROM public.orders WHERE tenant_id = '00000000-0000-4000-8000-000000000003'
                AND status = 'completed' AND deleted_at IS NULL LIMIT 3);
UPDATE public.orders SET phone = '07799999999'
 WHERE id IN (SELECT id FROM public.orders WHERE tenant_id = '00000000-0000-4000-8000-000000000004'
                AND phone LIKE '0770%' AND deleted_at IS NULL LIMIT 4);
UPDATE public.orders SET validated_governorate_code = 'SUL'
 WHERE id IN (SELECT id FROM public.orders WHERE tenant_id = '00000000-0000-4000-8000-000000000005' LIMIT 4);
ALTER TABLE public.orders DISABLE TRIGGER trg_orders_updated_at;
UPDATE public.orders SET status = 'completed', updated_at = now() - interval '100 minutes'
 WHERE id IN (SELECT id FROM public.orders WHERE tenant_id = '00000000-0000-4000-8000-000000000006'
                AND status = 'confirmed' AND deleted_at IS NULL AND NOT is_test AND take_kind IS NULL LIMIT 2);
-- Shop 7: nothing changes, but its orders age: this week's orders are now 3
-- days older (its first order, weeks back, stays first).
UPDATE public.orders SET created_at = created_at - interval '3 days'
 WHERE tenant_id = '00000000-0000-4000-8000-000000000007'
   AND created_at > now() - interval '7 days';
ALTER TABLE public.orders ENABLE TRIGGER trg_orders_updated_at;
UPDATE public.orders SET is_test = true WHERE tenant_id = '00000000-0000-4000-8000-000000000009';
-- Shop 10: every order removed outright (no updated_at left behind). Shop 12,
-- no orders, holds a row from before this rule (never counted under it).
DELETE FROM public.orders WHERE tenant_id = '00000000-0000-4000-8000-00000000000a';
INSERT INTO public.tenant_public_stats (tenant_id, customers, refreshed_at)
VALUES ('00000000-0000-4000-8000-00000000000c', 1, now() - interval '90 minutes');

CREATE TEMP TABLE before AS SELECT * FROM public.tenant_public_stats;
CREATE TEMP TABLE t2 AS SELECT clock_timestamp() AS t;
SELECT public.refresh_tenant_public_stats();
SELECT pg_temp.same('second run', (SELECT t FROM t2));
SELECT pg_temp.check((SELECT count(*) FROM public.tenant_public_stats WHERE counts_refreshed_at >= (SELECT t FROM t2)) = 6,
                     'only shops 1 to 6 are counted again (9, 10 and 12 lost their rows)');
SELECT pg_temp.check(NOT EXISTS (SELECT 1 FROM public.tenant_public_stats
                                  WHERE tenant_id IN ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-00000000000c')),
                     'a shop with no order left keeps no stale row');
SELECT pg_temp.check(NOT EXISTS (SELECT 1 FROM public.tenant_public_stats WHERE tenant_id = '00000000-0000-4000-8000-000000000009'),
                     'a shop whose orders all left the counts has no row');
SELECT pg_temp.check((SELECT s.orders_7d < b.orders_7d FROM public.tenant_public_stats s JOIN before b USING (tenant_id)
                       WHERE tenant_id = '00000000-0000-4000-8000-000000000007'),
                     'shop 7''s week falls as its orders age, with no change');
SELECT pg_temp.check((SELECT s.counts_refreshed_at = b.counts_refreshed_at FROM public.tenant_public_stats s JOIN before b USING (tenant_id)
                       WHERE tenant_id = '00000000-0000-4000-8000-000000000008'),
                     'shop 8''s counts are not worked out again');
SELECT pg_temp.check((SELECT s.customers <> b.customers OR s.completed_orders <> b.completed_orders
                        FROM public.tenant_public_stats s JOIN before b USING (tenant_id)
                       WHERE tenant_id = '00000000-0000-4000-8000-000000000001'),
                     'shop 1''s new orders count');

-- Run 3 straight after: nothing changed; every row still the whole count.
CREATE TEMP TABLE t3 AS SELECT clock_timestamp() AS t;
SELECT public.refresh_tenant_public_stats();
SELECT pg_temp.same('third run', (SELECT t FROM t3));
SELECT pg_temp.check(NOT EXISTS (SELECT 1 FROM public.cron_refresh_state WHERE job = 'tenant_public_stats'),
                     'the old skip state is gone');
