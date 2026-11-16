-- get_finance_summary's grants, restated beside its definition. 20261116024144
-- added the billing-lock check with CREATE OR REPLACE, which keeps the grants
-- (live: authenticated and service_role may execute; anon and PUBLIC may not).
-- That file did not repeat them, so the newest file defining the function no
-- longer showed who may call it (apps/platform/lib/finance-summary-migration.test.ts
-- checks that file). The body is the same as 20261116024144's; only the grants
-- are new.
--
-- Rollback: nothing to undo; the grants match what was live before.

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
REVOKE ALL ON FUNCTION public.get_finance_summary(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_finance_summary(uuid, date, date) TO authenticated;
