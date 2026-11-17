-- =============================================================================
-- admin_edit_industry: behaviour test
-- =============================================================================
--
-- WHAT THIS PROVES (staff console audit, round 10 security finding 1)
--   Access:
--     * anon and authenticated cannot run it; the service role can.
--   Editing:
--     * a rename writes the name and one staff log row naming "name" only,
--       with the industry's new name and the name it was;
--     * the same save again changes nothing and writes no row;
--     * switching off with a new average order names both fields, in the
--       form's order, and the industry by name (no "was": not renamed);
--   Refusals (nothing written, no log row):
--     * a rename onto another industry's name, in other case and spaces:
--       unique_violation (industries_name_key);
--     * a field the form does not edit (sort_order: only /move renumbers);
--     * an unknown industry: 'not_found';
--     * no industry, or changes that are not an object: an error.
--   Taking turns:
--     * it takes the industries table lock that add, remove and move take,
--       before its row lock, so an edit and a remove at the same instant do
--       not wait for each other. (One session cannot race two, so this reads
--       the lock this transaction holds and where the function takes it.)
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
    _fn constant text := 'public.admin_edit_industry(uuid, jsonb, uuid, text)';
BEGIN
    PERFORM pg_temp.check('access: anon can run it', NOT has_function_privilege('anon', _fn, 'EXECUTE'));
    PERFORM pg_temp.check('access: authenticated can run it', NOT has_function_privilege('authenticated', _fn, 'EXECUTE'));
    PERFORM pg_temp.check('access: service role cannot run it', has_function_privilege('service_role', _fn, 'EXECUTE'));
END $$;

INSERT INTO public.industries (name, name_ar, sort_order) VALUES ('Fashion', 'أزياء', 1), ('Beauty', NULL, 2);

DO $$
DECLARE
    _admin constant uuid := gen_random_uuid();
    _id uuid;
    _r jsonb;
    _logs integer;
BEGIN
    SET LOCAL ROLE service_role;
    SELECT id INTO _id FROM public.industries WHERE name = 'Beauty';

    -- A rename: the name, and one row naming only "name".
    _r := public.admin_edit_industry(_id, '{"name": "Cosmetics", "is_active": true, "color": "#6B7280"}', _admin, 'ops@example.com');
    PERFORM pg_temp.check('rename: not success: ' || _r::text,
        _r @> '{"success": true, "changed": ["name"]}' AND _r -> 'industry' ->> 'name' = 'Cosmetics');
    PERFORM pg_temp.check('rename: the name did not change',
        (SELECT name FROM public.industries WHERE id = _id) = 'Cosmetics');
    PERFORM pg_temp.check('rename: no log row naming only the name',
        EXISTS (SELECT 1 FROM public.admin_activity_logs
                 WHERE admin_user_id = _admin AND actor_email = 'ops@example.com' AND action = 'update_settings'
                   AND details = jsonb_build_object('setting', 'industries', 'change', 'edited', 'industry_id', _id,
                                                    'name', 'Cosmetics', 'was', 'Beauty', 'fields', jsonb_build_array('name'))));

    -- The same save again changes nothing and writes nothing.
    _r := public.admin_edit_industry(_id, '{"name": "Cosmetics"}', _admin, 'ops@example.com');
    PERFORM pg_temp.check('again: not an empty change: ' || _r::text, _r @> '{"success": true, "changed": []}');
    SELECT count(*) INTO _logs FROM public.admin_activity_logs;
    PERFORM pg_temp.check('again: a save that changed nothing wrote a row, rows now ' || _logs, _logs = 1);

    -- Switched off with a new average order: both fields, in the form's order.
    _r := public.admin_edit_industry(_id, '{"is_active": false, "avg_order_value_iqd": 40000}', _admin, 'ops@example.com');
    PERFORM pg_temp.check('switch off: wrong fields: ' || _r::text,
        _r -> 'changed' = '["avg_order_value_iqd", "is_active"]');
    PERFORM pg_temp.check('switch off: not written',
        (SELECT NOT is_active AND avg_order_value_iqd = 40000 FROM public.industries WHERE id = _id));
    PERFORM pg_temp.check('switch off: the row does not name Cosmetics, not renamed',
        EXISTS (SELECT 1 FROM public.admin_activity_logs
                 WHERE details @> jsonb_build_object('name', 'Cosmetics', 'fields', jsonb_build_array('avg_order_value_iqd', 'is_active'))
                   AND details -> 'was' = 'null'::jsonb));

    -- Refusals write nothing.
    BEGIN
        _r := public.admin_edit_industry(_id, '{"name": "  fashion "}', _admin, 'ops@example.com');
        PERFORM pg_temp.check('same name: ran', false);
    EXCEPTION WHEN unique_violation THEN
        NULL;
    END;
    BEGIN
        _r := public.admin_edit_industry(_id, '{"sort_order": 1}', _admin, 'ops@example.com');
        PERFORM pg_temp.check('sort_order: ran', false);
    EXCEPTION WHEN invalid_parameter_value THEN
        NULL;
    END;
    BEGIN
        _r := public.admin_edit_industry(NULL, '{"name": "X"}', _admin, 'ops@example.com');
        PERFORM pg_temp.check('no industry: ran', false);
    EXCEPTION WHEN invalid_parameter_value THEN
        NULL;
    END;
    BEGIN
        _r := public.admin_edit_industry(_id, '["name"]', _admin, 'ops@example.com');
        PERFORM pg_temp.check('changes not an object: ran', false);
    EXCEPTION WHEN invalid_parameter_value THEN
        NULL;
    END;
    _r := public.admin_edit_industry(gen_random_uuid(), '{"name": "X"}', _admin, 'ops@example.com');
    PERFORM pg_temp.check('unknown: not not_found: ' || _r::text, _r = '{"success": false, "error": "not_found"}');

    SELECT count(*) INTO _logs FROM public.admin_activity_logs;
    PERFORM pg_temp.check('refusals: wrote a log row, rows now ' || _logs, _logs = 2);
    PERFORM pg_temp.check('refusals: Cosmetics changed',
        (SELECT name = 'Cosmetics' AND sort_order = 2 FROM public.industries WHERE id = _id));

    RESET ROLE;
END $$;

DO $$
DECLARE
    _body constant text := (SELECT p.prosrc FROM pg_proc p WHERE p.oid = 'public.admin_edit_industry(uuid, jsonb, uuid, text)'::regprocedure);
BEGIN
    PERFORM pg_temp.check('turns: the edits above hold no table lock on industries',
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
