-- The Locked tab on the staff console Merchants list (board s2): a shop is
-- locked when tenant_billing_lock says so, the same rule the row's status
-- words read. A computed field on tenants, so the list API can filter and
-- count it in the database like the other tabs.
--
-- staff_needs_attention served the old "needs attention" filter. The one-table
-- list (#1171) removed that filter and nothing else reads the function, so it
-- goes.
CREATE OR REPLACE FUNCTION public.staff_locked(shop public.tenants)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (SELECT 1 FROM public.tenant_billing_lock(shop.id));
$$;

REVOKE ALL ON FUNCTION public.staff_locked(public.tenants) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staff_locked(public.tenants) TO service_role;

DROP FUNCTION IF EXISTS public.staff_needs_attention(public.tenants);
