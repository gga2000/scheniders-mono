-- =============================================================================
-- Order-number counter, order_id write guard and per-tenant lock (F-040, F-041)
-- =============================================================================
--
-- WHAT THIS PROVES (after 20261026142859_order_number_counter.sql is applied)
--   F-040 — nobody outside the server can steer the order-number generator:
--     * a tenant member cannot INSERT an order row (so cannot plant
--       '4<YYMMDD>99999999999'), cannot UPDATE an own order's order_id, and
--       cannot hand create_order_atomic an order_id; editing any other column,
--       or writing order_id back unchanged, still works;
--     * even with a huge same-prefix number in the table (service-role
--       passthrough), the next generated number is the counter's next value:
--       no integer overflow, no outage for other tenants;
--     * numbers continue per source/day from the live data (seeded by the
--       migration), skip a number someone already holds, and keep the
--       '<digit><YYMMDD><nnn>' format;
--     * the counter's table, sequences and helper are not reachable by anon
--       or authenticated.
--   F-041 — no global serialisation:
--     * while one tenant's order transaction is open, another tenant's order
--       and a replay of an existing idempotency key complete at once;
--     * concurrent calls get distinct order numbers, and distinct
--       sequence_numbers within a tenant;
--     * an idempotent replay returns the same order and uses no number;
--     * storefront checkout (create_storefront_order) locks per tenant: another
--       tenant's checkout does not wait, a second same-tenant checkout does
--       and is answered as a duplicate.
--   PKG-02 (after 20261026142948_create_order_atomic_require_tenant.sql) —
--   every order has a tenant:
--     * create_order_atomic with a NULL tenant is refused for the server too,
--       writes nothing and cannot replay another tenant's idempotency key;
--     * a one-argument call, or one leaving the tenant at its default,
--       creates nothing;
--     * a direct INSERT with tenant_id NULL fails (orders.tenant_id NOT NULL);
--     * server calls with a tenant (incl. a passthrough order_id), a member's
--       own-tenant call, and split_order_atomic (with a tenant, and as the
--       server without one) still work and land in the right tenant.
--
-- LOCAL FIXTURE ONLY. It creates and commits orders in the fixture's two
-- tenants and opens extra connections with dblink. Run it on the throwaway
-- database built by fixtures/order_number_counter_fixture.sql, never on a
-- real project:
--
--   createdb f040
--   psql -d f040 -v ON_ERROR_STOP=1 -f packages/supabase/tests/fixtures/order_number_counter_fixture.sql
--   psql -d f040 -v ON_ERROR_STOP=1 -f packages/supabase/migrations/20261026142859_order_number_counter.sql
--   psql -d f040 -v ON_ERROR_STOP=1 -f packages/supabase/migrations/20261026142948_create_order_atomic_require_tenant.sql
--   psql -d f040 -v ON_ERROR_STOP=1 -v connstr="host=... port=... dbname=f040 user=postgres" \
--        -f packages/supabase/tests/order_number_counter.sql
--
-- Result: one row, 'ALL ASSERTIONS PASSED' or 'FAILED: ' plus each failing
-- check. Against the pre-migration function every F-040/F-041 check fails;
-- with only 20261026142859 applied, the PKG-02 checks (C1, C2b, C3, C5b) fail.
--
-- MIGRATIONS
--   Both files carry short headers; their full notes follow. Rewritten on
--   2026-10-26 so the migration tool runs them (it would not run DROP
--   statements): CREATE OR REPLACE TRIGGER replaces the trigger's DROP/CREATE,
--   and create_order_atomic(jsonb) plus the 2-arg form's DEFAULT NULL are
--   kept instead of dropped. Both are harmless now: every NULL tenant is
--   refused (22023) whatever the caller, and a one-argument call is
--   ambiguous by name. Also new: section 6 of 20261026142859 moves
--   create_storefront_order (main's 20261021142000) from the global
--   'create_order_lock' to create_order_atomic's per-tenant lock, so the
--   storefront duplicate guard no longer serialises every store's checkout.
--   Notes below that say 'drops' or 'no default' describe the first draft;
--   ROLLBACK for the kept overload and default is: nothing to restore.
--
--   ---- 20261026142859_order_number_counter ----
--   Order numbers from a counter no tenant can steer; no global order lock
--   Fixes F-040 (P0) and the database half of F-041 (P1) — audit-final/FINDINGS.md
--
--   WHAT WAS WRONG (live create_order_atomic(jsonb,uuid), 2026-10-20)
--     * The next number was MAX(<digits after the prefix>)::int over EVERY
--       tenant's orders sharing the '<source digit><YYMMDD>' prefix. Any member
--       could INSERT an own-tenant row, or UPDATE an own order's order_id, to
--       '4<YYMMDD>99999999999': the ::int cast then raised 22003 and order
--       creation stopped for every tenant until the day ended (dates ahead
--       could be poisoned in advance). The caller could also hand the RPC its
--       own order_id.
--     * The prefix scan cannot use orders_order_id_key (not text_pattern_ops)
--       and read the whole table, under pg_advisory_xact_lock(hashtext(
--       'create_order_lock')): ONE lock for all order creation on the platform,
--       held through the insert and its triggers, and taken before the
--       idempotency replay check, so even replays queued behind it.
--
--   WHAT THIS DOES
--     1. Numbers come from four sequences (one per source digit) plus a tiny
--        day table holding each prefix's base. n = nextval - base, so the
--        visible format stays '<digit><YYMMDD><n, at least 3 digits>' and each
--        source/day still counts 001, 002, ... No table scan, no lock shared
--        between tenants, and nothing a tenant writes into orders feeds it. A
--        number someone already holds (a passthrough order_id) is skipped by
--        an equality probe on orders_order_id_key. Rolled-back orders leave
--        gaps, as any sequence does.
--     2. Today's (and any later-dated) prefixes are seeded from live orders, so
--        numbering continues where it is and never collides with existing rows.
--        The migration takes the old global lock first, so no old-style call
--        commits a number between the seed scan and the switch.
--     3. create_order_atomic(jsonb,uuid) — signature, SECURITY DEFINER, search
--        path, grants, payload handling and return shape unchanged — now:
--          - answers an idempotent replay BEFORE taking any lock;
--          - refuses a caller-supplied order_id unless the caller is the server
--            (service_role: LightFunnels passes its own numbers);
--          - takes a PER-TENANT advisory lock (only for the per-tenant
--            sequence_number MAX+1, which needs it) and re-checks the replay
--            under it;
--          - takes the number from public.next_order_number().
--        Every order JSON it returns (replay or new row) goes through
--        public.mask_order_margin(), as on live since main's
--        20261021090000_orders_margin_column_privileges.sql: a non-admin
--        member never gets product_cost / net_profit / waseet_* back.
--        create_order_atomic(jsonb) only delegates; it is unchanged.
--     4. A trigger refuses, for anon/authenticated, INSERT into orders and any
--        UPDATE that changes order_id. Writing order_id back unchanged (full-row
--        saves) still works; SECURITY DEFINER functions and the service role
--        (server actions, webhooks, storefront) are unaffected. A column REVOKE
--        cannot do this: authenticated holds table-level INSERT/UPDATE.
--     No CHECK on the order_id format: live rows use dozens of shapes
--     (LightFunnels, returns RTN-/RPL-, clones, imports), so one would break
--     existing rows and legitimate passthrough numbers.
--
--   LIVE SEED (SELECT-only measurement, 2026-10-20 13:55 UTC): today's prefixes
--     4261020 max 1; 1261020 / 2261020 / 3261020 none. No later-dated prefix.
--     Historic max per prefix is 46 (4260319); 223 prefixes since 1251227.
--
--   FILE NAME: first written as 20261020154000_order_number_counter.sql and
--     renamed (never applied anywhere) so it sorts after main's
--     20261021090000_orders_margin_column_privileges.sql. That migration edits
--     the pre-counter create_order_atomic body by exact fragment and refuses
--     any other body, so in file order it must run first; this file then
--     carries its margin mask forward.
--
--   ROLLOUT: apply this migration BEFORE (or with) the app deploy of the same
--     branch. The new app code sends no order_id from clients and moves the
--     order-number edit to a server action; old app code keeps working against
--     this migration except the in-place order-number edit and snapshot
--     restore of deleted orders, which the trigger refuses for a browser.
--
--   ROLLBACK
--     DROP TRIGGER trg_orders_order_id_server_only ON public.orders;
--     DROP FUNCTION public.orders_order_id_server_only();
--     Re-apply the create_order_atomic(jsonb,uuid) body from migration
--     20261017120000_create_order_atomic_reports_idempotent_replay.sql with
--     both to_jsonb(orders.*) wrapped in mask_order_margin(..., orders.tenant_id)
--     as 20261021090000 does (the live body this replaces), then
--     DROP FUNCTION public.next_order_number(text);
--     DROP TABLE public.order_number_days;
--     DROP SEQUENCE public.order_number_seq_1, public.order_number_seq_2,
--                   public.order_number_seq_3, public.order_number_seq_4;
--
--   ---- 20261026142948_create_order_atomic_require_tenant ----
--   create_order_atomic requires a tenant; orders.tenant_id is NOT NULL
--   Fixes the PKG-02 review finding on F-040/F-041 (20261026142859_order_number_counter)
--
--   WHAT WAS WRONG (live, 2026-10-20)
--     * create_order_atomic(jsonb, uuid) declared `_tenant_id uuid DEFAULT NULL`
--       and only checked the tenant for non-service callers. A server call with
--       NULL (or the 1-arg create_order_atomic(jsonb), which delegates with
--       NULL) matched an idempotency key in ANY tenant — a replay could return
--       another tenant's order — computed sequence_number across all tenants,
--       and inserted an order with tenant_id NULL, which no tenant can see.
--     * split_order_atomic(uuid,jsonb,jsonb,uuid) passed its own, possibly
--       NULL, _tenant_id through, so a service-role split without a tenant (and
--       the deprecated 3-arg overload, which always passes NULL) created its
--       return order with tenant_id NULL.
--     * orders.tenant_id was nullable, so nothing in the table stopped it.
--
--   WHAT THIS DOES
--     1. Refuses to run if any order has tenant_id NULL (live count 2026-10-20:
--        0 of 23,293), then sets orders.tenant_id NOT NULL.
--     2. Drops create_order_atomic(jsonb). No app code calls it; every caller
--        (platform order-service, LightFunnels import/webhook, storefront
--        checkout, split_order_atomic) uses the 2-arg form with a tenant.
--     3. Recreates create_order_atomic(jsonb, uuid) with NO parameter default
--        (CREATE OR REPLACE cannot remove a default, hence DROP + CREATE in this
--        transaction) and raises 22023 when _tenant_id is NULL, for every
--        caller including the service role. The tenant filters lose their
--        `_tenant_id IS NULL OR` escape. Otherwise the body is
--        20261026142859's, unchanged (including mask_order_margin on every
--        returned order, see that file). Grants restated (authenticated,
--        service_role).
--     4. split_order_atomic(uuid,jsonb,jsonb,uuid) — live body, one change: the
--        return order is created in the original order's tenant
--        (_original_order.tenant_id, now NOT NULL; equal to _tenant_id whenever
--        one is given, since the original is looked up under it).
--
--   APPLY ORDER: after 20261026142859_order_number_counter.sql (its body is the
--     base here), in the same deploy. App code needs no change: every caller
--     already passes a tenant.
--
--   ROLLBACK
--     ALTER TABLE public.orders ALTER COLUMN tenant_id DROP NOT NULL;
--     Re-apply section 4 of 20261026142859_order_number_counter.sql after
--     DROP FUNCTION public.create_order_atomic(jsonb, uuid) (restores the
--     default), re-create create_order_atomic(jsonb) from the live-history
--     definition (delegates with NULL::uuid; service role only), and re-apply
--     the live split_order_atomic(uuid,jsonb,jsonb,uuid) body (passes
--     _tenant_id to create_order_atomic).
-- =============================================================================

