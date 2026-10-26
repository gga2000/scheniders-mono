-- =============================================================================
-- capture_abandoned_cart: regression check
-- =============================================================================
--
-- WHAT THIS PROVES (after 20261021160000_abandoned_carts_consent_and_recovery_kind.sql
-- and 20261022000000_capture_abandoned_cart.sql are applied)
--   Catalog:
--     * EXECUTE is held by service_role only (not PUBLIC, anon, authenticated);
--     * SECURITY INVOKER (the caller's service role is what bypasses RLS);
--     * search_path is pinned to '' (every name in the body is qualified);
--     * it returns boolean, and the consent pair CHECK it relies on exists.
--   Behaviour, on synthetic rows created inside this transaction (now() is
--   the transaction start, so every timestamp the function writes equals it):
--     1. no row: inserts an open capture; consent_at + version only when a
--        version is passed;
--     2. open row, capture with no governorate/locale/consent (the cart
--        checkout_form beacon after a PDP capture): items, subtotal and
--        updated_at refresh; created_at, reminded_at, consent, governorate
--        and locale are kept;
--     3. open row, capture that brings them: governorate, locale and consent
--        are replaced, reminded_at is still kept;
--     4. recovered inside the window: returns false and the row is untouched
--        (the boundary: recovered window-1s ago stays, window ago reopens);
--     5. recovered longer ago: a new episode. recovered_at, reminded_at and
--        consent are cleared, created_at reset, governorate/locale/items come
--        from this capture, recovery_kind is NULL again;
--     6. the same, with consent: the reopened row carries the new consent;
--     7. the same phone at another store is a separate row and leaves this
--        one alone;
--     8. a zero, negative or NULL window raises 22023; a NULL required
--        argument raises 22004; neither writes anything.
--   Not covered: what the storefront route sends (route.test.ts pins that).
--
-- SAFE TO RUN AGAINST PRODUCTION
--   Every row it writes is synthetic and created inside BEGIN ... ROLLBACK;
--   nothing persists. Existing rows are only read: two tenant ids are
--   borrowed (passed through transaction-local settings, never printed).
--   Phones are 'tt-capture-<uuid>', which no normalized Iraqi mobile can
--   collide with. Recovered rows are seeded by INSERT with recovered_at
--   already set, so trg_log_cart_recovered_notification (AFTER UPDATE, fires
--   only when recovered_at goes NULL -> set) never runs; the function only
--   ever sets recovered_at to NULL.
--
-- HOW TO RUN
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f packages/supabase/tests/capture_abandoned_cart.sql
--   or, from packages/: supabase db query --linked -f supabase/tests/capture_abandoned_cart.sql
--   or paste into the Supabase MCP execute_sql tool, as postgres.
--
-- RESULT
--   One row: status 'ALL ASSERTIONS PASSED', or 'FAILED' plus the failing
--   checks. Every check runs even when an earlier one fails.
-- =============================================================================

BEGIN;

SELECT set_config('tt.failures', '', true);

SELECT set_config('tt.tenant', coalesce((
    SELECT id::text FROM public.tenants ORDER BY created_at, id LIMIT 1), ''), true);
SELECT set_config('tt.other_tenant', coalesce((
    SELECT id::text FROM public.tenants ORDER BY created_at, id OFFSET 1 LIMIT 1), ''), true);

-- ---------------------------------------------------------------------------
-- 1. Catalog
-- ---------------------------------------------------------------------------
DO $catalog$
DECLARE
    fails text := '';
    fn constant regprocedure :=
        to_regprocedure('public.capture_abandoned_cart(uuid,text,jsonb,integer,integer,text,text,text)');
BEGIN
    IF fn IS NULL THEN
        PERFORM set_config('tt.failures',
            'capture_abandoned_cart(uuid,text,jsonb,integer,integer,text,text,text) is missing; ', true);
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

    IF (SELECT prosecdef FROM pg_proc WHERE oid = fn) THEN
        fails := fails || 'SECURITY DEFINER, not INVOKER; ';
    END IF;
    IF NOT coalesce((SELECT proconfig FROM pg_proc WHERE oid = fn) @> ARRAY['search_path=""'], false) THEN
        fails := fails || 'search_path not pinned to empty; ';
    END IF;
    IF (SELECT prorettype FROM pg_proc WHERE oid = fn) <> 'boolean'::regtype THEN
        fails := fails || 'does not return boolean; ';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'public.abandoned_carts'::regclass
           AND conname = 'abandoned_carts_consent_pair'
           AND contype = 'c'
    ) THEN
        fails := fails || 'CHECK abandoned_carts_consent_pair missing; ';
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
    t uuid := nullif(current_setting('tt.tenant'), '')::uuid;
    t2 uuid := nullif(current_setting('tt.other_tenant'), '')::uuid;
    win constant integer := 600;
    old_items constant jsonb := '[{"product_id":"00000000-0000-4000-8000-000000000001","variant_id":null,"name":"old","quantity":1,"price":1000}]';
    new_items constant jsonb := '[{"product_id":"00000000-0000-4000-8000-000000000002","variant_id":null,"name":"new","quantity":2,"price":2500}]';
    p text;
    ok boolean;
    r public.abandoned_carts%ROWTYPE;
    before_row jsonb;
    n bigint;
