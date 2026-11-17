-- =============================================================================
-- admin_delete_leads: behaviour test
-- =============================================================================
--
-- WHAT THIS PROVES (after the admin_delete_leads migration)
--   * one lead from its own page: deleted with its history, one 'delete_lead'
--     row naming it, in the same transaction;
--   * ticked leads: deleted, one 'bulk_leads' row naming each;
--   * a lead with a prospect store is never deleted and is named back;
--   * a lead that became a shop is never deleted and is named on its own list;
--     a press of only such leads, or of leads already gone, writes no row;
--   * no ids or no _bulk: an error, nothing written;
--   * only the service role may run it.
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

INSERT INTO public.leads (id, merchant_name, prospect_tenant_id, converted_tenant_id) VALUES
    ('b0000000-0000-4000-8000-000000000001', 'Kawkab', NULL, NULL),
    ('b0000000-0000-4000-8000-000000000002', 'Zahra Perfumes', NULL, NULL),
    ('b0000000-0000-4000-8000-000000000003', 'Baghdad Tools', NULL, NULL),
    ('b0000000-0000-4000-8000-000000000004', 'Basra Shoes', 'c0000000-0000-4000-8000-000000000004', NULL),
    -- Became shops: one signed up on its own, one from its prospect store.
    ('b0000000-0000-4000-8000-000000000005', 'متجر الذهب', NULL, 'c0000000-0000-4000-8000-000000000005'),
    ('b0000000-0000-4000-8000-000000000006', 'Erbil Mall', 'c0000000-0000-4000-8000-000000000006', 'c0000000-0000-4000-8000-000000000006');
INSERT INTO public.lead_activities (lead_id, activity_type, title) VALUES
    ('b0000000-0000-4000-8000-000000000001', 'note', 'called, wants a demo');

DO $$
DECLARE
    _admin constant uuid := 'a0000000-0000-4000-8000-00000000000a';
    _r jsonb;
    _n integer;
BEGIN
    -- One lead from its own page.
    _r := public.admin_delete_leads(ARRAY['b0000000-0000-4000-8000-000000000001']::uuid[], _admin, 'ops@x.test', false);
    PERFORM pg_temp.check('one: answer is not Kawkab removed: ' || _r::text,
        _r = '{"removed": [{"id": "b0000000-0000-4000-8000-000000000001", "merchant_name": "Kawkab"}], "kept_with_store": [], "kept_converted": []}');
    PERFORM pg_temp.check('one: the lead is still there',
        NOT EXISTS (SELECT 1 FROM public.leads WHERE id = 'b0000000-0000-4000-8000-000000000001'));
    PERFORM pg_temp.check('one: its history is still there',
        NOT EXISTS (SELECT 1 FROM public.lead_activities WHERE lead_id = 'b0000000-0000-4000-8000-000000000001'));
    SELECT count(*) INTO _n FROM public.admin_activity_logs
     WHERE action = 'delete_lead' AND admin_user_id = _admin AND actor_email = 'ops@x.test'
       AND details = '{"lead_id": "b0000000-0000-4000-8000-000000000001", "merchant_name": "Kawkab"}';
    PERFORM pg_temp.check('one: not one delete_lead row naming Kawkab, got ' || _n, _n = 1);

    -- Ticked leads, one with a prospect store.
    _r := public.admin_delete_leads(ARRAY[
        'b0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000003',
        'b0000000-0000-4000-8000-000000000004']::uuid[], _admin, 'ops@x.test', true);
    PERFORM pg_temp.check('bulk: removed is not the two without a store: ' || _r::text,
        _r -> 'removed' = '[{"id": "b0000000-0000-4000-8000-000000000003", "merchant_name": "Baghdad Tools"},
                            {"id": "b0000000-0000-4000-8000-000000000002", "merchant_name": "Zahra Perfumes"}]');
    PERFORM pg_temp.check('bulk: the store lead is not named back: ' || _r::text, _r -> 'kept_with_store' = '["Basra Shoes"]');
    PERFORM pg_temp.check('bulk: the lead with a prospect store was deleted',
        EXISTS (SELECT 1 FROM public.leads WHERE id = 'b0000000-0000-4000-8000-000000000004'));
    SELECT count(*) INTO _n FROM public.admin_activity_logs
     WHERE action = 'bulk_leads' AND admin_user_id = _admin
       AND details @> '{"action": "delete", "changed": 2}'
       AND jsonb_array_length(details -> 'leads') = 2;
    PERFORM pg_temp.check('bulk: not one bulk_leads row naming both, got ' || _n, _n = 1);

    -- THE LOST CASE: a lead that became a shop is never deleted, so its
    -- conversion stays in Lead numbers, the Team board and its commission
    -- row. It is named on its own list, even when it came from a prospect store.
    SELECT count(*) INTO _n FROM public.admin_activity_logs;
    _r := public.admin_delete_leads(ARRAY[
        'b0000000-0000-4000-8000-000000000005', 'b0000000-0000-4000-8000-000000000006']::uuid[], _admin, 'ops@x.test', true);
    PERFORM pg_temp.check('shops: answer is wrong: ' || _r::text,
        _r = '{"removed": [], "kept_with_store": [], "kept_converted": ["Erbil Mall", "متجر الذهب"]}');
    PERFORM pg_temp.check('shops: a converted lead was deleted',
        (SELECT count(*) FROM public.leads WHERE converted_tenant_id IS NOT NULL) = 2);
    PERFORM pg_temp.check('shops: a row was written', (SELECT count(*) FROM public.admin_activity_logs) = _n);

    -- Nothing to delete: no row.
    SELECT count(*) INTO _n FROM public.admin_activity_logs;
    _r := public.admin_delete_leads(ARRAY['b0000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000001']::uuid[], _admin, 'ops@x.test', true);
    PERFORM pg_temp.check('none: answer is wrong: ' || _r::text, _r = '{"removed": [], "kept_with_store": ["Basra Shoes"], "kept_converted": []}');
    PERFORM pg_temp.check('none: a row was written', (SELECT count(*) FROM public.admin_activity_logs) = _n);

    -- Bad calls.
    BEGIN
        PERFORM public.admin_delete_leads(ARRAY[]::uuid[], _admin, 'ops@x.test', true);
        PERFORM pg_temp.check('no ids: ran', false);
    EXCEPTION WHEN invalid_parameter_value THEN NULL;
    END;
    BEGIN
        PERFORM public.admin_delete_leads(ARRAY['b0000000-0000-4000-8000-000000000004']::uuid[], _admin, 'ops@x.test', NULL);
        PERFORM pg_temp.check('no _bulk: ran', false);
    EXCEPTION WHEN invalid_parameter_value THEN NULL;
    END;

    PERFORM pg_temp.check('access: anon can run it',
        NOT has_function_privilege('anon', 'public.admin_delete_leads(uuid[], uuid, text, boolean)', 'EXECUTE'));
    PERFORM pg_temp.check('access: authenticated can run it',
        NOT has_function_privilege('authenticated', 'public.admin_delete_leads(uuid[], uuid, text, boolean)', 'EXECUTE'));
    PERFORM pg_temp.check('access: service role cannot run it',
        has_function_privilege('service_role', 'public.admin_delete_leads(uuid[], uuid, text, boolean)', 'EXECUTE'));
END $$;

DO $$
BEGIN
    IF current_setting('tt.failures') <> '' THEN
        RAISE EXCEPTION 'FAILED: %', current_setting('tt.failures');
    END IF;
END $$;

SELECT 'ALL ASSERTIONS PASSED' AS status;

ROLLBACK;
