-- =============================================================================
-- support-notes: behaviour test
-- =============================================================================
--
-- WHAT THIS PROVES (after the support_case_notes migration)
--   Access:
--     * anon and authenticated cannot read support_case_notes or run either
--       function; the service role reads but never writes, updates or deletes
--       a note directly, and runs both functions.
--   Notes:
--     * a note keeps its trimmed text, its writer and the conversation's shop;
--     * a solved conversation still takes notes;
--     * empty or too long text, or an unknown conversation, is refused.
--   Hand-over:
--     * the conversation's owner becomes the teammate, named from admin_users
--       (email when no name is set), and a hand-over row records who, to whom
--       and the optional note;
--     * a solved conversation, a teammate who left, someone who is not staff,
--       or the person who already owns it, is refused and nothing changes.
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

CREATE OR REPLACE FUNCTION pg_temp.refused(_sql text, _code text) RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
    EXECUTE _sql;
    RETURN false;
EXCEPTION WHEN raise_exception THEN
    RETURN SQLERRM = _code;
END $$;

DO $$
BEGIN
    PERFORM pg_temp.check('access: anon reads', NOT has_table_privilege('anon', 'public.support_case_notes', 'SELECT'));
    PERFORM pg_temp.check('access: authenticated reads', NOT has_table_privilege('authenticated', 'public.support_case_notes', 'SELECT'));
    PERFORM pg_temp.check('access: service role reads', has_table_privilege('service_role', 'public.support_case_notes', 'SELECT'));
    PERFORM pg_temp.check('access: service role inserts', NOT has_table_privilege('service_role', 'public.support_case_notes', 'INSERT'));
    PERFORM pg_temp.check('access: service role updates', NOT has_table_privilege('service_role', 'public.support_case_notes', 'UPDATE'));
    PERFORM pg_temp.check('access: service role deletes', NOT has_table_privilege('service_role', 'public.support_case_notes', 'DELETE'));
    PERFORM pg_temp.check('access: rls on', (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.support_case_notes'::regclass));
    PERFORM pg_temp.check('access: anon notes', NOT has_function_privilege('anon', 'public.support_case_add_note(uuid, uuid, text, text, uuid)', 'EXECUTE'));
    PERFORM pg_temp.check('access: authenticated notes', NOT has_function_privilege('authenticated', 'public.support_case_add_note(uuid, uuid, text, text, uuid)', 'EXECUTE'));
    PERFORM pg_temp.check('access: authenticated hands over', NOT has_function_privilege('authenticated', 'public.support_case_hand_over(uuid, uuid, text, uuid, text)', 'EXECUTE'));
    PERFORM pg_temp.check('access: service role notes', has_function_privilege('service_role', 'public.support_case_add_note(uuid, uuid, text, text, uuid)', 'EXECUTE'));
    PERFORM pg_temp.check('access: service role hands over', has_function_privilege('service_role', 'public.support_case_hand_over(uuid, uuid, text, uuid, text)', 'EXECUTE'));
END $$;

DO $$
DECLARE
    a1 uuid := '00000000-0000-4000-8000-0000000000a1';
    a2 uuid := '00000000-0000-4000-8000-0000000000a2';
    a3 uuid := '00000000-0000-4000-8000-0000000000a3';
    a4 uuid := '00000000-0000-4000-8000-0000000000a4';
    b1 uuid := '00000000-0000-4000-8000-0000000000b1';
    c1 uuid := '00000000-0000-4000-8000-0000000000c1';
    d1 uuid := '00000000-0000-4000-8000-0000000000d1';
    d2 uuid := '00000000-0000-4000-8000-0000000000d2';
    r jsonb;
    n public.support_case_notes;
    k public.support_cases;
BEGIN
    -- Notes
    r := public.support_case_add_note(d1, a1, 'Noor', '  Prime slow since 9 PM, asked them.  ');
    SELECT * INTO n FROM public.support_case_notes WHERE id = (r->>'id')::uuid;
    PERFORM pg_temp.check('note: text trimmed', n.body = 'Prime slow since 9 PM, asked them.');
    PERFORM pg_temp.check('note: kind', n.kind = 'note');
    PERFORM pg_temp.check('note: writer', n.admin_id = a1 AND n.admin_name = 'Noor');
    PERFORM pg_temp.check('note: shop', n.tenant_id = c1 AND (r->>'tenant_id')::uuid = c1);
    PERFORM pg_temp.check('note: solved case takes notes',
        (public.support_case_add_note(d2, a1, 'Noor', 'Called back, all good.')->>'tenant_id')::uuid = c1);
    PERFORM pg_temp.check('note: empty refused',
        pg_temp.refused(format('SELECT public.support_case_add_note(%L, %L, %L, %L)', d1, a1, 'Noor', '   '), 'support_note_bad_body'));
    PERFORM pg_temp.check('note: too long refused',
        pg_temp.refused(format('SELECT public.support_case_add_note(%L, %L, %L, %L)', d1, a1, 'Noor', repeat('x', 2001)), 'support_note_bad_body'));
    PERFORM pg_temp.check('note: unknown case refused',
        pg_temp.refused(format('SELECT public.support_case_add_note(%L, %L, %L, %L)', gen_random_uuid(), a1, 'Noor', 'hi'), 'support_case_not_found'));

    -- Hand-over
    r := public.support_case_hand_over(d1, a1, 'Noor', a2, '  Needs a refund, over to you.  ');
    SELECT * INTO k FROM public.support_cases WHERE id = d1;
    PERFORM pg_temp.check('handover: owner moved', k.owner_admin_id = a2 AND k.owner_name = 'Karrar');
    PERFORM pg_temp.check('handover: answer', r->>'to_name' = 'Karrar' AND (r->>'tenant_id')::uuid = c1);
    SELECT * INTO n FROM public.support_case_notes WHERE case_id = d1 AND kind = 'handover';
    PERFORM pg_temp.check('handover: recorded', n.admin_id = a1 AND n.to_admin_id = a2 AND n.to_name = 'Karrar');
    PERFORM pg_temp.check('handover: note kept', n.body = 'Needs a refund, over to you.');

    PERFORM pg_temp.check('handover: same owner refused',
        pg_temp.refused(format('SELECT public.support_case_hand_over(%L, %L, %L, %L, NULL)', d1, a1, 'Noor', a2), 'support_handover_same_owner'));
    PERFORM pg_temp.check('handover: left the team refused',
        pg_temp.refused(format('SELECT public.support_case_hand_over(%L, %L, %L, %L, NULL)', d1, a2, 'Karrar', a3), 'support_handover_bad_target'));
    PERFORM pg_temp.check('handover: not staff refused',
        pg_temp.refused(format('SELECT public.support_case_hand_over(%L, %L, %L, %L, NULL)', d1, a2, 'Karrar', b1), 'support_handover_bad_target'));
    PERFORM pg_temp.check('handover: solved refused',
        pg_temp.refused(format('SELECT public.support_case_hand_over(%L, %L, %L, %L, NULL)', d2, a1, 'Noor', a2), 'support_case_solved'));
    PERFORM pg_temp.check('handover: unknown case refused',
        pg_temp.refused(format('SELECT public.support_case_hand_over(%L, %L, %L, %L, NULL)', gen_random_uuid(), a1, 'Noor', a2), 'support_case_not_found'));
    PERFORM pg_temp.check('handover: too long note refused',
        pg_temp.refused(format('SELECT public.support_case_hand_over(%L, %L, %L, %L, %L)', d1, a2, 'Karrar', a1, repeat('x', 2001)), 'support_note_bad_body'));
    SELECT * INTO k FROM public.support_cases WHERE id = d1;
    PERFORM pg_temp.check('handover: refusals change nothing', k.owner_admin_id = a2);
    PERFORM pg_temp.check('handover: one row only', (SELECT count(*) FROM public.support_case_notes WHERE kind = 'handover') = 1);

    -- No name set: the email stands in; no note is fine.
    r := public.support_case_hand_over(d1, a2, 'Karrar', a4, '   ');
    SELECT * INTO n FROM public.support_case_notes WHERE case_id = d1 AND kind = 'handover' AND to_admin_id = a4;
    PERFORM pg_temp.check('handover: email when no name', n.to_name = 'mohammed@example.com');
    PERFORM pg_temp.check('handover: blank note stored as none', n.body IS NULL);

    -- The table refuses a note without text, or a hand-over without a teammate.
    PERFORM pg_temp.check('shape: note needs text', NOT EXISTS (
        SELECT 1 FROM public.support_case_notes WHERE kind = 'note' AND body IS NULL));
END $$;

DO $$
BEGIN
    BEGIN
        INSERT INTO public.support_case_notes (case_id, tenant_id, kind, admin_id, admin_name)
        VALUES ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000c1', 'note',
                '00000000-0000-4000-8000-0000000000a1', 'Noor');
        PERFORM pg_temp.check('shape: note without text stored', false);
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    BEGIN
        INSERT INTO public.support_case_notes (case_id, tenant_id, kind, admin_id, admin_name, body)
        VALUES ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000c1', 'handover',
                '00000000-0000-4000-8000-0000000000a1', 'Noor', 'x');
        PERFORM pg_temp.check('shape: hand-over without teammate stored', false);
    EXCEPTION WHEN check_violation THEN NULL;
    END;
END $$;

-- A request id (round 22, N8): a repeat adds no second note.
DO $$
DECLARE
    rid uuid := gen_random_uuid();
    first_ jsonb := public.support_case_add_note('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000a1', 'Noor', 'Once only', rid);
    again jsonb := public.support_case_add_note('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000a1', 'Noor', 'Once only', rid);
BEGIN
    PERFORM pg_temp.check('request id: one note', (SELECT count(*) FROM public.support_case_notes WHERE body = 'Once only') = 1);
    PERFORM pg_temp.check('request id: same note back ' || again::text, again ->> 'id' = first_ ->> 'id' AND (again ->> 'repeat')::boolean);
END $$;

DO $$
BEGIN
    IF current_setting('tt.failures') <> '' THEN
        RAISE EXCEPTION 'FAILED: %', current_setting('tt.failures');
    END IF;
END $$;

SELECT 'ALL ASSERTIONS PASSED' AS status;

ROLLBACK;
