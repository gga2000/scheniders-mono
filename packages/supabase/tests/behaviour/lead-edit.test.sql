-- Behaviour test for admin_edit_lead (staff console audit, round 10), run
-- against the newest definition in packages/supabase/migrations (run.sh).
-- Every check raises on a wrong result, so psql -v ON_ERROR_STOP=1 fails.
--
-- Rules under test:
--   a change to name, phones, tags or priority is saved and writes one
--   edit_lead row naming exactly the fields that changed (and the old name
--   when the name changed);
--   fields sent unchanged (the form sends a list whole) are not named;
--   a save that changes nothing neither updates the lead nor writes a row;
--   a field the form does not own (status, owner, scores) is refused and
--   nothing is saved;
--   a lead that is gone is said to be gone;
--   a list (phones, tags, branches) sent with the copy the form opened is
--   refused, nothing saved and no row, when a colleague changed it since;
--   saved when it is as it opened; no list reads as an empty one; only the
--   lists may be compared;
--   a converted lead's name may still be edited;
--   only the service role may call it.

\set ON_ERROR_STOP 1

INSERT INTO public.leads (id, merchant_name, phone_numbers, tags, priority, city, converted_tenant_id, status, updated_at) VALUES
  ('b0000000-0000-4000-8000-000000000001', 'Kawkab', '[{"title":"Owner","number":"07701234567"}]', ARRAY['abaya'], 'medium', 'Baghdad', NULL, 'new', '2026-11-01T09:00:00Z'),
  ('b0000000-0000-4000-8000-000000000002', 'Store already', '[]', NULL, 'low', NULL, 'c0000000-0000-4000-8000-000000000001', 'converted', '2026-11-01T09:00:00Z');

DO $t$
DECLARE
    karrar constant uuid := 'a0000000-0000-4000-8000-00000000000a';
    l1 constant uuid := 'b0000000-0000-4000-8000-000000000001';
    l2 constant uuid := 'b0000000-0000-4000-8000-000000000002';
    answer jsonb;
    lead public.leads;
    n integer;
    row_details jsonb;
    t timestamptz;
