-- =============================================================================
-- admin_add_industry: behaviour test
-- =============================================================================
--
-- WHAT THIS PROVES (after the admin_add_industry migration)
--   Access:
--     * anon and authenticated cannot run it; the service role can.
--   Place:
--     * THE FIRST-PLACE CASE: an industry added from the console took the
--       column default 0 and landed above Fashion in every list. It now goes
--       last (the highest place + 1), even past "Other" at 99, and staff move
--       it from there;
--     * a second one goes after the first: no two share a place;
--     * a move after an add works and keeps every place apart.
--   Row and log:
--     * the answer is the new row; an empty Arabic name is stored as null;
--     * one staff log row per add, naming who and which industry, in the
--       same transaction;
--   Refusals (nothing written, no log row):
--     * an empty name: an error.
--
-- RESULT: one row, 'ALL ASSERTIONS PASSED', or an error that lists every
-- failed check.
-- =============================================================================

BEGIN;

SELECT set_config('tt.failures', '', true);

CREATE OR REPLACE FUNCTION pg_temp.check(_name text, _ok boolean) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    IF _ok IS NOT TRUE THEN
        PERFORM set_config('tt.failures', current_setting('tt.failures') || _name || '; ', true);
    END IF;
END $$;

-- The list as the console shows it: names in order.
CREATE OR REPLACE FUNCTION pg_temp.shown() RETURNS text LANGUAGE sql AS $$
    SELECT string_agg(name, ',' ORDER BY sort_order, created_at, id) FROM public.industries
$$;

DO $$
DECLARE
    _fn constant text := 'public.admin_add_industry(text, text, text, text, integer, uuid, text)';
BEGIN
    PERFORM pg_temp.check('access: anon can run it', NOT has_function_privilege('anon', _fn, 'EXECUTE'));
    PERFORM pg_temp.check('access: authenticated can run it', NOT has_function_privilege('authenticated', _fn, 'EXECUTE'));
    PERFORM pg_temp.check('access: service role cannot run it', has_function_privilege('service_role', _fn, 'EXECUTE'));
END $$;

-- As live: seeded 1..3 and Other at 99.
INSERT INTO public.industries (name, sort_order, created_at) VALUES
    ('Fashion', 1, now() - interval '30 days'),
    ('Beauty',  2, now() - interval '30 days'),
    ('Grocery', 3, now() - interval '30 days'),
    ('Other',  99, now() - interval '30 days');

DO $$
DECLARE
    _admin constant uuid := gen_random_uuid();
    _r jsonb;
    _id uuid;
    _logs integer;
BEGIN
    SET LOCAL ROLE service_role;

    -- THE FIRST-PLACE CASE.
    _r := public.admin_add_industry('Perfume', '  ', 'Sparkles', '#AA3366', 30000, _admin, 'ops@example.com');
    PERFORM pg_temp.check('add: Perfume is not last: ' || pg_temp.shown(), pg_temp.shown() = 'Fashion,Beauty,Grocery,Other,Perfume');
    PERFORM pg_temp.check('add: answer is not the row: ' || _r::text,
        _r @> '{"name": "Perfume", "icon": "Sparkles", "color": "#AA3366", "avg_order_value_iqd": 30000, "sort_order": 100, "is_active": true}'
        AND _r ? 'id');
    PERFORM pg_temp.check('add: an empty Arabic name was kept: ' || _r::text, _r -> 'name_ar' = 'null'::jsonb);
    _id := (_r ->> 'id')::uuid;
    PERFORM pg_temp.check('log: no row naming Perfume',
        EXISTS (SELECT 1 FROM public.admin_activity_logs
                 WHERE action = 'update_settings' AND admin_user_id = _admin AND actor_email = 'ops@example.com'
                   AND details = jsonb_build_object('setting', 'industries', 'change', 'added', 'industry_id', _id, 'name', 'Perfume')));

    -- A second one goes after the first.
    _r := public.admin_add_industry('Pets', 'حيوانات أليفة', 'PawPrint', '#336699', 25000, _admin, 'ops@example.com');
    PERFORM pg_temp.check('second: Pets is not after Perfume: ' || pg_temp.shown(), pg_temp.shown() = 'Fashion,Beauty,Grocery,Other,Perfume,Pets');
    PERFORM pg_temp.check('second: the Arabic name was lost: ' || _r::text, _r ->> 'name_ar' = 'حيوانات أليفة');
    PERFORM pg_temp.check('second: two industries share a place',
        (SELECT count(DISTINCT sort_order) FROM public.industries) = (SELECT count(*) FROM public.industries));

    -- Staff move the new one up past Other: one press.
    _r := public.admin_move_industry(_id, -1, _admin, 'ops@example.com');
    PERFORM pg_temp.check('move: Perfume did not pass Other: ' || pg_temp.shown(), pg_temp.shown() = 'Fashion,Beauty,Grocery,Perfume,Other,Pets');

    -- An empty name writes nothing.
    BEGIN
        _r := public.admin_add_industry('   ', NULL, 'Building2', '#6B7280', 25000, _admin, 'ops@example.com');
        PERFORM pg_temp.check('empty name: ran', false);
    EXCEPTION WHEN invalid_parameter_value THEN
        NULL;
    END;
    PERFORM pg_temp.check('empty name: a row was added', (SELECT count(*) FROM public.industries) = 6);
    SELECT count(*) INTO _logs FROM public.admin_activity_logs WHERE details ->> 'change' = 'added';
    PERFORM pg_temp.check('empty name: wrote a log row, add rows now ' || _logs, _logs = 2);

    RESET ROLE;
END $$;

-- Every failed check is collected, then raised together, so psql -v ON_ERROR_STOP=1
-- (and with it run.sh) fails and names all of them at once.
DO $$
BEGIN
    IF current_setting('tt.failures') <> '' THEN
        RAISE EXCEPTION 'FAILED: %', current_setting('tt.failures');
    END IF;
END $$;

SELECT 'ALL ASSERTIONS PASSED' AS status;

ROLLBACK;