\set ON_ERROR_STOP 1

SELECT set_config('tt.failures', '', false);
SELECT set_config('tt.connstr', :'connstr', false);
SELECT set_config('tt.today', to_char(current_date, 'YYMMDD'), false);

CREATE OR REPLACE FUNCTION pg_temp.fail(_msg text) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('tt.failures', current_setting('tt.failures') || _msg || '; ', false);
$$;

CREATE OR REPLACE FUNCTION pg_temp.order_json(_source text, _idem text DEFAULT NULL, _order_id text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'customer_name', 'Test Shopper', 'phone', '07701234567', 'price', 25000,
    'source', _source, 'idempotency_key', _idem, 'order_id', _order_id));
$$;

-- =============================================================================
-- Part A — single session, rolled back
-- =============================================================================
BEGIN;

-- ---------------------------------------------------------------------------
-- A1-A4. As tenant A's member (RLS on, JWT simulated)
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
    '{"sub":"aaaaaaaa-1111-4000-8000-000000000001","role":"authenticated"}', true);

DO $member$
DECLARE
    _own uuid;
    _r jsonb;
    _poison text := '4' || current_setting('tt.today') || '99999999999';
BEGIN
    -- A1. Plant a huge same-prefix number in an own-tenant row.
    BEGIN
        INSERT INTO public.orders (order_id, customer_name, phone, price, tenant_id)
        VALUES (_poison, 'x', '07700000000', 1, 'aaaaaaaa-0000-4000-8000-000000000001');
        PERFORM pg_temp.fail('A1 member INSERT of a poisoned order_id was accepted');
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;

    SELECT id INTO _own FROM public.orders
     WHERE tenant_id = 'aaaaaaaa-0000-4000-8000-000000000001' ORDER BY order_id LIMIT 1;

    -- A2. Rewrite an own order's number.
    BEGIN
        UPDATE public.orders SET order_id = '4' || current_setting('tt.today') || '88888888888' WHERE id = _own;
        IF FOUND THEN PERFORM pg_temp.fail('A2 member UPDATE of order_id was accepted'); END IF;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;

    -- A3. Positive control: other columns, and order_id written back unchanged
    -- (the client's full-row saves), still update.
    BEGIN
        UPDATE public.orders SET notes = 'edited', order_id = order_id WHERE id = _own;
        IF NOT FOUND THEN PERFORM pg_temp.fail('A3 member could not update an own order'); END IF;
    EXCEPTION WHEN OTHERS THEN
        PERFORM pg_temp.fail('A3 member update of notes raised ' || SQLSTATE);
    END;

    -- A4. Hand the RPC a number.
    BEGIN
        PERFORM public.create_order_atomic(pg_temp.order_json('storefront', NULL, '4' || current_setting('tt.today') || '77777777777'),
                                           'aaaaaaaa-0000-4000-8000-000000000001');
        PERFORM pg_temp.fail('A4 member RPC call with a caller order_id was accepted');
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;

    -- A4b. Without a number the member's RPC call works and continues the
    -- seeded storefront prefix (today's 001..005 exist).
    BEGIN
        _r := public.create_order_atomic(pg_temp.order_json('storefront'),
                                         'aaaaaaaa-0000-4000-8000-000000000001');
        IF _r->>'order_id' IS DISTINCT FROM '4' || current_setting('tt.today') || '006' THEN
            PERFORM pg_temp.fail('A4b expected 4<today>006, got ' || coalesce(_r->>'order_id', 'null'));
        END IF;
        -- A4c. Main's margin mask (20261021090000) survives: a non-admin
        -- member's result carries no margin keys.
        IF _r ?| ARRAY['product_cost', 'net_profit', 'waseet_merchant_price', 'waseet_company_price'] THEN
            PERFORM pg_temp.fail('A4c member RPC result exposed margin keys');
        END IF;
    EXCEPTION WHEN OTHERS THEN
        PERFORM pg_temp.fail('A4b member RPC call raised ' || SQLSTATE || ' ' || SQLERRM);
    END;

    -- A9. The counter is not reachable from a client role.
    IF to_regclass('public.order_number_days') IS NULL
       OR to_regclass('public.order_number_seq_4') IS NULL
       OR to_regprocedure('public.next_order_number(text)') IS NULL THEN
        PERFORM pg_temp.fail('A9 counter objects missing');
    ELSE
        IF has_table_privilege('public.order_number_days', 'SELECT,INSERT,UPDATE,DELETE')
           OR has_sequence_privilege('public.order_number_seq_4', 'USAGE,SELECT,UPDATE')
           OR has_function_privilege('public.next_order_number(text)', 'EXECUTE') THEN
            PERFORM pg_temp.fail('A9 authenticated can reach the counter');
        END IF;
    END IF;
END;
$member$;

RESET ROLE;
SELECT set_config('request.jwt.claims', '', true);

-- ---------------------------------------------------------------------------
-- A5-A10. As the server (service_role, no JWT — like the storefront/webhooks)
-- ---------------------------------------------------------------------------
SET LOCAL ROLE service_role;

DO $server$
DECLARE
    _t text := current_setting('tt.today');
    _r jsonb; _r2 jsonb; _next jsonb;
    _seq_before int;
BEGIN
    -- A5. A huge same-prefix number already in the table (a passthrough
    -- number) must not stop or steer generation.
    INSERT INTO public.orders (order_id, customer_name, phone, price, tenant_id)
    VALUES ('4' || _t || '66666666666', 'x', '07700000000', 1, 'bbbbbbbb-0000-4000-8000-000000000002');
    BEGIN
        _r := public.create_order_atomic(pg_temp.order_json('storefront'), 'bbbbbbbb-0000-4000-8000-000000000002');
        IF _r->>'order_id' IS DISTINCT FROM '4' || _t || '007' THEN
            PERFORM pg_temp.fail('A5 expected 4<today>007 after a poisoned row, got ' || coalesce(_r->>'order_id', 'null'));
        END IF;
    EXCEPTION WHEN OTHERS THEN
        PERFORM pg_temp.fail('A5 generation broke after a poisoned row: ' || SQLSTATE || ' ' || SQLERRM);
    END;

    -- A6. A number someone already holds is skipped, not collided with.
    INSERT INTO public.orders (order_id, customer_name, phone, price, tenant_id)
    VALUES ('4' || _t || '008', 'x', '07700000000', 1, 'aaaaaaaa-0000-4000-8000-000000000001');
    BEGIN
        _r := public.create_order_atomic(pg_temp.order_json('storefront'), 'aaaaaaaa-0000-4000-8000-000000000001');
        IF _r->>'order_id' IS DISTINCT FROM '4' || _t || '009' THEN
            PERFORM pg_temp.fail('A6 expected 4<today>009 after a held 008, got ' || coalesce(_r->>'order_id', 'null'));
        END IF;
    EXCEPTION WHEN OTHERS THEN
        PERFORM pg_temp.fail('A6 raised ' || SQLSTATE || ' ' || SQLERRM);
    END;

    -- A7. Each source keeps its own per-day series.
    BEGIN
        _r := public.create_order_atomic(pg_temp.order_json('whatsapp'), 'aaaaaaaa-0000-4000-8000-000000000001');
        IF _r->>'order_id' IS DISTINCT FROM '1' || _t || '008' THEN
            PERFORM pg_temp.fail('A7 whatsapp expected 1<today>008, got ' || coalesce(_r->>'order_id', 'null'));
        END IF;
        _r := public.create_order_atomic(pg_temp.order_json('meta'), 'bbbbbbbb-0000-4000-8000-000000000002');
        IF _r->>'order_id' IS DISTINCT FROM '2' || _t || '001' THEN
            PERFORM pg_temp.fail('A7 meta expected 2<today>001, got ' || coalesce(_r->>'order_id', 'null'));
        END IF;
        _r := public.create_order_atomic(pg_temp.order_json('tiktok'), 'bbbbbbbb-0000-4000-8000-000000000002');
        IF _r->>'order_id' IS DISTINCT FROM '3' || _t || '001' THEN
            PERFORM pg_temp.fail('A7 tiktok expected 3<today>001, got ' || coalesce(_r->>'order_id', 'null'));
        END IF;
    EXCEPTION WHEN OTHERS THEN
        PERFORM pg_temp.fail('A7 raised ' || SQLSTATE || ' ' || SQLERRM);
    END;

    -- A8. A replay returns the same order and consumes no number.
    BEGIN
        _r := public.create_order_atomic(pg_temp.order_json('storefront', 'idem-A8-0001'), 'aaaaaaaa-0000-4000-8000-000000000001');
        _r2 := public.create_order_atomic(pg_temp.order_json('storefront', 'idem-A8-0001'), 'aaaaaaaa-0000-4000-8000-000000000001');
        IF _r2->>'id' IS DISTINCT FROM _r->>'id' OR (_r2->>'idempotent_replay') IS DISTINCT FROM 'true' THEN
            PERFORM pg_temp.fail('A8 replay did not return the original order');
        END IF;
        -- A8b. The server still gets the full row, margin included.
        IF NOT (_r ?& ARRAY['product_cost', 'net_profit', 'waseet_merchant_price', 'waseet_company_price'])
           OR NOT (_r2 ? 'product_cost') THEN
            PERFORM pg_temp.fail('A8b server RPC result lost margin keys');
        END IF;
        _next := public.create_order_atomic(pg_temp.order_json('storefront'), 'aaaaaaaa-0000-4000-8000-000000000001');
        IF (substring(_next->>'order_id' FROM 8))::int <> (substring(_r->>'order_id' FROM 8))::int + 1 THEN
            PERFORM pg_temp.fail('A8 replay consumed a number: ' || (_r->>'order_id') || ' then ' || (_next->>'order_id'));
        END IF;
    EXCEPTION WHEN OTHERS THEN
        PERFORM pg_temp.fail('A8 raised ' || SQLSTATE || ' ' || SQLERRM);
    END;

    -- A10. sequence_number still counts per tenant.
    SELECT max(sequence_number) INTO _seq_before FROM public.orders
     WHERE tenant_id = 'bbbbbbbb-0000-4000-8000-000000000002';
    BEGIN
        _r := public.create_order_atomic(pg_temp.order_json('manual'), 'bbbbbbbb-0000-4000-8000-000000000002');
        IF (_r->>'sequence_number')::int <> _seq_before + 1 THEN
            PERFORM pg_temp.fail('A10 sequence_number expected ' || (_seq_before + 1) || ', got ' || (_r->>'sequence_number'));
        END IF;
    EXCEPTION WHEN OTHERS THEN
        PERFORM pg_temp.fail('A10 raised ' || SQLSTATE || ' ' || SQLERRM);
    END;
END;
$server$;

-- Part A's findings would be undone by the ROLLBACK (set_config is
-- transactional), so carry them across it in a psql variable.
SELECT current_setting('tt.failures') AS part_a_failures \gset
ROLLBACK;
SELECT set_config('tt.failures', :'part_a_failures', false);

-- =============================================================================
-- Part B — several sessions (dblink), committed
-- =============================================================================

-- A committed tenant-A order with an idempotency key, to replay from B2.
SELECT public.create_order_atomic(pg_temp.order_json('storefront', 'idem-B-committed'),
                                  'aaaaaaaa-0000-4000-8000-000000000001') IS NOT NULL AS committed_seed_order;

SELECT dblink_connect('c1', current_setting('tt.connstr'));
SELECT dblink_connect('c2', current_setting('tt.connstr'));
SELECT dblink_exec('c1', 'SET ROLE service_role');
SELECT dblink_exec('c2', 'SET ROLE service_role');

-- B1. c1 opens tenant A's order transaction and keeps it open.
SELECT dblink_exec('c1', 'BEGIN');
SELECT order_id IS NOT NULL AS c1_order_open FROM dblink('c1',
    $q$SELECT public.create_order_atomic('{"customer_name":"c1","phone":"07701234567","price":1,"source":"storefront"}'::jsonb,
                                         'aaaaaaaa-0000-4000-8000-000000000001')->>'order_id'$q$) AS t(order_id text);

-- B2. Meanwhile c2 places tenant B's order and replays tenant A's committed
-- key. Under one global lock both wait for c1 and hit the timeout.
SELECT dblink_exec('c2', 'SET statement_timeout = ''3s''');
DO $b2$
DECLARE _id text; _replay text;
BEGIN
    BEGIN
        SELECT order_id INTO _id FROM dblink('c2',
            $q$SELECT public.create_order_atomic('{"customer_name":"c2","phone":"07701234567","price":1,"source":"storefront"}'::jsonb,
                                                 'bbbbbbbb-0000-4000-8000-000000000002')->>'order_id'$q$) AS t(order_id text);
        IF _id IS NULL THEN PERFORM pg_temp.fail('B2 tenant B order returned nothing'); END IF;
    -- WHEN OTHERS does not cover query_canceled, which is what the remote
    -- statement_timeout raises.
    EXCEPTION WHEN OTHERS OR query_canceled THEN
        PERFORM pg_temp.fail('B2 tenant B waited on tenant A''s open order: ' || SQLERRM);
    END;
    BEGIN
        SELECT replay INTO _replay FROM dblink('c2',
            $q$SELECT public.create_order_atomic('{"customer_name":"c2","phone":"07701234567","price":1,"source":"storefront","idempotency_key":"idem-B-committed"}'::jsonb,
                                                 'aaaaaaaa-0000-4000-8000-000000000001')->>'idempotent_replay'$q$) AS t(replay text);
        IF _replay IS DISTINCT FROM 'true' THEN PERFORM pg_temp.fail('B2 replay was not reported as a replay'); END IF;
    EXCEPTION WHEN OTHERS OR query_canceled THEN
        PERFORM pg_temp.fail('B2 replay waited behind an open order: ' || SQLERRM);
    END;
END;
$b2$;

SELECT dblink_exec('c1', 'COMMIT');

-- B3. Storefront checkout (create_storefront_order) locks per tenant too.
-- c1 holds tenant A's checkout open; tenant B's checkout must not wait on
-- it, while a second tenant-A checkout must (the duplicate guard's check and
-- insert stay one critical section), and then gets c1's order as a duplicate.
SELECT dblink_exec('c1', 'BEGIN');
SELECT order_id IS NOT NULL AS c1_storefront_open FROM dblink('c1',
    $q$SELECT public.create_storefront_order(
        '{"customer_name":"c1","phone":"07709998877","price":1,"source":"storefront","items":[{"product_id":"cccccccc-0000-4000-8000-000000000003","quantity":1}]}'::jsonb,
        'aaaaaaaa-0000-4000-8000-000000000001', ARRAY['cccccccc-0000-4000-8000-000000000003']::uuid[], 10)->>'order_id'$q$) AS t(order_id text);
DO $b3$
DECLARE _id text; _dup text;
BEGIN
    PERFORM dblink_exec('c2', 'SET statement_timeout = ''3s''');
    BEGIN
        SELECT order_id INTO _id FROM dblink('c2',
            $q$SELECT public.create_storefront_order(
                '{"customer_name":"c2","phone":"07709998877","price":1,"source":"storefront","items":[{"product_id":"cccccccc-0000-4000-8000-000000000003","quantity":1}]}'::jsonb,
                'bbbbbbbb-0000-4000-8000-000000000002', ARRAY['cccccccc-0000-4000-8000-000000000003']::uuid[], 10)->>'order_id'$q$) AS t(order_id text);
        IF _id IS NULL THEN PERFORM pg_temp.fail('B3 tenant B storefront order returned nothing'); END IF;
    EXCEPTION WHEN OTHERS OR query_canceled THEN
        PERFORM pg_temp.fail('B3 tenant B checkout waited on tenant A''s open checkout: ' || SQLERRM);
    END;
    PERFORM dblink_exec('c2', 'SET statement_timeout = ''1s''');
    BEGIN
        PERFORM * FROM dblink('c2',
            $q$SELECT public.create_storefront_order(
                '{"customer_name":"c2","phone":"07709998877","price":1,"source":"storefront","items":[{"product_id":"cccccccc-0000-4000-8000-000000000003","quantity":1}]}'::jsonb,
                'aaaaaaaa-0000-4000-8000-000000000001', ARRAY['cccccccc-0000-4000-8000-000000000003']::uuid[], 10)->>'order_id'$q$) AS t(order_id text);
        PERFORM pg_temp.fail('B3 a second tenant-A checkout did not wait for the open one (duplicate guard unserialised)');
    EXCEPTION WHEN OTHERS OR query_canceled THEN NULL;
    END;
    PERFORM dblink_exec('c1', 'COMMIT');
    PERFORM dblink_exec('c2', 'SET statement_timeout = ''3s''');
    SELECT dup INTO _dup FROM dblink('c2',
        $q$SELECT public.create_storefront_order(
            '{"customer_name":"c2","phone":"07709998877","price":1,"source":"storefront","items":[{"product_id":"cccccccc-0000-4000-8000-000000000003","quantity":1}]}'::jsonb,
            'aaaaaaaa-0000-4000-8000-000000000001', ARRAY['cccccccc-0000-4000-8000-000000000003']::uuid[], 10)->>'duplicate_guard'$q$) AS t(dup text);
    IF _dup IS DISTINCT FROM 'true' THEN
        PERFORM pg_temp.fail('B3 the repeat tenant-A checkout was not answered as a duplicate');
    END IF;
END;
$b3$;
SELECT dblink_disconnect('c1');
SELECT dblink_disconnect('c2');

-- B3. Six sessions fire at once, three per tenant.
DO $b3$
DECLARE
    _i int;
    _tenant text;
    _n_ids int; _n_distinct int; _n_bad int; _seq_dupes int;
BEGIN
    CREATE TEMP TABLE b3_results (conn text, tenant_id uuid, order_id text, sequence_number int);
    FOR _i IN 1..6 LOOP
        _tenant := CASE WHEN _i % 2 = 0 THEN 'aaaaaaaa-0000-4000-8000-000000000001' ELSE 'bbbbbbbb-0000-4000-8000-000000000002' END;
        PERFORM dblink_connect('p' || _i, current_setting('tt.connstr'));
        PERFORM dblink_exec('p' || _i, 'SET ROLE service_role');
        PERFORM dblink_send_query('p' || _i, format(
            $q$SELECT r->>'tenant_id', r->>'order_id', (r->>'sequence_number')::int
                 FROM public.create_order_atomic('{"customer_name":"p","phone":"07701234567","price":1,"source":"storefront"}'::jsonb, %L) r$q$,
            _tenant));
    END LOOP;
    FOR _i IN 1..6 LOOP
        INSERT INTO b3_results
        SELECT 'p' || _i, t.tenant_id::uuid, t.order_id, t.seq
          FROM dblink_get_result('p' || _i) AS t(tenant_id text, order_id text, seq int);
        PERFORM dblink_disconnect('p' || _i);
    END LOOP;

    SELECT count(order_id), count(DISTINCT order_id),
           count(*) FILTER (WHERE order_id !~ ('^4' || current_setting('tt.today') || '[0-9]{3,}$'))
      INTO _n_ids, _n_distinct, _n_bad FROM b3_results;
    SELECT count(*) - count(DISTINCT (tenant_id, sequence_number)) INTO _seq_dupes FROM b3_results;
    IF _n_ids <> 6 THEN PERFORM pg_temp.fail('B3 only ' || _n_ids || ' of 6 concurrent calls returned an order'); END IF;
    IF _n_distinct <> _n_ids THEN PERFORM pg_temp.fail('B3 concurrent calls shared an order number'); END IF;
    IF _n_bad > 0 THEN PERFORM pg_temp.fail('B3 ' || _n_bad || ' numbers broke the <digit><YYMMDD><nnn> format'); END IF;
    IF _seq_dupes > 0 THEN PERFORM pg_temp.fail('B3 concurrent calls shared a sequence_number within a tenant'); END IF;
END;
$b3$;

-- =============================================================================
-- Part C — a tenant is required (PKG-02), single session, rolled back
-- =============================================================================
BEGIN;
SET LOCAL ROLE service_role;

DO $tenant$
DECLARE
    _a uuid := 'aaaaaaaa-0000-4000-8000-000000000001';
    _b uuid := 'bbbbbbbb-0000-4000-8000-000000000002';
    _r jsonb; _orig uuid; _n_before bigint; _n_after bigint;
BEGIN
    -- C1. The server calls without a tenant: refused, and nothing is written.
    SELECT count(*) INTO _n_before FROM public.orders;
    BEGIN
        _r := public.create_order_atomic(pg_temp.order_json('storefront'), NULL);
        PERFORM pg_temp.fail('C1 service-role call with a NULL tenant was accepted (tenant_id '
                             || coalesce(_r->>'tenant_id', 'null') || ')');
    EXCEPTION WHEN invalid_parameter_value OR not_null_violation THEN NULL;
    END;
    -- C1b. Nor can a NULL-tenant call replay another tenant's idempotency key.
    PERFORM public.create_order_atomic(pg_temp.order_json('storefront', 'idem-C1b'), _b);
    BEGIN
        _r := public.create_order_atomic(pg_temp.order_json('storefront', 'idem-C1b'), NULL);
        PERFORM pg_temp.fail('C1b NULL-tenant call replayed tenant B''s order (tenant_id '
                             || coalesce(_r->>'tenant_id', 'null') || ')');
    EXCEPTION WHEN invalid_parameter_value OR not_null_violation THEN NULL;
    END;
    SELECT count(*) INTO _n_after FROM public.orders;
    IF _n_after <> _n_before + 1 THEN
        PERFORM pg_temp.fail('C1 a NULL-tenant call wrote ' || (_n_after - _n_before - 1) || ' order(s)');
    END IF;

    -- C2. A one-argument call creates nothing. The deprecated 1-arg overload
    -- is kept (see MIGRATIONS above): by name the call is ambiguous with the
    -- 2-arg form's default, and the overload itself delegates with a NULL
    -- tenant, which is now refused.
    BEGIN
        _r := public.create_order_atomic(pg_temp.order_json('storefront'));
        PERFORM pg_temp.fail('C2 a one-argument create_order_atomic call created an order (tenant_id '
                             || coalesce(_r->>'tenant_id', 'null') || ')');
    EXCEPTION WHEN invalid_parameter_value OR ambiguous_function THEN NULL;
    END;
    -- C2b. Leaving the tenant out of the 2-arg form (its default) is refused.
    BEGIN
        _r := public.create_order_atomic(_order_data => pg_temp.order_json('storefront'), _tenant_id => NULL);
        PERFORM pg_temp.fail('C2b create_order_atomic with the default tenant was accepted');
    EXCEPTION WHEN invalid_parameter_value THEN NULL;
    END;

    -- C3. A NULL-tenant row cannot be inserted directly, even by the server.
    BEGIN
        INSERT INTO public.orders (order_id, customer_name, phone, price, tenant_id)
        VALUES ('C3-NULL-TENANT', 'x', '07700000000', 1, NULL);
        PERFORM pg_temp.fail('C3 service-role INSERT with tenant_id NULL was accepted');
    EXCEPTION WHEN not_null_violation THEN NULL;
    END;

    -- C4. Legitimate server calls still work and land in their tenant
    -- (storefront checkout / order-service / LightFunnels shape, incl. a
    -- passthrough order_id).
    BEGIN
        _r := public.create_order_atomic(pg_temp.order_json('storefront'), _a);
        IF (_r->>'tenant_id')::uuid IS DISTINCT FROM _a THEN
            PERFORM pg_temp.fail('C4 order landed in tenant ' || coalesce(_r->>'tenant_id', 'null'));
        END IF;
        _r := public.create_order_atomic(pg_temp.order_json('lightfunnels', NULL, 'LF-C4-0001'), _b);
        IF _r->>'order_id' IS DISTINCT FROM 'LF-C4-0001' OR (_r->>'tenant_id')::uuid IS DISTINCT FROM _b THEN
            PERFORM pg_temp.fail('C4 passthrough order wrong: ' || _r::text);
        END IF;
    EXCEPTION WHEN OTHERS THEN
        PERFORM pg_temp.fail('C4 legitimate server call raised ' || SQLSTATE || ' ' || SQLERRM);
    END;

    -- C5. split_order_atomic (the database caller): with a tenant, and as the
    -- server with a NULL tenant, the return order lands in the original
    -- order's tenant. (The 3-arg overload cannot be called by position at all:
    -- it is ambiguous with the 4-arg one's default, live too.)
    BEGIN
        _orig := (public.create_order_atomic(
            pg_temp.order_json('manual') || '{"items":[{"name":"a","price":1000,"quantity":1},{"name":"b","price":2000,"quantity":1}]}', _b)->>'id')::uuid;
        _r := public.split_order_atomic(_orig, '[{"name":"a","price":1000,"quantity":1}]', '[{"name":"b","price":2000,"quantity":1}]', _b);
        IF (_r->>'tenant_id')::uuid IS DISTINCT FROM _b THEN
            PERFORM pg_temp.fail('C5 split (with tenant) return order in tenant ' || coalesce(_r->>'tenant_id', 'null'));
        END IF;
    EXCEPTION WHEN OTHERS THEN
        PERFORM pg_temp.fail('C5 split with tenant raised ' || SQLSTATE || ' ' || SQLERRM);
    END;
    BEGIN
        _orig := (public.create_order_atomic(
            pg_temp.order_json('manual') || '{"items":[{"name":"a","price":1000,"quantity":1},{"name":"b","price":2000,"quantity":1}]}', _a)->>'id')::uuid;
        _r := public.split_order_atomic(_orig, '[{"name":"a","price":1000,"quantity":1}]', '[{"name":"b","price":2000,"quantity":1}]', NULL);
        IF (_r->>'tenant_id')::uuid IS DISTINCT FROM _a THEN
            PERFORM pg_temp.fail('C5b NULL-tenant server split: return order in tenant ' || coalesce(_r->>'tenant_id', 'null'));
        END IF;
    EXCEPTION WHEN OTHERS THEN
        PERFORM pg_temp.fail('C5b NULL-tenant server split raised ' || SQLSTATE || ' ' || SQLERRM);
    END;
END;
$tenant$;

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
    '{"sub":"aaaaaaaa-1111-4000-8000-000000000001","role":"authenticated"}', true);

