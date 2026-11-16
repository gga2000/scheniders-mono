-- Staff console, Merchants list: the three facts its filters ask about, as
-- functions over the shop row.
--
-- A function over the row can be filtered and sorted like a column through the
-- API (the same way as merchant_code), so "Needs attention", the balance
-- filter and the health filter now run in the database, over every shop,
-- before the list is cut into pages. Until now:
--   * the balance and health filters ran in the API route AFTER paging: a page
--     of 50 could come back with 3 shops, and the count above the list was the
--     unfiltered one;
--   * "Needs attention" was worked out twice in TypeScript (list and header),
--     from status, trial date and balance only, so a locked shop (trial ended
--     unpaid, or month unpaid) with 5,000 IQD or more in its wallet was left out.
--
-- The rules are the ones the console already used; the only new one is that a
-- locked shop always needs attention.
--
-- Read-only. The service role only: nothing else needs them.

-- The wallet balance in IQD; a shop with no wallet row has 0.
CREATE OR REPLACE FUNCTION public.staff_wallet_balance(shop public.tenants)
RETURNS numeric
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT coalesce((SELECT w.balance_iqd FROM public.wallet w WHERE w.tenant_id = shop.id), 0);
$$;

-- Whether staff should look at the shop: paused or cancelled, a trial that
-- ends within 3 days (or has ended), under 5,000 IQD in the wallet, or locked
-- for an unpaid trial or month.
CREATE OR REPLACE FUNCTION public.staff_needs_attention(shop public.tenants)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT shop.status IN ('suspended', 'cancelled')
      OR (shop.status = 'trial' AND shop.trial_ends_at IS NOT NULL AND shop.trial_ends_at <= now() + interval '3 days')
      OR public.staff_wallet_balance(shop) < 5000
      OR EXISTS (SELECT 1 FROM public.tenant_billing_lock(shop.id));
$$;

-- The list's health score, 0 to 100: 50, plus or minus the shop's status, its
-- wallet balance and the orders of its newest usage month.
CREATE OR REPLACE FUNCTION public.staff_health_score(shop public.tenants)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT greatest(0, least(100,
           50
           + CASE shop.status WHEN 'active' THEN 15 WHEN 'trial' THEN 5 WHEN 'suspended' THEN -20 ELSE 0 END
           + CASE WHEN b.balance > 50000 THEN 15 WHEN b.balance > 10000 THEN 5 ELSE -10 END
           + CASE WHEN u.orders > 50 THEN 15 WHEN u.orders > 10 THEN 10 WHEN u.orders > 0 THEN 5 ELSE 0 END
         ))
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

REVOKE ALL ON FUNCTION public.staff_wallet_balance(public.tenants) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.staff_needs_attention(public.tenants) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.staff_health_score(public.tenants) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staff_wallet_balance(public.tenants) TO service_role;
GRANT EXECUTE ON FUNCTION public.staff_needs_attention(public.tenants) TO service_role;
GRANT EXECUTE ON FUNCTION public.staff_health_score(public.tenants) TO service_role;
