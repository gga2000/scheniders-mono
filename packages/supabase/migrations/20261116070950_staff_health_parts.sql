-- Staff console: the health score's three parts, from the database.
--
-- The list already filters on staff_health_score. The number staff SEE was
-- still worked out in the browser, in five places, each with its own copy of
-- the formula:
--   * the shop dialog added up the orders of EVERY usage month, the list took
--     the newest month, so one shop showed two scores (a paying shop with
--     20,000 IQD, 60 orders last month and 5 this month: 75 in the list, 85
--     in its dialog);
--   * the comparison view read a health_score no API sent, and showed 0.
--
-- staff_health_parts is now the one place the formula lives: what the shop's
-- status, wallet balance and newest usage month each add to (or take from) 50.
-- staff_health_score is 50 plus those parts, kept between 0 and 100: the same
-- numbers as before, for every shop.
--
-- Read-only. The service role only, like the other staff_ functions.

CREATE OR REPLACE FUNCTION public.staff_health_parts(shop public.tenants)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
           'status', CASE shop.status WHEN 'active' THEN 15 WHEN 'trial' THEN 5 WHEN 'suspended' THEN -20 ELSE 0 END,
           'wallet', CASE WHEN b.balance > 50000 THEN 15 WHEN b.balance > 10000 THEN 5 ELSE -10 END,
           'orders', CASE WHEN u.orders > 50 THEN 15 WHEN u.orders > 10 THEN 10 WHEN u.orders > 0 THEN 5 ELSE 0 END
         )
  FROM (SELECT public.staff_wallet_balance(shop) AS balance) b
  CROSS JOIN (
        SELECT coalesce((
                 SELECT ut.orders_count
                 FROM public.usage_tracking ut
                 WHERE ut.tenant_id = shop.id
                 ORDER BY ut.year DESC, ut.month DESC
                 LIMIT 1
               ), 0) AS orders
  ) u;
$$;

-- The list's health score, 0 to 100: 50 plus the three parts.
CREATE OR REPLACE FUNCTION public.staff_health_score(shop public.tenants)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT greatest(0, least(100,
           50 + (p.parts ->> 'status')::integer + (p.parts ->> 'wallet')::integer + (p.parts ->> 'orders')::integer
         ))
  FROM (SELECT public.staff_health_parts(shop) AS parts) p;
$$;

REVOKE ALL ON FUNCTION public.staff_health_parts(public.tenants) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staff_health_parts(public.tenants) TO service_role;
