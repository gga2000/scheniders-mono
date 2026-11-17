-- Staff console: a shop with exactly 10,000 IQD is "low", not "critical",
-- on every screen.
--
-- Home's wallet tile ("10,000 to 50,000 IQD") and the Merchants balance
-- filter ("Low (10K-50K)", staff_wallet_balance >= 10000) put a wallet of
-- exactly 10,000 IQD in the low band. The health score's wallet part alone
-- put it in the critical band (-10, "over 10,000" adds 5), so that shop's
-- score was 15 points lower than the band it showed in. The part now adds 5
-- from 10,000 IQD. Nothing else changes: over 50,000 adds 15, under 10,000
-- takes 10, and the status and orders parts are as before.
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
           'wallet', CASE WHEN b.balance > 50000 THEN 15 WHEN b.balance >= 10000 THEN 5 ELSE -10 END,
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
