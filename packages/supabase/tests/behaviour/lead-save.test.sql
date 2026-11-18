-- Behaviour test for admin_save_lead (staff console audit, round 12), run
-- against the newest definitions in packages/supabase/migrations (run.sh).
-- Every check raises on a wrong result, so psql -v ON_ERROR_STOP=1 fails.
--
-- Rules under test:
--   one call saves status, owner and fields, each with its history line or
--   staff log row, as admin_change_leads and admin_edit_lead write them;
--   a list a colleague changed since the form opened refuses the whole save
--   before any write: the status, owner and fields stay, with no line and
--   no row (the two-call save had saved the status first);
--   an owner who is not active staff refuses the whole save, fields too;
--   an error after the status was written (a field the form does not own)
--   undoes the status and its history line;
--   a converted lead's status is refused by its lock and nothing is saved;
--   a lead that is gone, and a save with nothing in it, are said so;
--   only the service role may call it.

\set ON_ERROR_STOP 1

INSERT INTO public.admin_users (user_id, admin_role, is_active) VALUES
  ('a0000000-0000-4000-8000-00000000000a', 'support_staff', true),   -- Karrar
  ('a0000000-0000-4000-8000-00000000000c', 'support_staff', false);  -- left
INSERT INTO public.user_profiles (id, email, display_name) VALUES
  ('a0000000-0000-4000-8000-00000000000a', 'karrar@x.test', 'Karrar');
INSERT INTO public.leads (id, merchant_name, phone_numbers, tags, status, converted_tenant_id, updated_at) VALUES
  ('b0000000-0000-4000-8000-000000000001', 'Kawkab', '[{"title":"Owner","number":"07701234567"}]', ARRAY['abaya'], 'new', NULL, '2026-11-01T09:00:00Z'),
  ('b0000000-0000-4000-8000-000000000002', 'Lulu', '[]', ARRAY['abaya'], 'new', NULL, '2026-11-01T09:00:00Z'),
  ('b0000000-0000-4000-8000-000000000003', 'Store already', '[]', NULL, 'converted', 'c0000000-0000-4000-8000-000000000001', '2026-11-01T09:00:00Z');

DO $t$
DECLARE
    karrar constant uuid := 'a0000000-0000-4000-8000-00000000000a';
    gone constant uuid := 'a0000000-0000-4000-8000-00000000000c';
    l1 constant uuid := 'b0000000-0000-4000-8000-000000000001';
    l2 constant uuid := 'b0000000-0000-4000-8000-000000000002';
    l3 constant uuid := 'b0000000-0000-4000-8000-000000000003';
    answer jsonb;
    lead public.leads;
    lines integer;
    log_rows integer;
