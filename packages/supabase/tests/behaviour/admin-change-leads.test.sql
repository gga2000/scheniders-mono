-- Behaviour test for admin_change_leads (staff console audit, round 5), run
-- against the newest definition in packages/supabase/migrations (run.sh).
-- Every check raises on a wrong result, so psql -v ON_ERROR_STOP=1 fails.
--
-- Rules under test:
--   a status change writes the status, a history line, and last_contacted_at
--   only when the lead becomes "contacted"; a lead already there is not
--   touched and gets no line;
--   with _take_owned false, a move that would take another owner's lead
--   changes nothing and says how many;
--   a move writes assigned_at, a history line and one reassign_lead row per
--   lead with its own "from"; a lead already the new owner's keeps its
--   assigned_at and gets no row;
--   a new owner must be active staff, but a lead whose owner has left can
--   still be saved with that owner sent back (round 6);
--   "converted" is refused; a converted lead
--   in the list stops the whole call and changes nothing;
--   only the service role may call it.

\set ON_ERROR_STOP 1

INSERT INTO public.admin_users (user_id, admin_role, is_active) VALUES
  ('a0000000-0000-4000-8000-00000000000a', 'support_staff', true),   -- Karrar
  ('a0000000-0000-4000-8000-00000000000b', 'support_staff', true),   -- Noor
  ('a0000000-0000-4000-8000-00000000000c', 'support_staff', false);  -- left
INSERT INTO public.user_profiles (id, email, display_name) VALUES
  ('a0000000-0000-4000-8000-00000000000a', 'karrar@x.test', 'Karrar'),
  ('a0000000-0000-4000-8000-00000000000b', 'noor@x.test', '  ');
INSERT INTO public.leads (id, merchant_name, status, assigned_to, assigned_at, last_contacted_at, converted_tenant_id) VALUES
  ('b0000000-0000-4000-8000-000000000001', 'Kawkab', 'new', NULL, NULL, NULL, NULL),
  ('b0000000-0000-4000-8000-000000000002', 'Lulu', 'contacted', NULL, NULL, '2026-11-01T09:00:00Z', NULL),
  ('b0000000-0000-4000-8000-000000000003', 'Noor shop', 'new', 'a0000000-0000-4000-8000-00000000000b', '2026-11-02T09:00:00Z', NULL, NULL),
  ('b0000000-0000-4000-8000-000000000004', 'Mine', 'new', 'a0000000-0000-4000-8000-00000000000a', '2026-11-03T09:00:00Z', NULL, NULL),
  ('b0000000-0000-4000-8000-000000000005', 'Store already', 'converted', 'a0000000-0000-4000-8000-00000000000b', '2026-11-04T09:00:00Z', NULL, 'c0000000-0000-4000-8000-000000000001'),
  ('b0000000-0000-4000-8000-000000000006', 'Left behind', 'new', 'a0000000-0000-4000-8000-00000000000c', '2026-11-05T09:00:00Z', NULL, NULL);

DO $t$
DECLARE
    karrar constant uuid := 'a0000000-0000-4000-8000-00000000000a';
    noor constant uuid := 'a0000000-0000-4000-8000-00000000000b';
    gone constant uuid := 'a0000000-0000-4000-8000-00000000000c';
    l1 constant uuid := 'b0000000-0000-4000-8000-000000000001';
    l2 constant uuid := 'b0000000-0000-4000-8000-000000000002';
    l3 constant uuid := 'b0000000-0000-4000-8000-000000000003';
    l4 constant uuid := 'b0000000-0000-4000-8000-000000000004';
    l5 constant uuid := 'b0000000-0000-4000-8000-000000000005';
    l6 constant uuid := 'b0000000-0000-4000-8000-000000000006';
    answer jsonb;
    n integer;
    t timestamptz;
    rows jsonb;
