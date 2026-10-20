-- =============================================================================
-- convert_lead_atomic + one-tenant-per-lead: regression check
-- =============================================================================
--
-- WHAT THIS PROVES (after 20261020163000_convert_lead_atomic.sql and
-- 20261020205234_tenants_one_per_lead.sql are applied)
--   Catalog:
--     * EXECUTE is held by service_role only (not PUBLIC, anon, authenticated);
--     * SECURITY DEFINER with a pinned search_path;
--     * the definition takes the lead row lock (FOR UPDATE) and only flips a
--       prospect that is still is_prospect AND status = 'trial';
--     * the partial unique index tenants_prospect_lead_id_key exists.
--   Behaviour, on synthetic rows created inside this transaction:
--     * an authenticated JWT is refused with 42501 (body guard);
--     * a service_role JWT converts once, and a second call returns
--       already_converted with the same tenant and writes nothing: exactly one
--       tenant, subscription, wallet, conversion activity and commission;
--     * a lead whose status was edited back to 'new' but still carries
--       converted_tenant_id stays already_converted;
--     * an unknown id returns not_found;
--     * a 'limited' prospect store returns prospect_not_open and writes
--       nothing; once it is an open trial it converts in place (no new
--       tenant, is_prospect false, status active);
--     * a second tenant for the same lead (what build-store would insert
--       racing a convert) fails with unique_violation on
--       tenants_prospect_lead_id_key.
--   Not covered: two real concurrent sessions. The row lock asserted above is
--   the mechanism; a single script cannot open a second session.
--
-- SAFE TO RUN AGAINST PRODUCTION
--   Every row it writes is synthetic and created inside BEGIN ... ROLLBACK;
--   nothing persists. Existing rows are only read: one user_profiles id is
--   borrowed as the acting admin / lead owner (passed through a
--   transaction-local setting, never printed). The triggers on the touched
--   tables (lead scoring, wallet-low notification, storefront write block) are
--   all transactional and roll back with it.
--
-- HOW TO RUN
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f packages/supabase/tests/convert_lead_atomic.sql
--   or paste into the Supabase MCP execute_sql tool, as postgres.
--
-- RESULT
--   One row: status 'ALL ASSERTIONS PASSED', or 'FAILED' plus the failing
--   checks. Every check runs even when an earlier one fails.
-- =============================================================================

BEGIN;

SELECT set_config('tt.failures', '', true);

SELECT set_config('tt.actor', coalesce((
    SELECT id::text FROM public.user_profiles ORDER BY created_at, id LIMIT 1), ''), true);

-- ---------------------------------------------------------------------------
-- 1. Catalog
-- ---------------------------------------------------------------------------
DO $catalog$
DECLARE
    fails text := '';
    fn constant regprocedure := to_regprocedure('public.convert_lead_atomic(uuid,uuid,text)');
    def text;
BEGIN
    IF fn IS NULL THEN
        PERFORM set_config('tt.failures', 'convert_lead_atomic(uuid,uuid,text) is missing; ', true);
        RETURN;
    END IF;

    IF has_function_privilege('anon', fn, 'execute') THEN fails := fails || 'anon can execute; '; END IF;
    IF has_function_privilege('authenticated', fn, 'execute') THEN fails := fails || 'authenticated can execute; '; END IF;
    IF NOT has_function_privilege('service_role', fn, 'execute') THEN fails := fails || 'service_role cannot execute; '; END IF;
    IF EXISTS (
        SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a
         WHERE p.oid = fn AND a.grantee = 0 AND a.privilege_type = 'EXECUTE'
    ) THEN
        fails := fails || 'PUBLIC holds EXECUTE; ';
    END IF;

    IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = fn) THEN
        fails := fails || 'not SECURITY DEFINER; ';
    END IF;
    IF NOT coalesce((SELECT proconfig FROM pg_proc WHERE oid = fn) @> ARRAY['search_path=public, pg_temp'], false) THEN
        fails := fails || 'search_path not pinned to public, pg_temp; ';
    END IF;

    def := pg_get_functiondef(fn);
    IF def NOT ILIKE '%FROM public.leads WHERE id = _lead_id FOR UPDATE%' THEN
        fails := fails || 'lead row lock (FOR UPDATE) missing; ';
    END IF;
    IF def NOT ILIKE '%AND is_prospect = true%AND status = ''trial''%' THEN
        fails := fails || 'open-prospect guard (is_prospect AND status = trial) missing; ';
    END IF;
    IF def NOT ILIKE '%IF auth.role() IS DISTINCT FROM ''service_role'' THEN%' THEN
        fails := fails || 'auth.role() service_role guard missing; ';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
         WHERE schemaname = 'public' AND tablename = 'tenants'
           AND indexname = 'tenants_prospect_lead_id_key'
           AND indexdef ILIKE 'CREATE UNIQUE INDEX%(prospect_lead_id) WHERE (prospect_lead_id IS NOT NULL)'
    ) THEN
        fails := fails || 'unique index tenants_prospect_lead_id_key missing; ';
    END IF;

    PERFORM set_config('tt.failures', current_setting('tt.failures') || fails, true);
