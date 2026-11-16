-- Staff console: the health score's "orders" part reads the shop's real orders.
--
-- It read usage_tracking.orders_count, the plan's own counter. That counter
-- is not the shop's orders: the merchant app adds one when an order is
-- entered there (and for a replacement), store checkout orders never reach
-- it, a removed order stays in it, and it starts again at each renewal.
-- Live on 16 Nov: one shop had 293 orders this month and a counter of 42;
-- a trial shop with no order at all had a counter of 2. No plan limits
-- orders today, so nothing else needs the counter.
--
-- The part now counts admin_order_facts (no deleted, draft, test, practice
-- or till-take rows, never the demo store) over the 30 Baghdad days that end
-- today: the same orders and window as the Merchants list's "orders, 30 days"
-- (admin_merchant_list_stats). The ladder is unchanged: over 50 adds 15,
-- over 10 adds 10, any adds 5. A month boundary no longer drops every shop
-- to 0 orders on the 1st.
--
-- staff_health_score is 50 plus the parts and is not changed. Read-only.
-- The service role only, like the other staff_ functions.

CREATE OR REPLACE FUNCTION public.staff_health_parts(shop public.tenants)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
           'status', CASE shop.status WHEN 'active' THEN 15 WHEN 'trial' THEN 5 WHEN 'suspended' THEN -20 ELSE 0 END,
           'wallet', CASE WHEN b.balance > 50000 THEN 15 WHEN b.balance > 10000 THEN 5 ELSE -10 END,
           'orders', CASE WHEN o.orders > 50 THEN 15 WHEN o.orders > 10 THEN 10 WHEN o.orders > 0 THEN 5 ELSE 0 END
         )
  FROM (SELECT public.staff_wallet_balance(shop) AS balance) b
  CROSS JOIN (SELECT (now() AT TIME ZONE 'Asia/Baghdad')::date AS today) d
  CROSS JOIN LATERAL (
        SELECT count(*) AS orders
        FROM public.admin_order_facts f
        WHERE f.tenant_id = shop.id
          AND f.created_at >= ((d.today - 29)::timestamp AT TIME ZONE 'Asia/Baghdad')
          AND f.created_at < ((d.today + 1)::timestamp AT TIME ZONE 'Asia/Baghdad')
  ) o;
$$;

REVOKE ALL ON FUNCTION public.staff_health_parts(public.tenants) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staff_health_parts(public.tenants) TO service_role;
