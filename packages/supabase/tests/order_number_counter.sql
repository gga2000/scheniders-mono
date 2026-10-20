-- =============================================================================
-- Order-number counter, order_id write guard and per-tenant lock (F-040, F-041)
-- =============================================================================
--
-- WHAT THIS PROVES (after 20261020154000_order_number_counter.sql is applied)
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
--     * an idempotent replay returns the same order and uses no number.
--
-- LOCAL FIXTURE ONLY. It creates and commits orders in the fixture's two
-- tenants and opens extra connections with dblink. Run it on the throwaway
-- database built by fixtures/order_number_counter_fixture.sql, never on a
-- real project:
--
--   createdb f040
--   psql -d f040 -v ON_ERROR_STOP=1 -f packages/supabase/tests/fixtures/order_number_counter_fixture.sql
--   psql -d f040 -v ON_ERROR_STOP=1 -f packages/supabase/migrations/20261020154000_order_number_counter.sql
--   psql -d f040 -v ON_ERROR_STOP=1 -v connstr="host=... port=... dbname=f040 user=postgres" \
--        -f packages/supabase/tests/order_number_counter.sql
--
-- Result: one row, 'ALL ASSERTIONS PASSED' or 'FAILED: ' plus each failing
-- check. Against the pre-migration function every F-040/F-041 check fails.
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

SELECT CASE WHEN current_setting('tt.failures') = '' THEN 'ALL ASSERTIONS PASSED'
            ELSE 'FAILED: ' || current_setting('tt.failures') END AS result;
