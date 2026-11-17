-- =============================================================================
-- admin_move_industry: behaviour test
-- =============================================================================
--
-- WHAT THIS PROVES (after the admin_move_industry migration)
--   Access:
--     * anon and authenticated cannot run it; the service role can.
--   Moves:
--     * one place up or down, in the order the console shows (sort_order,
--       then created_at); the others keep their order;
--     * THE STUCK CASE: two industries added from the console both have
--       sort_order 0. Trading their numbers changed nothing. A move now puts
--       them in the asked order, and afterwards no two share a number;
--     * one staff log row per move, with who, from and to;
--   Refusals (nothing written, no log row):
--     * the first moved up, the last moved down: 'at_edge';
--     * an unknown industry: 'not_found';
--     * a step other than -1 or 1: an error.
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
    _fn constant text := 'public.admin_move_industry(uuid, integer, uuid, text)';
BEGIN
    PERFORM pg_temp.check('access: anon can run it', NOT has_function_privilege('anon', _fn, 'EXECUTE'));
    PERFORM pg_temp.check('access: authenticated can run it', NOT has_function_privilege('authenticated', _fn, 'EXECUTE'));
    PERFORM pg_temp.check('access: service role cannot run it', has_function_privilege('service_role', _fn, 'EXECUTE'));
END $$;

-- As live: seeded 1..12 and Other at 99; then two added from the console,
-- which take the column default 0.
INSERT INTO public.industries (name, sort_order, created_at) VALUES
    ('Fashion', 1, now() - interval '30 days'),
    ('Beauty',  2, now() - interval '30 days'),
    ('Other',  99, now() - interval '30 days'),
    ('Perfume', 0, now() - interval '2 days'),
    ('Tools',   0, now() - interval '1 day');

DO $$
DECLARE
    _admin constant uuid := gen_random_uuid();
    _r jsonb;
    _id uuid;
    _logs integer;
    _shown text;
BEGIN
    SET LOCAL ROLE service_role;

    PERFORM pg_temp.check('setup: the list is not as live: ' || pg_temp.shown(), pg_temp.shown() = 'Perfume,Tools,Fashion,Beauty,Other');

    -- THE STUCK CASE: Tools up, past Perfume (both 0).
    SELECT id INTO _id FROM public.industries WHERE name = 'Tools';
    _r := public.admin_move_industry(_id, -1, _admin, 'ops@example.com');
    PERFORM pg_temp.check('stuck: Tools up was refused: ' || _r::text, (_r ->> 'success')::boolean);
    PERFORM pg_temp.check('stuck: Tools did not pass Perfume: ' || pg_temp.shown(), pg_temp.shown() = 'Tools,Perfume,Fashion,Beauty,Other');
    PERFORM pg_temp.check('stuck: two industries still share a number',
        (SELECT count(DISTINCT sort_order) FROM public.industries) = 5);
    PERFORM pg_temp.check('stuck: answer is not place 1 of 5: ' || _r::text, _r @> '{"place": 1, "of": 5}');

    -- Perfume down, past Fashion; Other stays last.
    SELECT id INTO _id FROM public.industries WHERE name = 'Perfume';
    _r := public.admin_move_industry(_id, 1, _admin, 'ops@example.com');
    PERFORM pg_temp.check('down: Perfume did not pass Fashion: ' || pg_temp.shown(), pg_temp.shown() = 'Tools,Fashion,Perfume,Beauty,Other');

    -- Every move left one log row naming who, what and where.
    SELECT count(*) INTO _logs FROM public.admin_activity_logs
     WHERE action = 'update_settings' AND admin_user_id = _admin AND actor_email = 'ops@example.com'
       AND details @> jsonb_build_object('setting', 'industries', 'change', 'moved');
    PERFORM pg_temp.check('log: not one row per move, got ' || _logs, _logs = 2);
    PERFORM pg_temp.check('log: the last row does not say Perfume went from 2 to 3',
        EXISTS (SELECT 1 FROM public.admin_activity_logs
                 WHERE details @> jsonb_build_object('industry_id', _id, 'from_place', 2, 'to_place', 3)));

    -- Refusals write nothing.
    _shown := pg_temp.shown();
    SELECT id INTO _id FROM public.industries WHERE name = 'Tools';
    _r := public.admin_move_industry(_id, -1, _admin, 'ops@example.com');
    PERFORM pg_temp.check('edge: the first moved up was not at_edge: ' || _r::text, _r = '{"success": false, "error": "at_edge"}');
    SELECT id INTO _id FROM public.industries WHERE name = 'Other';
    _r := public.admin_move_industry(_id, 1, _admin, 'ops@example.com');
    PERFORM pg_temp.check('edge: the last moved down was not at_edge: ' || _r::text, _r = '{"success": false, "error": "at_edge"}');
    _r := public.admin_move_industry(gen_random_uuid(), 1, _admin, 'ops@example.com');
    PERFORM pg_temp.check('unknown: not not_found: ' || _r::text, _r = '{"success": false, "error": "not_found"}');
    BEGIN
        _r := public.admin_move_industry(_id, 2, _admin, 'ops@example.com');
        PERFORM pg_temp.check('step 2: ran', false);
    EXCEPTION WHEN invalid_parameter_value THEN
        NULL;
    END;
    PERFORM pg_temp.check('refusals: the list changed: ' || pg_temp.shown(), pg_temp.shown() = _shown);
    SELECT count(*) INTO _logs FROM public.admin_activity_logs;
    PERFORM pg_temp.check('refusals: wrote a log row, rows now ' || _logs, _logs = 2);

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
