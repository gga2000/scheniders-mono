-- =============================================================================
-- admin_remove_industry: behaviour test
-- =============================================================================
--
-- WHAT THIS PROVES (after the admin_remove_industry migration)
--   Access:
--     * anon and authenticated cannot run it; the service role can.
--   Removing:
--     * an industry no lead uses is removed, with one staff log row that
--       keeps its name;
--     * THE LOST CASE: an industry leads use is switched off, not removed,
--       and every lead keeps it (the console removed it when its lead count
--       failed, and the database then cleared it from every lead);
--   Refusals (nothing written, no log row):
--     * an unknown industry: 'not_found';
--     * no industry: an error.
--   Taking turns (20261117103651):
--     * it takes the industries table lock that admin_add_industry and
--       admin_move_industry take, before its row lock: it took the row lock
--       first and the table's write lock at its DELETE, so a remove and a
--       move at the same instant could each wait for the other and one
--       failed. (One session cannot race two, so this reads the lock this
--       transaction holds and where the function takes it.)
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

DO $$
DECLARE
    _fn constant text := 'public.admin_remove_industry(uuid, uuid, text)';
BEGIN
    PERFORM pg_temp.check('access: anon can run it', NOT has_function_privilege('anon', _fn, 'EXECUTE'));
    PERFORM pg_temp.check('access: authenticated can run it', NOT has_function_privilege('authenticated', _fn, 'EXECUTE'));
    PERFORM pg_temp.check('access: service role cannot run it', has_function_privilege('service_role', _fn, 'EXECUTE'));
END $$;

INSERT INTO public.industries (name, sort_order) VALUES ('Fashion', 1), ('Beauty', 2), ('Tools', 3);
INSERT INTO public.leads (merchant_name, industry_id)
SELECT n, (SELECT id FROM public.industries WHERE name = 'Fashion')
  FROM unnest(ARRAY['متجر الورد', 'Baghdad Shoes', 'Kut Style']) AS n;

DO $$
DECLARE
    _admin constant uuid := gen_random_uuid();
    _id uuid;
    _r jsonb;
    _logs integer;
BEGIN
    SET LOCAL ROLE service_role;

    -- Used by three leads: switched off, and the leads keep it.
    SELECT id INTO _id FROM public.industries WHERE name = 'Fashion';
    _r := public.admin_remove_industry(_id, _admin, 'ops@example.com');
    PERFORM pg_temp.check('used: not switched off with 3 leads: ' || _r::text,
        _r = '{"success": true, "result": "switched_off", "leads_using_it": 3}');
    PERFORM pg_temp.check('used: the industry is gone or still on',
        (SELECT is_active FROM public.industries WHERE id = _id) IS FALSE);
    PERFORM pg_temp.check('used: a lead lost its industry',
        (SELECT count(*) FROM public.leads WHERE industry_id = _id) = 3);
    PERFORM pg_temp.check('used: no log row saying switched off with 3 leads',
        EXISTS (SELECT 1 FROM public.admin_activity_logs
                 WHERE admin_user_id = _admin AND action = 'update_settings'
                   AND details @> jsonb_build_object('change', 'switched_off', 'industry_id', _id, 'name', 'Fashion', 'leads_using_it', 3)));

    -- Used by none: removed, and the log row keeps its name.
    SELECT id INTO _id FROM public.industries WHERE name = 'Tools';
    _r := public.admin_remove_industry(_id, _admin, 'ops@example.com');
    PERFORM pg_temp.check('unused: not removed: ' || _r::text, _r = '{"success": true, "result": "removed"}');
    PERFORM pg_temp.check('unused: the industry is still there', NOT EXISTS (SELECT 1 FROM public.industries WHERE id = _id));
    PERFORM pg_temp.check('unused: no log row naming Tools as removed',
        EXISTS (SELECT 1 FROM public.admin_activity_logs
                 WHERE details @> jsonb_build_object('change', 'removed', 'industry_id', _id, 'name', 'Tools', 'leads_using_it', 0)));

    SELECT count(*) INTO _logs FROM public.admin_activity_logs;
    PERFORM pg_temp.check('log: not one row per removal, got ' || _logs, _logs = 2);

    -- Refusals write nothing.
    _r := public.admin_remove_industry(gen_random_uuid(), _admin, 'ops@example.com');
    PERFORM pg_temp.check('unknown: not not_found: ' || _r::text, _r = '{"success": false, "error": "not_found"}');
    _r := public.admin_remove_industry(_id, _admin, 'ops@example.com');
    PERFORM pg_temp.check('removed twice: not not_found: ' || _r::text, _r = '{"success": false, "error": "not_found"}');
    BEGIN
        _r := public.admin_remove_industry(NULL, _admin, 'ops@example.com');
        PERFORM pg_temp.check('no industry: ran', false);
    EXCEPTION WHEN invalid_parameter_value THEN
        NULL;
    END;
    SELECT count(*) INTO _logs FROM public.admin_activity_logs;
    PERFORM pg_temp.check('refusals: wrote a log row, rows now ' || _logs, _logs = 2);
    PERFORM pg_temp.check('refusals: Beauty changed',
        (SELECT is_active FROM public.industries WHERE name = 'Beauty') IS TRUE);

    RESET ROLE;
END $$;

DO $$
DECLARE
    _body constant text := (SELECT p.prosrc FROM pg_proc p WHERE p.oid = 'public.admin_remove_industry(uuid, uuid, text)'::regprocedure);
BEGIN
    PERFORM pg_temp.check('turns: the removes above hold no table lock on industries',
        EXISTS (SELECT 1 FROM pg_locks l
                 WHERE l.pid = pg_backend_pid()
                   AND l.relation = 'public.industries'::regclass
                   AND l.mode = 'ShareRowExclusiveLock'));
    PERFORM pg_temp.check('turns: the table lock is not taken before the row lock',
        position('LOCK TABLE public.industries IN SHARE ROW EXCLUSIVE MODE' IN _body) BETWEEN 1 AND position('FOR UPDATE' IN _body));
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
