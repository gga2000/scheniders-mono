-- =============================================================================
-- claim_tenant_slug + the foreign-history guard on tenants: regression check
-- =============================================================================
--
-- WHAT THIS PROVES (after 20261022090000_tenant_slug_claim.sql is applied)
--   Catalog:
--     * claim_tenant_slug and tenant_slug_lock are executable by service_role
--       only (not PUBLIC, anon, authenticated);
--     * the BEFORE INSERT OR UPDATE OF slug trigger
--       tenants_slug_not_in_foreign_history exists on tenants and is enabled;
--     * anon and authenticated hold no INSERT/UPDATE/DELETE/TRUNCATE on
--       tenant_slug_history.
--   Behaviour, on synthetic tenants created inside this transaction:
--     * store A renames a -> a2: tenants.slug is a2 and history holds a -> A;
--     * store B claiming A's old slug through claim_tenant_slug fails with
--       23505, B keeps its slug, and A's history row is still there;
--     * B writing that slug directly (UPDATE tenants) fails with 23505;
--     * a NEW tenant inserted on that slug (the signup path) fails with 23505;
--     * A taking back its own old slug succeeds: history drops a -> A and
--       records a2 -> A;
--     * live: claiming zahraa-beauty's old link tenant-1783087997714 as
--       another store fails with 23505 and its history row stays (skipped
--       with a NOTICE if that row no longer exists).
--   Not covered: two real concurrent sessions. The advisory locks in the
--   definitions are the mechanism; a single script cannot open a second
--   session.
--
-- SAFE TO RUN AGAINST PRODUCTION
--   Every row it writes is synthetic or inside BEGIN ... ROLLBACK; nothing
--   persists. The live check only attempts a claim that must fail. No id is
--   printed.
--
-- HOW TO RUN
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f packages/supabase/tests/tenant_slug_claim.sql
--   or paste into the Supabase MCP execute_sql tool, as postgres.
--
-- RESULT
--   One row: 'ALL ASSERTIONS PASSED', or 'FAILED' plus every failing check.
--   Before the migration it fails on the missing functions and trigger.
-- =============================================================================

BEGIN;

SELECT set_config('tt.failures', '', true);

-- ---------------------------------------------------------------- catalog
DO $$
DECLARE
    fails text := '';
    fn text;
    r text;
BEGIN
    FOREACH fn IN ARRAY ARRAY['public.claim_tenant_slug(uuid,text)', 'public.tenant_slug_lock(text)'] LOOP
        IF to_regprocedure(fn) IS NULL THEN
            fails := fails || format('%s missing; ', fn);
            CONTINUE;
        END IF;
        IF NOT has_function_privilege('service_role', fn, 'EXECUTE') THEN
            fails := fails || format('service_role cannot execute %s; ', fn);
        END IF;
        FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
            IF has_function_privilege(r, fn, 'EXECUTE') THEN
                fails := fails || format('%s can execute %s; ', r, fn);
            END IF;
        END LOOP;
    END LOOP;

    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger t
         WHERE t.tgrelid = 'public.tenants'::regclass
           AND t.tgname = 'tenants_slug_not_in_foreign_history'
           AND t.tgenabled <> 'D'
           AND NOT t.tgisinternal
    ) THEN
        fails := fails || 'tenants_slug_not_in_foreign_history trigger missing or disabled; ';
    END IF;

    FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        IF has_table_privilege(r, 'public.tenant_slug_history', 'INSERT,UPDATE,DELETE,TRUNCATE') THEN
            fails := fails || format('%s can write tenant_slug_history; ', r);
        END IF;
    END LOOP;

    PERFORM set_config('tt.failures', current_setting('tt.failures') || fails, true);
END $$;

-- -------------------------------------------------------------- behaviour
DO $$
DECLARE
    fails text := '';
    sfx text := substr(md5(random()::text), 1, 8);
    slug_a text := 'tt-a-' || sfx;
    slug_a2 text := 'tt-a2-' || sfx;
    slug_b text := 'tt-b-' || sfx;
    tenant_a uuid;
    tenant_b uuid;
    prev text;
    owner uuid;
