-- Staff console: Shops at risk knows a locked shop (staff console audit,
-- round 7, Should fix 9).
--
-- The Health page's "Shops at risk" scored low balance, no orders and
-- suspension. A shop locked because its trial ended unpaid, or its month was
-- not paid, still reads "trial" or "active" in tenants.status, so it was never
-- named, though it is the shop most likely to leave.
--
-- admin_locked_shops() answers every locked shop with its reason, from the
-- same rule the Merchants list and the shop page read (tenant_billing_lock),
-- so the three never disagree. It is one object, shop id to reason, so a long
-- list is never cut at the API's 1,000 rows. Only shops whose status can be
-- locked are asked. Service role only.
--
-- Rollback: DROP FUNCTION public.admin_locked_shops();

CREATE FUNCTION public.admin_locked_shops()
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO ''
AS $$
    SELECT coalesce(jsonb_object_agg(t.id, bl.reason), '{}'::jsonb)
    FROM public.tenants t
    CROSS JOIN LATERAL public.tenant_billing_lock(t.id) bl
    WHERE t.status IN ('trial', 'active');
$$;

REVOKE ALL ON FUNCTION public.admin_locked_shops() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_locked_shops() TO service_role;

COMMENT ON FUNCTION public.admin_locked_shops() IS
    'Every billing-locked shop (tenant_billing_lock) as {shop id: reason}, for the staff console''s Shops at risk. Service role only.';