END;
$catalog$;

-- ---------------------------------------------------------------------------
-- 2. Behaviour on synthetic rows
-- ---------------------------------------------------------------------------
DO $behaviour$
DECLARE
    fails text := '';
    actor uuid := nullif(current_setting('tt.actor'), '')::uuid;
    lead1 uuid;
    lead2 uuid;
    prospect uuid;
    res jsonb;
    res2 jsonb;
    t1 uuid;
    n bigint;
    cfg uuid;
BEGIN
    IF actor IS NULL THEN
        PERFORM set_config('tt.failures', current_setting('tt.failures') || 'no user_profiles row to act as admin; ', true);
        RETURN;
    END IF;

    -- A commission config that is certainly the latest active one, so the
    -- commission branch runs whatever the live configs are.
    INSERT INTO public.admin_commission_config (name, is_active, updated_at)
    VALUES ('tt convert_lead_atomic', true, now() + interval '1 day')
    RETURNING id INTO cfg;

    INSERT INTO public.leads (merchant_name, status, assigned_to)
    VALUES ('TT Convert Lead', 'interested', actor) RETURNING id INTO lead1;

    -- 2a. Body guard: an authenticated JWT is refused.
    PERFORM set_config('request.jwt.claims', json_build_object('sub', actor, 'role', 'authenticated')::text, true);
    BEGIN
        PERFORM public.convert_lead_atomic(lead1, actor, NULL);
        fails := fails || 'authenticated JWT was not refused; ';
    EXCEPTION
        WHEN insufficient_privilege THEN NULL;
        WHEN OTHERS THEN fails := fails || format('authenticated JWT raised %s, not 42501; ', SQLSTATE);
    END;
    IF EXISTS (SELECT 1 FROM public.tenants WHERE prospect_lead_id = lead1) THEN
        fails := fails || 'refused call still created a tenant; ';
    END IF;

    PERFORM set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);

    -- 2b. Convert, then convert again.
    res := public.convert_lead_atomic(lead1, actor, '  first  ');
    IF res->>'outcome' IS DISTINCT FROM 'converted' THEN
        fails := fails || format('first call returned %s; ', res);
    END IF;
    t1 := (res->>'tenant_id')::uuid;

    res2 := public.convert_lead_atomic(lead1, actor, 'second');
    IF res2->>'outcome' IS DISTINCT FROM 'already_converted' OR (res2->>'tenant_id')::uuid IS DISTINCT FROM t1 THEN
        fails := fails || format('second call returned %s; ', res2);
    END IF;

    SELECT count(*) INTO n FROM public.tenants WHERE prospect_lead_id = lead1;
    IF n <> 1 THEN fails := fails || format('%s tenants for one lead; ', n); END IF;
    SELECT count(*) INTO n FROM public.subscriptions WHERE tenant_id = t1;
    IF n <> 1 THEN fails := fails || format('%s subscriptions; ', n); END IF;
    SELECT count(*) INTO n FROM public.wallet WHERE tenant_id = t1;
    IF n <> 1 THEN fails := fails || format('%s wallets; ', n); END IF;
    SELECT count(*) INTO n FROM public.lead_activities
     WHERE lead_id = lead1 AND activity_type = 'conversion' AND created_by = actor AND description = 'first';
    IF n <> 1 THEN fails := fails || format('%s conversion activities (want 1, attributed, trimmed notes); ', n); END IF;
    SELECT count(*) INTO n FROM public.admin_employee_commissions
     WHERE lead_id = lead1 AND tenant_id = t1 AND admin_user_id = actor AND commission_config_id = cfg AND status = 'pending';
    IF n <> 1 THEN fails := fails || format('%s commissions; ', n); END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.tenants
         WHERE id = t1 AND status = 'active' AND NOT is_prospect AND plan = 'starter'
    ) THEN
        fails := fails || 'created tenant is not an active non-prospect starter; ';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.leads WHERE id = lead1 AND status = 'converted' AND converted_tenant_id = t1
    ) THEN
        fails := fails || 'lead not marked converted with its tenant; ';
    END IF;

    -- 2c. Status edited back by hand: converted_tenant_id still wins.
    UPDATE public.leads SET status = 'new' WHERE id = lead1;
    res := public.convert_lead_atomic(lead1, actor, NULL);
    IF res->>'outcome' IS DISTINCT FROM 'already_converted' OR (res->>'tenant_id')::uuid IS DISTINCT FROM t1 THEN
        fails := fails || format('status-reset lead returned %s; ', res);
    END IF;
    SELECT count(*) INTO n FROM public.subscriptions WHERE tenant_id = t1;
    IF n <> 1 THEN fails := fails || 'status-reset lead got another subscription; '; END IF;

    -- 2d. Unknown lead.
    res := public.convert_lead_atomic(gen_random_uuid(), actor, NULL);
    IF res->>'outcome' IS DISTINCT FROM 'not_found' THEN
        fails := fails || format('unknown lead returned %s; ', res);
    END IF;

    -- 2e. One tenant per lead: what build-store would insert for an
    --     already-converted lead (or racing a convert) is rejected.
    BEGIN
        INSERT INTO public.tenants (business_name, slug, plan, status, is_prospect, prospect_lead_id)
        VALUES ('TT dup', 'tt-dup-' || substr(md5(random()::text), 1, 8), 'starter', 'trial', true, lead1);
        fails := fails || 'second tenant for one lead was accepted; ';
    EXCEPTION
        WHEN unique_violation THEN
            IF SQLERRM NOT LIKE '%tenants_prospect_lead_id_key%' THEN
                fails := fails || format('duplicate tenant hit %s, not the lead index; ', SQLERRM);
            END IF;
    END;

    -- 2f. Prospect store: a paused one is not reopened; an open trial flips in place.
    INSERT INTO public.leads (merchant_name, status, assigned_to)
    VALUES ('TT Prospect Lead', 'store_built', actor) RETURNING id INTO lead2;
    INSERT INTO public.tenants (business_name, slug, plan, status, is_prospect, prospect_lead_id)
    VALUES ('TT Prospect', 'tt-prospect-' || substr(md5(random()::text), 1, 8), 'starter', 'limited', true, lead2)
    RETURNING id INTO prospect;
    UPDATE public.leads SET prospect_tenant_id = prospect WHERE id = lead2;

    res := public.convert_lead_atomic(lead2, actor, NULL);
    IF res->>'outcome' IS DISTINCT FROM 'prospect_not_open' THEN
        fails := fails || format('limited prospect returned %s; ', res);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = prospect AND status = 'limited' AND is_prospect) THEN
        fails := fails || 'limited prospect was modified; ';
    END IF;
    IF EXISTS (SELECT 1 FROM public.subscriptions WHERE tenant_id = prospect)
       OR EXISTS (SELECT 1 FROM public.wallet WHERE tenant_id = prospect)
       OR EXISTS (SELECT 1 FROM public.lead_activities WHERE lead_id = lead2)
       OR EXISTS (SELECT 1 FROM public.admin_employee_commissions WHERE lead_id = lead2)
       OR EXISTS (SELECT 1 FROM public.leads WHERE id = lead2 AND (status <> 'store_built' OR converted_tenant_id IS NOT NULL)) THEN
        fails := fails || 'prospect_not_open still wrote rows; ';
    END IF;

    UPDATE public.tenants SET status = 'trial' WHERE id = prospect;
    res := public.convert_lead_atomic(lead2, actor, NULL);
    IF res->>'outcome' IS DISTINCT FROM 'converted' OR (res->>'tenant_id')::uuid IS DISTINCT FROM prospect THEN
        fails := fails || format('open-trial prospect returned %s; ', res);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = prospect AND status = 'active' AND NOT is_prospect) THEN
        fails := fails || 'prospect not flipped to an active merchant; ';
    END IF;
    SELECT count(*) INTO n FROM public.tenants WHERE prospect_lead_id = lead2;
    IF n <> 1 THEN fails := fails || format('prospect conversion left %s tenants for the lead; ', n); END IF;

    PERFORM set_config('tt.failures', current_setting('tt.failures') || fails, true);
END;
$behaviour$;

SELECT CASE WHEN current_setting('tt.failures') = '' THEN 'ALL ASSERTIONS PASSED' ELSE 'FAILED' END AS status,
       nullif(current_setting('tt.failures'), '') AS failures;

ROLLBACK;