BEGIN
    -- Status, owner, a name and a tag, with the tags as the form opened them.
    answer := public.admin_save_lead(
        l1, 'contacted', true, karrar,
        jsonb_build_object('merchant_name', 'Kawkab Baghdad', 'tags', '["abaya", "called"]'::jsonb),
        jsonb_build_object('tags', '["abaya"]'::jsonb),
        karrar, 'karrar@x.test');
    IF answer <> '{"success": true, "status_changed": 1, "moved": 1, "changed": ["merchant_name", "tags"]}'::jsonb THEN
        RAISE EXCEPTION 'full save answer: %', answer;
    END IF;
    SELECT * INTO lead FROM public.leads WHERE id = l1;
    IF lead.status <> 'contacted' OR lead.assigned_to IS DISTINCT FROM karrar OR lead.last_contacted_at IS NULL
       OR lead.merchant_name <> 'Kawkab Baghdad' OR lead.tags <> ARRAY['abaya', 'called'] THEN
        RAISE EXCEPTION 'full save not saved: %', to_jsonb(lead);
    END IF;
    SELECT count(*) INTO lines FROM public.lead_activities WHERE lead_id = l1;
    IF lines <> 2 THEN RAISE EXCEPTION 'full save wrote % history lines, not a status and an owner line', lines; END IF;
    SELECT count(*) INTO log_rows FROM public.admin_activity_logs WHERE action IN ('edit_lead', 'reassign_lead');
    IF log_rows <> 2 THEN RAISE EXCEPTION 'full save wrote % staff log rows, not edit_lead and reassign_lead', log_rows; END IF;

    -- A colleague adds a tag while this form is open; this save marks the
    -- lead interested, renames it and sends the tags as they opened.
    UPDATE public.leads SET tags = ARRAY['abaya', 'vip'] WHERE id = l2;
    answer := public.admin_save_lead(
        l2, 'interested', false, NULL,
        jsonb_build_object('merchant_name', 'Lulu Basra', 'tags', '["abaya", "called"]'::jsonb),
        jsonb_build_object('tags', '["abaya"]'::jsonb),
        karrar, 'karrar@x.test');
    IF answer <> '{"success": false, "error": "stale", "stale": ["tags"]}'::jsonb THEN
        RAISE EXCEPTION 'stale answer: %', answer;
    END IF;
    SELECT * INTO lead FROM public.leads WHERE id = l2;
    IF lead.status <> 'new' OR lead.merchant_name <> 'Lulu' OR lead.tags <> ARRAY['abaya', 'vip'] THEN
        RAISE EXCEPTION 'a stale save wrote something: %', to_jsonb(lead);
    END IF;
    IF EXISTS (SELECT 1 FROM public.lead_activities WHERE lead_id = l2) THEN
        RAISE EXCEPTION 'a stale save wrote a history line';
    END IF;

    -- An owner who left: the name is not saved either.
    answer := public.admin_save_lead(l2, NULL, true, gone, jsonb_build_object('merchant_name', 'Lulu Basra'), NULL, karrar, 'karrar@x.test');
    IF answer <> '{"success": false, "error": "owner_not_staff"}'::jsonb THEN
        RAISE EXCEPTION 'owner refusal answer: %', answer;
    END IF;
    IF (SELECT merchant_name FROM public.leads WHERE id = l2) <> 'Lulu' THEN
        RAISE EXCEPTION 'a refused owner still saved the name';
    END IF;

    -- An error after the status was written undoes the status too.
    BEGIN
        PERFORM public.admin_save_lead(l2, 'lost', false, NULL, jsonb_build_object('lead_score', 99), NULL, karrar, 'karrar@x.test');
        RAISE EXCEPTION 'a field the form does not own was let in';
    EXCEPTION WHEN invalid_parameter_value THEN
        NULL;
    END;
    IF (SELECT status FROM public.leads WHERE id = l2) <> 'new'
       OR EXISTS (SELECT 1 FROM public.lead_activities WHERE lead_id = l2) THEN
        RAISE EXCEPTION 'a failed save kept its status change';
    END IF;

    -- A converted lead's status stays locked, and its rename with it.
    BEGIN
        PERFORM public.admin_save_lead(l3, 'lost', false, NULL, jsonb_build_object('merchant_name', 'Renamed'), NULL, karrar, 'karrar@x.test');
        RAISE EXCEPTION 'a converted lead changed status';
    EXCEPTION WHEN raise_exception THEN
        IF SQLERRM NOT LIKE '%already a store%' THEN RAISE; END IF;
    END;
    IF (SELECT merchant_name FROM public.leads WHERE id = l3) <> 'Store already' THEN
        RAISE EXCEPTION 'a refused converted lead was renamed';
    END IF;

    answer := public.admin_save_lead('b0000000-0000-4000-8000-0000000000ff', 'lost', false, NULL, '{}', NULL, karrar, NULL);
    IF answer <> '{"success": false, "error": "not_found"}'::jsonb THEN RAISE EXCEPTION 'gone lead answer: %', answer; END IF;
    answer := public.admin_save_lead(l2, NULL, false, NULL, '{}', NULL, karrar, NULL);
    IF answer <> '{"success": false, "error": "nothing_to_change"}'::jsonb THEN RAISE EXCEPTION 'empty save answer: %', answer; END IF;

    -- Only the service role.
    PERFORM set_config('test.role', 'authenticated', true);
    BEGIN
        PERFORM public.admin_save_lead(l2, 'lost', false, NULL, '{}', NULL, karrar, NULL);
        RAISE EXCEPTION 'an authenticated caller was let in';
    EXCEPTION WHEN insufficient_privilege THEN
        NULL;
    END;
    PERFORM set_config('test.role', '', true);
    IF has_function_privilege('anon', 'public.admin_save_lead(uuid, public.lead_status, boolean, uuid, jsonb, jsonb, uuid, text)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.admin_save_lead(uuid, public.lead_status, boolean, uuid, jsonb, jsonb, uuid, text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'a browser role may call admin_save_lead';
    END IF;
END;
$t$;

SELECT 'lead-save: all checks passed' AS result;