BEGIN
    -- Rename, add a phone, keep the tags and city as they are (sent whole, unchanged).
    answer := public.admin_edit_lead(l1, jsonb_build_object(
        'merchant_name', 'Kawkab Baghdad',
        'phone_numbers', '[{"title":"Owner","number":"07701234567"},{"title":"Shop","number":"07809876543"}]'::jsonb,
        'tags', '["abaya"]'::jsonb,
        'city', 'Baghdad',
        'priority', 'high'
    ), karrar, 'karrar@x.test');
    IF answer <> '{"found": true, "changed": ["merchant_name", "phone_numbers", "priority"]}'::jsonb THEN
        RAISE EXCEPTION 'rename answer: %', answer;
    END IF;
    SELECT * INTO lead FROM public.leads WHERE id = l1;
    IF lead.merchant_name <> 'Kawkab Baghdad' OR jsonb_array_length(lead.phone_numbers) <> 2
       OR lead.priority <> 'high' OR lead.tags <> ARRAY['abaya'] OR lead.city <> 'Baghdad' THEN
        RAISE EXCEPTION 'rename not saved: %', to_jsonb(lead);
    END IF;
    SELECT count(*) INTO n FROM public.admin_activity_logs;
    IF n <> 1 THEN RAISE EXCEPTION 'rename wrote % rows', n; END IF;
    SELECT details INTO row_details FROM public.admin_activity_logs
    WHERE action = 'edit_lead' AND admin_user_id = karrar AND actor_email = 'karrar@x.test';
    IF row_details IS DISTINCT FROM jsonb_build_object(
        'lead_id', l1, 'merchant_name', 'Kawkab Baghdad', 'was', 'Kawkab',
        'fields', '["merchant_name", "phone_numbers", "priority"]'::jsonb) THEN
        RAISE EXCEPTION 'rename row: %', row_details;
    END IF;

    -- Tags only: the row names tags and carries no old name.
    answer := public.admin_edit_lead(l1, '{"tags": ["abaya", "vip"]}'::jsonb, karrar, 'karrar@x.test');
    IF answer->'changed' <> '["tags"]'::jsonb THEN RAISE EXCEPTION 'tags answer: %', answer; END IF;
    SELECT details INTO row_details FROM public.admin_activity_logs ORDER BY created_at DESC, id LIMIT 1;
    SELECT count(*) INTO n FROM public.admin_activity_logs WHERE details->'fields' = '["tags"]'::jsonb AND NOT details ? 'was';
    IF n <> 1 THEN RAISE EXCEPTION 'tags row: %', row_details; END IF;

    -- The same form saved again: nothing changes, nothing is written.
    SELECT updated_at INTO t FROM public.leads WHERE id = l1;
    answer := public.admin_edit_lead(l1, jsonb_build_object(
        'merchant_name', 'Kawkab Baghdad', 'tags', '["abaya", "vip"]'::jsonb, 'priority', 'high'
    ), karrar, 'karrar@x.test');
    IF answer <> '{"found": true, "changed": []}'::jsonb THEN RAISE EXCEPTION 'no-op answer: %', answer; END IF;
    IF (SELECT updated_at FROM public.leads WHERE id = l1) <> t THEN RAISE EXCEPTION 'a save that changed nothing updated the lead'; END IF;
    SELECT count(*) INTO n FROM public.admin_activity_logs;
    IF n <> 2 THEN RAISE EXCEPTION 'a save that changed nothing wrote a row (% rows)', n; END IF;

    -- A field the form does not own is refused, and nothing is saved with it.
    BEGIN
        PERFORM public.admin_edit_lead(l1, '{"merchant_name": "Sneaky", "lead_score": 100}'::jsonb, karrar, NULL);
        RAISE EXCEPTION 'lead_score was accepted';
    EXCEPTION WHEN invalid_parameter_value THEN NULL;
    END;
    BEGIN
        PERFORM public.admin_edit_lead(l1, '{"status": "converted"}'::jsonb, karrar, NULL);
        RAISE EXCEPTION 'status was accepted';
    EXCEPTION WHEN invalid_parameter_value THEN NULL;
    END;
    IF (SELECT merchant_name FROM public.leads WHERE id = l1) <> 'Kawkab Baghdad' THEN RAISE EXCEPTION 'a refused edit saved the name'; END IF;
    SELECT count(*) INTO n FROM public.admin_activity_logs;
    IF n <> 2 THEN RAISE EXCEPTION 'a refused edit wrote a row'; END IF;

    -- A lead that is gone.
    answer := public.admin_edit_lead('b0000000-0000-4000-8000-0000000000ff', '{"city": "Basra"}'::jsonb, karrar, NULL);
    IF answer <> '{"found": false, "changed": []}'::jsonb THEN RAISE EXCEPTION 'gone answer: %', answer; END IF;

    -- A converted lead keeps its owner and status locked, but its name may change.
    answer := public.admin_edit_lead(l2, '{"merchant_name": "Store, renamed"}'::jsonb, karrar, NULL);
    IF answer->'changed' <> '["merchant_name"]'::jsonb THEN RAISE EXCEPTION 'converted rename: %', answer; END IF;

    -- Lists as the form opened them (round 11). Noor added "called twice"
    -- after Ali's form opened with ["abaya", "vip"]: Ali's tags are refused.
    UPDATE public.leads SET tags = ARRAY['abaya', 'vip', 'called twice'] WHERE id = l1;
    SELECT count(*) INTO n FROM public.admin_activity_logs;
    answer := public.admin_edit_lead(l1,
        '{"tags": ["abaya", "vip", "big order"], "priority": "low"}'::jsonb, karrar, 'karrar@x.test',
        '{"tags": ["abaya", "vip"]}'::jsonb);
    IF answer <> '{"found": true, "changed": [], "stale": ["tags"]}'::jsonb THEN RAISE EXCEPTION 'stale answer: %', answer; END IF;
    SELECT * INTO lead FROM public.leads WHERE id = l1;
    IF lead.tags <> ARRAY['abaya', 'vip', 'called twice'] OR lead.priority <> 'high' THEN
        RAISE EXCEPTION 'a stale save changed the lead: %', to_jsonb(lead);
    END IF;
    IF (SELECT count(*) FROM public.admin_activity_logs) <> n THEN RAISE EXCEPTION 'a stale save wrote a row'; END IF;

    -- Opened again, the same change is saved: phones in a different key order still match.
    answer := public.admin_edit_lead(l1,
        '{"tags": ["abaya", "vip", "called twice", "big order"]}'::jsonb, karrar, 'karrar@x.test',
        jsonb_build_object('tags', '["abaya", "vip", "called twice"]'::jsonb,
                           'phone_numbers', '[{"number":"07701234567","title":"Owner"},{"number":"07809876543","title":"Shop"}]'::jsonb));
    IF answer <> '{"found": true, "changed": ["tags"]}'::jsonb THEN RAISE EXCEPTION 'fresh answer: %', answer; END IF;
    IF (SELECT count(*) FROM public.admin_activity_logs) <> n + 1 THEN RAISE EXCEPTION 'a fresh save wrote no row'; END IF;

    -- No tags at all (null) reads as an empty list.
    answer := public.admin_edit_lead(l2, '{"tags": ["shop"]}'::jsonb, karrar, NULL, '{"tags": []}'::jsonb);
    IF answer <> '{"found": true, "changed": ["tags"]}'::jsonb THEN RAISE EXCEPTION 'null tags answer: %', answer; END IF;

    -- Only the lists are compared.
    BEGIN
        PERFORM public.admin_edit_lead(l1, '{"city": "Basra"}'::jsonb, karrar, NULL, '{"city": "Baghdad"}'::jsonb);
        RAISE EXCEPTION 'a compared city was accepted';
    EXCEPTION WHEN invalid_parameter_value THEN NULL;
    END;
    BEGIN
        PERFORM public.admin_edit_lead(l1, '{"city": "Basra"}'::jsonb, karrar, NULL, '["tags"]'::jsonb);
        RAISE EXCEPTION 'lists that are not an object were accepted';
    EXCEPTION WHEN invalid_parameter_value THEN NULL;
    END;

    -- Only the service role.
    PERFORM set_config('test.role', 'authenticated', true);
    BEGIN
        PERFORM public.admin_edit_lead(l1, '{"city": "Basra"}'::jsonb, karrar, NULL);
        RAISE EXCEPTION 'an authenticated caller was let in';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    PERFORM set_config('test.role', '', true);
    IF (SELECT city FROM public.leads WHERE id = l1) <> 'Baghdad' THEN RAISE EXCEPTION 'the refused caller changed the city'; END IF;
END;
$t$;

-- Browsers cannot call it at all.
DO $g$
BEGIN
    IF has_function_privilege('anon', 'public.admin_edit_lead(uuid, jsonb, uuid, text, jsonb)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.admin_edit_lead(uuid, jsonb, uuid, text, jsonb)', 'EXECUTE') THEN
        RAISE EXCEPTION 'admin_edit_lead is open to browsers';
    END IF;
END;
$g$;