BEGIN
    IF t IS NULL OR t2 IS NULL THEN
        PERFORM set_config('tt.failures', current_setting('tt.failures') || 'need two tenants to borrow; ', true);
        RETURN;
    END IF;

    -- 2.1 No row: insert. With consent, then without.
    p := 'tt-capture-' || gen_random_uuid();
    ok := public.capture_abandoned_cart(t, p, new_items, 5000, win, 'BGD', 'ar', 'sha256:aaaaaaaaaaaaaaaa');
    SELECT * INTO r FROM public.abandoned_carts WHERE tenant_id = t AND phone = p;
    IF ok IS DISTINCT FROM true THEN fails := fails || '1: insert did not return true; '; END IF;
    IF r.id IS NULL
       OR r.items IS DISTINCT FROM new_items OR r.subtotal_iqd IS DISTINCT FROM 5000
       OR r.governorate IS DISTINCT FROM 'BGD' OR r.locale IS DISTINCT FROM 'ar'
       OR r.consent_at IS DISTINCT FROM now() OR r.consent_text_version IS DISTINCT FROM 'sha256:aaaaaaaaaaaaaaaa'
       OR r.created_at IS DISTINCT FROM now() OR r.updated_at IS DISTINCT FROM now()
       OR r.reminded_at IS NOT NULL OR r.recovered_at IS NOT NULL OR r.recovery_kind IS NOT NULL THEN
        fails := fails || format('1: inserted row wrong: %s; ', to_jsonb(r) - 'tenant_id');
    END IF;

    p := 'tt-capture-' || gen_random_uuid();
    ok := public.capture_abandoned_cart(t, p, new_items, 5000, win);
    SELECT * INTO r FROM public.abandoned_carts WHERE tenant_id = t AND phone = p;
    IF ok IS DISTINCT FROM true OR r.id IS NULL
       OR r.consent_at IS NOT NULL OR r.consent_text_version IS NOT NULL
       OR r.governorate IS NOT NULL OR r.locale IS NOT NULL THEN
        fails := fails || format('1: insert without consent wrong (%s): %s; ', ok, to_jsonb(r) - 'tenant_id');
    END IF;

    -- 2.2 Open row, capture with nothing optional: refresh, keep the rest.
    p := 'tt-capture-' || gen_random_uuid();
    INSERT INTO public.abandoned_carts (tenant_id, phone, items, subtotal_iqd, governorate, locale,
                                        created_at, updated_at, reminded_at, consent_at, consent_text_version)
    VALUES (t, p, old_items, 1000, 'BGD', 'ar',
            now() - interval '1 hour', now() - interval '1 hour', now() - interval '30 minutes',
            now() - interval '1 hour', 'sha256:pdp0000000000000');
    ok := public.capture_abandoned_cart(t, p, new_items, 5000, win);
    SELECT * INTO r FROM public.abandoned_carts WHERE tenant_id = t AND phone = p;
    IF ok IS DISTINCT FROM true THEN fails := fails || '2: open refresh did not return true; '; END IF;
    IF r.items IS DISTINCT FROM new_items OR r.subtotal_iqd IS DISTINCT FROM 5000
       OR r.updated_at IS DISTINCT FROM now() THEN
        fails := fails || format('2: open row not refreshed: %s; ', to_jsonb(r) - 'tenant_id');
    END IF;
    IF r.created_at IS DISTINCT FROM now() - interval '1 hour'
       OR r.reminded_at IS DISTINCT FROM now() - interval '30 minutes'
       OR r.consent_at IS DISTINCT FROM now() - interval '1 hour'
       OR r.consent_text_version IS DISTINCT FROM 'sha256:pdp0000000000000'
       OR r.governorate IS DISTINCT FROM 'BGD' OR r.locale IS DISTINCT FROM 'ar'
       OR r.recovered_at IS NOT NULL THEN
        fails := fails || format('2: open row lost created_at/reminder/consent/governorate/locale: %s; ', to_jsonb(r) - 'tenant_id');
    END IF;
    SELECT count(*) INTO n FROM public.abandoned_carts WHERE tenant_id = t AND phone = p;
    IF n <> 1 THEN fails := fails || format('2: %s rows for one (tenant, phone); ', n); END IF;

    -- 2.3 Open row, capture that brings governorate, locale and consent.
    ok := public.capture_abandoned_cart(t, p, old_items, 1000, win, 'BSR', 'en', 'sha256:bbbbbbbbbbbbbbbb');
    SELECT * INTO r FROM public.abandoned_carts WHERE tenant_id = t AND phone = p;
    IF ok IS DISTINCT FROM true
       OR r.governorate IS DISTINCT FROM 'BSR' OR r.locale IS DISTINCT FROM 'en'
       OR r.consent_at IS DISTINCT FROM now() OR r.consent_text_version IS DISTINCT FROM 'sha256:bbbbbbbbbbbbbbbb'
       OR r.reminded_at IS DISTINCT FROM now() - interval '30 minutes'
       OR r.created_at IS DISTINCT FROM now() - interval '1 hour' THEN
        fails := fails || format('3: open row with new values wrong (%s): %s; ', ok, to_jsonb(r) - 'tenant_id');
    END IF;

    -- 2.4 Recovered inside the window: untouched, false. Boundary: window-1s.
    p := 'tt-capture-' || gen_random_uuid();
    INSERT INTO public.abandoned_carts (tenant_id, phone, items, subtotal_iqd, governorate, locale,
                                        created_at, updated_at, reminded_at, recovered_at,
                                        consent_at, consent_text_version)
    VALUES (t, p, old_items, 1000, 'BGD', 'ar',
            now() - interval '2 hours', now() - interval '2 hours', now() - interval '1 hour',
            now() - make_interval(secs => win - 1),
            now() - interval '2 hours', 'sha256:pdp0000000000000');
    SELECT to_jsonb(c) INTO before_row FROM public.abandoned_carts c WHERE tenant_id = t AND phone = p;
    ok := public.capture_abandoned_cart(t, p, new_items, 5000, win, 'BSR', 'en', 'sha256:bbbbbbbbbbbbbbbb');
    IF ok IS DISTINCT FROM false THEN fails := fails || format('4: fresh recovery returned %s, not false; ', ok); END IF;
    IF (SELECT to_jsonb(c) FROM public.abandoned_carts c WHERE tenant_id = t AND phone = p) IS DISTINCT FROM before_row THEN
        fails := fails || '4: fresh recovery was modified; ';
    END IF;
    IF (SELECT recovery_kind FROM public.abandoned_carts WHERE tenant_id = t AND phone = p) IS DISTINCT FROM 'after_reminder' THEN
        fails := fails || '4: kept recovery lost its after_reminder kind; ';
    END IF;

    -- Exactly the window ago: a new episode.
    p := 'tt-capture-' || gen_random_uuid();
    INSERT INTO public.abandoned_carts (tenant_id, phone, items, subtotal_iqd, created_at, updated_at, recovered_at)
    VALUES (t, p, old_items, 1000, now() - interval '1 hour', now() - interval '1 hour',
            now() - make_interval(secs => win));
    ok := public.capture_abandoned_cart(t, p, new_items, 5000, win);
    IF ok IS DISTINCT FROM true
       OR (SELECT recovered_at FROM public.abandoned_carts WHERE tenant_id = t AND phone = p) IS NOT NULL THEN
        fails := fails || format('4: recovery exactly the window ago was not reopened (%s); ', ok);
    END IF;

    -- 2.5 Recovered longer ago, capture without consent: a fresh open capture.
    p := 'tt-capture-' || gen_random_uuid();
    INSERT INTO public.abandoned_carts (tenant_id, phone, items, subtotal_iqd, governorate, locale,
                                        created_at, updated_at, reminded_at, recovered_at,
                                        consent_at, consent_text_version)
    VALUES (t, p, old_items, 1000, 'BGD', 'ar',
            now() - interval '1 day', now() - interval '2 hours', now() - interval '3 hours',
            now() - interval '2 hours',
            now() - interval '1 day', 'sha256:pdp0000000000000');
    ok := public.capture_abandoned_cart(t, p, new_items, 5000, win, NULL, 'en');
    SELECT * INTO r FROM public.abandoned_carts WHERE tenant_id = t AND phone = p;
    IF ok IS DISTINCT FROM true THEN fails := fails || '5: old recovery reopen did not return true; '; END IF;
    IF r.recovered_at IS NOT NULL OR r.reminded_at IS NOT NULL
       OR r.consent_at IS NOT NULL OR r.consent_text_version IS NOT NULL
       OR r.recovery_kind IS NOT NULL THEN
        fails := fails || format('5: reopened row kept recovery/reminder/consent: %s; ', to_jsonb(r) - 'tenant_id');
    END IF;
    IF r.created_at IS DISTINCT FROM now() OR r.updated_at IS DISTINCT FROM now()
       OR r.items IS DISTINCT FROM new_items OR r.subtotal_iqd IS DISTINCT FROM 5000
       OR r.governorate IS NOT NULL OR r.locale IS DISTINCT FROM 'en' THEN
        fails := fails || format('5: reopened row not reset to this capture: %s; ', to_jsonb(r) - 'tenant_id');
    END IF;

    -- 2.6 Recovered longer ago, capture with consent: the new consent.
    p := 'tt-capture-' || gen_random_uuid();
    INSERT INTO public.abandoned_carts (tenant_id, phone, items, subtotal_iqd,
                                        created_at, updated_at, reminded_at, recovered_at)
    VALUES (t, p, old_items, 1000, now() - interval '1 day', now() - interval '2 hours',
            now() - interval '3 hours', now() - interval '2 hours');
    ok := public.capture_abandoned_cart(t, p, new_items, 5000, win, 'BSR', 'ar', 'sha256:cccccccccccccccc');
    SELECT * INTO r FROM public.abandoned_carts WHERE tenant_id = t AND phone = p;
    IF ok IS DISTINCT FROM true
       OR r.recovered_at IS NOT NULL OR r.reminded_at IS NOT NULL
       OR r.consent_at IS DISTINCT FROM now() OR r.consent_text_version IS DISTINCT FROM 'sha256:cccccccccccccccc'
       OR r.governorate IS DISTINCT FROM 'BSR' OR r.created_at IS DISTINCT FROM now() THEN
        fails := fails || format('6: reopen with consent wrong (%s): %s; ', ok, to_jsonb(r) - 'tenant_id');
    END IF;

    -- 2.7 Same phone, another store: its own row; this one is not touched.
    SELECT to_jsonb(c) INTO before_row FROM public.abandoned_carts c WHERE tenant_id = t AND phone = p;
    ok := public.capture_abandoned_cart(t2, p, old_items, 1000, win);
    SELECT count(*) INTO n FROM public.abandoned_carts WHERE phone = p;
    IF ok IS DISTINCT FROM true OR n <> 2 THEN
        fails := fails || format('7: other store capture returned %s with %s rows; ', ok, n);
    END IF;
    IF (SELECT to_jsonb(c) FROM public.abandoned_carts c WHERE tenant_id = t AND phone = p) IS DISTINCT FROM before_row THEN
        fails := fails || '7: another store''s capture modified this store''s row; ';
    END IF;

    -- 2.8 Argument guards, and nothing written on refusal.
    p := 'tt-capture-' || gen_random_uuid();
    BEGIN
        PERFORM public.capture_abandoned_cart(t, p, new_items, 5000, 0);
        fails := fails || '8: zero window accepted; ';
    EXCEPTION
        WHEN invalid_parameter_value THEN NULL;
        WHEN OTHERS THEN fails := fails || format('8: zero window raised %s, not 22023; ', SQLSTATE);
    END;
    BEGIN
        PERFORM public.capture_abandoned_cart(t, p, new_items, 5000, -1);
        fails := fails || '8: negative window accepted; ';
    EXCEPTION
        WHEN invalid_parameter_value THEN NULL;
        WHEN OTHERS THEN fails := fails || format('8: negative window raised %s, not 22023; ', SQLSTATE);
    END;
    BEGIN
        PERFORM public.capture_abandoned_cart(t, p, new_items, 5000, NULL);
        fails := fails || '8: NULL window accepted; ';
    EXCEPTION
        WHEN invalid_parameter_value THEN NULL;
        WHEN OTHERS THEN fails := fails || format('8: NULL window raised %s, not 22023; ', SQLSTATE);
    END;
    BEGIN
        PERFORM public.capture_abandoned_cart(t, p, NULL, 5000, win);
        fails := fails || '8: NULL items accepted; ';
    EXCEPTION
        WHEN null_value_not_allowed THEN NULL;
        WHEN OTHERS THEN fails := fails || format('8: NULL items raised %s, not 22004; ', SQLSTATE);
    END;
    IF EXISTS (SELECT 1 FROM public.abandoned_carts WHERE phone = p) THEN
        fails := fails || '8: a refused call wrote a row; ';
    END IF;

    PERFORM set_config('tt.failures', current_setting('tt.failures') || fails, true);
END;
$behaviour$;

SELECT CASE WHEN current_setting('tt.failures') = '' THEN 'ALL ASSERTIONS PASSED' ELSE 'FAILED' END AS status,
       nullif(current_setting('tt.failures'), '') AS failures;

ROLLBACK;
