-- The billing lock closes the money pages on the server too (Fermi handoff
-- A1, "done when": reports, finance and settings show the lock screen AND
-- their APIs refuse). A locked store (trial ended or month unpaid) keeps its
-- orders, shipping, labels, export, returns and paying; the dashboard shows
-- the lock screen everywhere else, and the platform's API routes and Claude
-- tools refuse with 402. This migration closes the store's finance data:
--
-- 1. my_billing_locked_tenant_ids(): the caller's stores that are locked, for
--    policies (evaluated once per query, as get_user_tenant_ids()).
-- 2. expenses: a RESTRICTIVE policy for signed-in users, so a locked store's
--    expenses can be neither read nor written from the app. Server jobs (the
--    Meta ads sync) use the service role and are not affected.
-- 3. get_finance_summary refuses a locked store with SQLSTATE PT402, which
--    PostgREST answers as HTTP 402. The membership check comes first, so a
--    stranger still gets 42501.
--
-- Orders are not touched: the orders page stays open while locked.
--
-- Rollback: DROP POLICY billing_lock_closed ON public.expenses;
--           re-run 20261114162646_get_finance_summary.sql;
--           DROP FUNCTION public.my_billing_locked_tenant_ids();

CREATE OR REPLACE FUNCTION public.my_billing_locked_tenant_ids()
RETURNS SETOF uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    RETURN QUERY
        SELECT u.id
          FROM public.get_user_tenant_ids() AS u(id)
         WHERE EXISTS (SELECT 1 FROM public.tenant_billing_lock(u.id));
END;
$function$;
REVOKE ALL ON FUNCTION public.my_billing_locked_tenant_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_billing_locked_tenant_ids() TO authenticated, service_role;

DROP POLICY IF EXISTS billing_lock_closed ON public.expenses;
CREATE POLICY billing_lock_closed ON public.expenses
    AS RESTRICTIVE
    FOR ALL
    TO authenticated
    USING (tenant_id NOT IN (SELECT public.my_billing_locked_tenant_ids()))
    WITH CHECK (tenant_id NOT IN (SELECT public.my_billing_locked_tenant_ids()));

CREATE OR REPLACE FUNCTION public.get_finance_summary(_tenant_id uuid, _from date, _to date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    IF _tenant_id IS NULL OR _from IS NULL OR _to IS NULL THEN
        RAISE EXCEPTION 'tenant and period are required' USING ERRCODE = '22023';
    END IF;
    IF abs(_to - _from) > 731 THEN
        RAISE EXCEPTION 'period is longer than two years' USING ERRCODE = '22023';
    END IF;
    IF NOT (
        _tenant_id IN (SELECT public.get_user_tenant_ids())
        AND (public.is_tenant_admin(_tenant_id)
             OR public.has_tenant_permission(_tenant_id, 'system.financials.view'))
    ) THEN
        RAISE EXCEPTION 'not allowed to read this shop''s finances' USING ERRCODE = '42501';
    END IF;
    -- Finances are closed while the store's bill is unpaid (Fermi A1).
    IF EXISTS (SELECT 1 FROM public.tenant_billing_lock(_tenant_id)) THEN
        RAISE EXCEPTION 'this store is locked until its bill is paid' USING ERRCODE = 'PT402';
    END IF;
    RETURN public.finance_summary_core(_tenant_id, _from, _to);
END;
$function$;
