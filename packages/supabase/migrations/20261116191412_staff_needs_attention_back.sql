-- The old Merchants page is back (Ali, 16 Nov): its "Needs attention" filter
-- and the stats strip read staff_needs_attention, which #1174 dropped when the
-- one-table list replaced that page. Same rule as before (migration
-- staff_list_filters): paused or cancelled, a trial that ends within 3 days
-- (or has ended), under 5,000 IQD in the wallet, or locked for an unpaid trial
-- or month. Service role only, like the other staff_* fields.
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

REVOKE ALL ON FUNCTION public.staff_needs_attention(public.tenants) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staff_needs_attention(public.tenants) TO service_role;