BEGIN
    IF to_regprocedure('public.claim_tenant_slug(uuid,text)') IS NULL THEN
        PERFORM set_config('tt.failures', current_setting('tt.failures')
            || 'behaviour skipped: claim_tenant_slug missing; ', true);
        RETURN;
    END IF;

    INSERT INTO public.tenants (business_name, slug, plan, status)
    VALUES ('TT Slug A', slug_a, 'starter', 'trial') RETURNING id INTO tenant_a;
    INSERT INTO public.tenants (business_name, slug, plan, status)
    VALUES ('TT Slug B', slug_b, 'starter', 'trial') RETURNING id INTO tenant_b;

    -- A renames a -> a2.
    prev := public.claim_tenant_slug(tenant_a, slug_a2);
    IF prev IS DISTINCT FROM slug_a THEN
        fails := fails || format('rename returned %s, not the old slug; ', prev);
    END IF;
    IF (SELECT slug FROM public.tenants WHERE id = tenant_a) IS DISTINCT FROM slug_a2 THEN
        fails := fails || 'rename did not move A to a2; ';
    END IF;
    SELECT tenant_id INTO owner FROM public.tenant_slug_history WHERE old_slug = slug_a;
    IF owner IS DISTINCT FROM tenant_a THEN
        fails := fails || 'rename did not record a -> A in history; ';
    END IF;

    -- B claims A's old slug through the RPC.
    BEGIN
        PERFORM public.claim_tenant_slug(tenant_b, slug_a);
        fails := fails || 'B claimed A''s old slug through claim_tenant_slug; ';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
    IF (SELECT slug FROM public.tenants WHERE id = tenant_b) IS DISTINCT FROM slug_b THEN
        fails := fails || 'B lost its slug after a refused claim; ';
    END IF;
    SELECT tenant_id INTO owner FROM public.tenant_slug_history WHERE old_slug = slug_a;
    IF owner IS DISTINCT FROM tenant_a THEN
        fails := fails || 'A''s history row did not survive B''s claim; ';
    END IF;

    -- B writes it directly, and a new store is inserted on it.
    BEGIN
        UPDATE public.tenants SET slug = slug_a WHERE id = tenant_b;
        fails := fails || 'direct UPDATE took A''s old slug; ';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
    BEGIN
        INSERT INTO public.tenants (business_name, slug, plan, status)
        VALUES ('TT Slug C', slug_a, 'starter', 'trial');
        fails := fails || 'a new tenant was inserted on A''s old slug; ';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;

    -- A takes back its own old slug.
    BEGIN
        prev := public.claim_tenant_slug(tenant_a, slug_a);
        IF prev IS DISTINCT FROM slug_a2 THEN
            fails := fails || format('reclaim returned %s, not a2; ', prev);
        END IF;
        IF EXISTS (SELECT 1 FROM public.tenant_slug_history WHERE old_slug = slug_a) THEN
            fails := fails || 'reclaim left a -> A in history (self-redirect); ';
        END IF;
        SELECT tenant_id INTO owner FROM public.tenant_slug_history WHERE old_slug = slug_a2;
        IF owner IS DISTINCT FROM tenant_a THEN
            fails := fails || 'reclaim did not record a2 -> A in history; ';
        END IF;
    EXCEPTION WHEN OTHERS THEN
        fails := fails || format('A could not take back its own old slug: %s %s; ', SQLSTATE, SQLERRM);
    END;

    PERFORM set_config('tt.failures', current_setting('tt.failures') || fails, true);
END $$;

-- ------------------------------------------- live: zahraa-beauty's old link
DO $$
DECLARE
    fails text := '';
    live_owner uuid;
    other uuid;
    owner_after uuid;
BEGIN
    IF to_regprocedure('public.claim_tenant_slug(uuid,text)') IS NULL THEN
        RETURN;
    END IF;
    SELECT tenant_id INTO live_owner
      FROM public.tenant_slug_history WHERE old_slug = 'tenant-1783087997714';
    IF live_owner IS NULL THEN
        RAISE NOTICE 'live check skipped: tenant-1783087997714 has no history row';
        RETURN;
    END IF;
    INSERT INTO public.tenants (business_name, slug, plan, status)
    VALUES ('TT Slug Live', 'tt-live-' || substr(md5(random()::text), 1, 8), 'starter', 'trial')
    RETURNING id INTO other;

    BEGIN
        PERFORM public.claim_tenant_slug(other, 'tenant-1783087997714');
        fails := fails || 'another store claimed tenant-1783087997714; ';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
    SELECT tenant_id INTO owner_after
      FROM public.tenant_slug_history WHERE old_slug = 'tenant-1783087997714';
    IF owner_after IS DISTINCT FROM live_owner THEN
        fails := fails || 'tenant-1783087997714 history row changed owner or vanished; ';
    END IF;

    PERFORM set_config('tt.failures', current_setting('tt.failures') || fails, true);
END $$;

SELECT CASE WHEN current_setting('tt.failures') = '' THEN 'ALL ASSERTIONS PASSED' ELSE 'FAILED' END AS status,
       nullif(current_setting('tt.failures'), '') AS failures;

ROLLBACK;
