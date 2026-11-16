-- Behaviour test for one change per staff request (audit N3), run against the
-- newest definitions in packages/supabase/migrations (see run.sh). Every check
-- raises on a wrong result, so psql -v ON_ERROR_STOP=1 fails.
--
-- Rules under test:
--   the same request id for the same shop gives the days or orders once, and
--   a repeat answers with the first result marked repeat;
--   a new request id gives them again; one id may cover several shops;
--   a refusal is not kept, so the same request may ask again;
--   an id used for a different action is refused, nothing changes;
--   only the service role may call the wrappers; no browser role reads the
--   table or calls the helpers.

\set ON_ERROR_STOP 1

INSERT INTO public.tenants (id) VALUES
  ('40000000-0000-4000-8000-00000000000a'),
  ('40000000-0000-4000-8000-00000000000b');

DO $t$
DECLARE
    a constant uuid := '40000000-0000-4000-8000-00000000000a';
    b constant uuid := '40000000-0000-4000-8000-00000000000b';
    r1 constant uuid := '41000000-0000-4000-8000-000000000001';
    r2 constant uuid := '41000000-0000-4000-8000-000000000002';
    r3 constant uuid := '41000000-0000-4000-8000-000000000003';
    first jsonb;
    again jsonb;
    calls integer;
BEGIN
    -- Same request twice: one extension.
    first := public.admin_extend_trial_once(r1, a, 7, 'asked by phone');
    again := public.admin_extend_trial_once(r1, a, 7, 'asked by phone');
    SELECT count(*) INTO calls FROM public.stub_calls WHERE fn = 'extend_trial';
    IF calls <> 1 THEN RAISE EXCEPTION 'repeat extended the trial again: % calls', calls; END IF;
    IF first ? 'repeat' THEN RAISE EXCEPTION 'first answer marked repeat: %', first; END IF;
    IF again <> first || '{"repeat": true}' THEN
        RAISE EXCEPTION 'repeat answer % is not the first answer %', again, first;
    END IF;

    -- A new request extends again.
    PERFORM public.admin_extend_trial_once(r2, a, 7, 'asked again next day');
    SELECT count(*) INTO calls FROM public.stub_calls WHERE fn = 'extend_trial';
    IF calls <> 2 THEN RAISE EXCEPTION 'new request did not extend: % calls', calls; END IF;

    -- One id may cover two shops, once each.
    PERFORM public.admin_extend_subscription_once(r3, a, 30);
    PERFORM public.admin_extend_subscription_once(r3, b, 30);
    PERFORM public.admin_extend_subscription_once(r3, b, 30);
    SELECT count(*) INTO calls FROM public.stub_calls WHERE fn = 'extend_subscription';
    IF calls <> 2 THEN RAISE EXCEPTION 'one id over two shops gave % extensions, want 2', calls; END IF;

    -- Lock orders and free unlock are kept the same way.
    PERFORM public.admin_add_lock_orders_once(r2, b, 20, 'waiting for transfer');
    PERFORM public.admin_add_lock_orders_once(r2, b, 20, 'waiting for transfer');
    PERFORM public.admin_force_unlock_once('41000000-0000-4000-8000-000000000004', a, 7, 'owner promised');
    PERFORM public.admin_force_unlock_once('41000000-0000-4000-8000-000000000004', a, 7, 'owner promised');
    SELECT count(*) INTO calls FROM public.stub_calls WHERE fn IN ('add_lock_orders', 'force_unlock');
    IF calls <> 2 THEN RAISE EXCEPTION 'lock orders / unlock repeated: % calls, want 2', calls; END IF;

    -- The same id for another action on the same shop is refused, nothing runs.
    again := public.admin_extend_subscription_once(r1, a, 30);
    IF again <> '{"success": false, "error": "request_reused"}' THEN
        RAISE EXCEPTION 'reused id for another action answered %', again;
    END IF;
    SELECT count(*) INTO calls FROM public.stub_calls WHERE fn = 'extend_subscription' AND tenant_id = a;
    IF calls <> 1 THEN RAISE EXCEPTION 'reused id ran the action: % calls', calls; END IF;

    -- A refusal is not kept: the same request asks again and then succeeds.
    PERFORM set_config('test.refuse', 'not_trial', true);
    again := public.admin_extend_trial_once('41000000-0000-4000-8000-000000000005', b, 3, 'try');
    IF again <> '{"success": false, "error": "not_trial"}' THEN
        RAISE EXCEPTION 'refusal answered %', again;
    END IF;
    PERFORM set_config('test.refuse', '', true);
    again := public.admin_extend_trial_once('41000000-0000-4000-8000-000000000005', b, 3, 'try');
    IF again -> 'success' <> 'true' OR again ? 'repeat' THEN
        RAISE EXCEPTION 'retry after a refusal answered %', again;
    END IF;

    -- A missing request id is an error, not a free pass.
    BEGIN
        PERFORM public.admin_extend_trial_once(NULL, a, 7, 'no id');
        RAISE EXCEPTION 'missing request id was accepted';
    EXCEPTION WHEN invalid_parameter_value THEN NULL;
    END;

    -- A signed-in staff browser cannot call the wrappers directly.
    PERFORM set_config('test.role', 'authenticated', true);
    BEGIN
        PERFORM public.admin_extend_trial_once(gen_random_uuid(), a, 7, 'from the browser');
        RAISE EXCEPTION 'authenticated caller was allowed';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    PERFORM set_config('test.role', '', true);
END;
$t$;

-- Grants: browser roles get nothing; the service role calls only the wrappers.
DO $g$
BEGIN
    IF has_table_privilege('anon', 'public.staff_action_requests', 'SELECT')
       OR has_table_privilege('authenticated', 'public.staff_action_requests', 'SELECT') THEN
        RAISE EXCEPTION 'a browser role can read staff_action_requests';
    END IF;
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.staff_action_requests'::regclass) THEN
        RAISE EXCEPTION 'staff_action_requests has no RLS';
    END IF;
    IF has_function_privilege('authenticated', 'public.admin_extend_trial_once(uuid, uuid, integer, text, uuid, text, text)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.admin_force_unlock_once(uuid, uuid, integer, text, uuid, text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'a browser role may call a wrapper';
    END IF;
    IF NOT has_function_privilege('service_role', 'public.admin_add_lock_orders_once(uuid, uuid, integer, text, uuid, text, boolean)', 'EXECUTE') THEN
        RAISE EXCEPTION 'service_role may not call admin_add_lock_orders_once';
    END IF;
    IF has_function_privilege('service_role', 'public.staff_action_keep(uuid, uuid, text, jsonb)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.staff_action_seen(uuid, uuid, text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'a helper is callable from outside the wrappers';
    END IF;
END;
$g$;