BEGIN
    -- Mark contacted on a new lead and one already contacted.
    answer := public.admin_change_leads(ARRAY[l1, l2], 'contacted', false, NULL, true, karrar, 'karrar@x.test');
    IF answer->>'status_changed' <> '1' OR answer->>'found' <> '2' THEN RAISE EXCEPTION 'contacted: %', answer; END IF;
    SELECT last_contacted_at INTO t FROM public.leads WHERE id = l1;
    IF t IS NULL THEN RAISE EXCEPTION 'contacted lead has no last_contacted_at'; END IF;
    SELECT last_contacted_at INTO t FROM public.leads WHERE id = l2;
    IF t <> '2026-11-01T09:00:00Z' THEN RAISE EXCEPTION 'a lead already contacted got a new date: %', t; END IF;
    SELECT count(*) INTO n FROM public.lead_activities WHERE activity_type = 'status_change';
    IF n <> 1 THEN RAISE EXCEPTION 'want 1 status line, got %', n; END IF;
    SELECT count(*) INTO n FROM public.lead_activities
    WHERE lead_id = l1 AND title = 'Status changed from new to contacted' AND created_by = karrar
      AND metadata = '{"from": "new", "to": "contacted"}';
    IF n <> 1 THEN RAISE EXCEPTION 'status line for Kawkab is wrong'; END IF;

    -- Assign to me without leave to take: Noor's lead is in the list.
    answer := public.admin_change_leads(ARRAY[l1, l3, l4], NULL, true, karrar, false, karrar, 'karrar@x.test');
    IF answer <> '{"success": false, "error": "owned_by_others", "count": 1}' THEN RAISE EXCEPTION 'ask first: %', answer; END IF;
    SELECT count(*) INTO n FROM public.leads WHERE assigned_to = karrar;
    IF n <> 1 THEN RAISE EXCEPTION 'asking first still moved leads: % are Karrar''s', n; END IF;
    SELECT count(*) INTO n FROM public.admin_activity_logs;
    IF n <> 0 THEN RAISE EXCEPTION 'asking first wrote % log rows', n; END IF;

    -- Same move, taken: Kawkab from no one, Noor shop from Noor; Mine stays as it was.
    answer := public.admin_change_leads(ARRAY[l1, l3, l4], NULL, true, karrar, true, karrar, 'karrar@x.test');
    IF answer->>'moved' <> '2' THEN RAISE EXCEPTION 'take: %', answer; END IF;
    SELECT count(*) INTO n FROM public.leads WHERE id IN (l1, l3) AND assigned_to = karrar AND assigned_at > now() - interval '1 minute';
    IF n <> 2 THEN RAISE EXCEPTION 'moved leads are not Karrar''s with a new assigned_at'; END IF;
    SELECT assigned_at INTO t FROM public.leads WHERE id = l4;
    IF t <> '2026-11-03T09:00:00Z' THEN RAISE EXCEPTION 'a lead already Karrar''s got a new assigned_at: %', t; END IF;
    SELECT jsonb_agg(details ORDER BY details->>'merchant_name') INTO rows
    FROM public.admin_activity_logs WHERE action = 'reassign_lead' AND admin_user_id = karrar AND actor_email = 'karrar@x.test';
    IF rows <> jsonb_build_array(
        jsonb_build_object('lead_id', l1, 'merchant_name', 'Kawkab', 'from', NULL, 'to', karrar),
        jsonb_build_object('lead_id', l3, 'merchant_name', 'Noor shop', 'from', noor, 'to', karrar)
    ) THEN RAISE EXCEPTION 'reassign rows: %', rows; END IF;
    SELECT count(*) INTO n FROM public.lead_activities
    WHERE lead_id = l3 AND activity_type = 'assignment_change' AND title = 'Owner changed from noor@x.test to Karrar';
    IF n <> 1 THEN RAISE EXCEPTION 'hand-over line for Noor shop is missing'; END IF;

    -- Back to no owner: assigned_at goes too.
    PERFORM public.admin_change_leads(ARRAY[l1], NULL, true, NULL, true, karrar, NULL);
    SELECT assigned_at INTO t FROM public.leads WHERE id = l1;
    IF t IS NOT NULL THEN RAISE EXCEPTION 'a lead with no owner kept assigned_at'; END IF;

    -- A lead whose owner has left: the form sends that owner back with a
    -- status change, and the save goes through without moving the lead.
    answer := public.admin_change_leads(ARRAY[l6], 'contacted', true, gone, true, karrar, NULL);
    IF answer <> '{"success": true, "found": 1, "status_changed": 1, "moved": 0}' THEN
        RAISE EXCEPTION 'save with the owner who left: %', answer;
    END IF;
    SELECT assigned_at INTO t FROM public.leads WHERE id = l6 AND assigned_to = gone AND status = 'contacted';
    IF t IS DISTINCT FROM '2026-11-05T09:00:00Z' THEN RAISE EXCEPTION 'the lead whose owner left changed owner or assigned_at: %', t; END IF;

    -- Refusals change nothing.
    SELECT count(*) INTO n FROM public.admin_activity_logs;
    answer := public.admin_change_leads(ARRAY[l1], NULL, true, gone, true, karrar, NULL);
    IF answer->>'error' <> 'owner_not_staff' THEN RAISE EXCEPTION 'inactive owner: %', answer; END IF;
    -- Their own lead in the list does not let another lead go to them.
    answer := public.admin_change_leads(ARRAY[l6, l1], NULL, true, gone, true, karrar, NULL);
    IF answer->>'error' <> 'owner_not_staff' THEN RAISE EXCEPTION 'inactive owner with their own lead in the list: %', answer; END IF;
    IF (SELECT assigned_to FROM public.leads WHERE id = l1) IS NOT NULL THEN RAISE EXCEPTION 'a lead went to someone who left'; END IF;
    answer := public.admin_change_leads(ARRAY[l1], 'converted', false, NULL, true, karrar, NULL);
    IF answer->>'error' <> 'use_convert' THEN RAISE EXCEPTION 'converted by hand: %', answer; END IF;
    answer := public.admin_change_leads(ARRAY[l1], NULL, false, NULL, true, karrar, NULL);
    IF answer->>'error' <> 'nothing_to_change' THEN RAISE EXCEPTION 'nothing: %', answer; END IF;
    IF (SELECT count(*) FROM public.admin_activity_logs) <> n THEN RAISE EXCEPTION 'a refusal wrote a log row'; END IF;

    -- A converted lead in a bulk move stops the whole call.
    BEGIN
        PERFORM public.admin_change_leads(ARRAY[l2, l5], NULL, true, karrar, true, karrar, NULL);
        RAISE EXCEPTION 'moving a converted lead was not refused';
    EXCEPTION WHEN raise_exception THEN
        IF SQLERRM LIKE 'moving a converted lead%' THEN RAISE; END IF;
    END;
    IF (SELECT assigned_to FROM public.leads WHERE id = l2) IS NOT NULL THEN
        RAISE EXCEPTION 'the lead before the converted one was moved anyway';
    END IF;
    IF (SELECT count(*) FROM public.admin_activity_logs) <> n THEN RAISE EXCEPTION 'a refused move left a log row'; END IF;

    -- Only the service role.
    PERFORM set_config('test.role', 'authenticated', true);
    BEGIN
        PERFORM public.admin_change_leads(ARRAY[l1], 'lost', false, NULL, true, karrar, NULL);
        RAISE EXCEPTION 'a browser role changed a lead';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    PERFORM set_config('test.role', '', true);
    IF has_function_privilege('anon', 'public.admin_change_leads(uuid[], public.lead_status, boolean, uuid, boolean, uuid, text)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.admin_change_leads(uuid[], public.lead_status, boolean, uuid, boolean, uuid, text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'a browser role may call admin_change_leads';
    END IF;
END;
$t$;