DO $member_tenant$
DECLARE _r jsonb;
BEGIN
    -- C6. A member without a tenant is refused; with their own tenant it works.
    BEGIN
        PERFORM public.create_order_atomic(pg_temp.order_json('storefront'), NULL);
        PERFORM pg_temp.fail('C6 member call with a NULL tenant was accepted');
    EXCEPTION WHEN invalid_parameter_value OR insufficient_privilege THEN NULL;
    END;
    BEGIN
        _r := public.create_order_atomic(pg_temp.order_json('storefront'), 'aaaaaaaa-0000-4000-8000-000000000001');
        IF _r->>'id' IS NULL THEN PERFORM pg_temp.fail('C6 member call returned nothing'); END IF;
        -- C6b. A member's idempotent replay is masked too.
        PERFORM public.create_order_atomic(pg_temp.order_json('storefront', 'idem-C6-0001'), 'aaaaaaaa-0000-4000-8000-000000000001');
        _r := public.create_order_atomic(pg_temp.order_json('storefront', 'idem-C6-0001'), 'aaaaaaaa-0000-4000-8000-000000000001');
        IF (_r->>'idempotent_replay') IS DISTINCT FROM 'true' THEN
            PERFORM pg_temp.fail('C6b member replay was not a replay');
        ELSIF _r ? 'product_cost' THEN
            PERFORM pg_temp.fail('C6b member replay exposed margin keys');
        END IF;
    EXCEPTION WHEN OTHERS THEN
        PERFORM pg_temp.fail('C6 member call with own tenant raised ' || SQLSTATE || ' ' || SQLERRM);
    END;
END;
$member_tenant$;

SELECT current_setting('tt.failures') AS part_c_failures \gset
ROLLBACK;
SELECT set_config('tt.failures', :'part_c_failures', false);

SELECT CASE WHEN current_setting('tt.failures') = '' THEN 'ALL ASSERTIONS PASSED'
            ELSE 'FAILED: ' || current_setting('tt.failures') END AS result;
