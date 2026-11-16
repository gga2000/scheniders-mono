-- =============================================================================
-- support-visits: behaviour test
-- =============================================================================
--
-- WHAT THIS PROVES (after the support_staff_visits migration)
--   * anon and authenticated cannot run it; the service role can;
--   * it lists only this shop's rows, newest first, at most 50;
--   * it lists what the merchant should know about and leaves internal
--     steps (notes, tags, call log) out;
--   * it names the staff member by display name, never by email, and gives
--     null when there is no name.
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

INSERT INTO public.admin_users (user_id, display_name) VALUES
    ('a0000000-0000-4000-8000-000000000001', ' Noor '),
    ('a0000000-0000-4000-8000-000000000002', NULL);

INSERT INTO public.admin_activity_logs (admin_user_id, actor_email, tenant_id, action, created_at) VALUES
    ('a0000000-0000-4000-8000-000000000001', 'noor@example.com', 'b0000000-0000-4000-8000-000000000001', 'extend_trial', '2026-11-16 10:00+00'),
    ('a0000000-0000-4000-8000-000000000002', 'x@example.com', 'b0000000-0000-4000-8000-000000000001', 'pause_tenant', '2026-11-16 11:00+00'),
    ('a0000000-0000-4000-8000-000000000001', 'noor@example.com', 'b0000000-0000-4000-8000-000000000001', 'update_tags', '2026-11-16 12:00+00'),
    ('a0000000-0000-4000-8000-000000000001', 'noor@example.com', 'b0000000-0000-4000-8000-000000000001', 'support_task_logged', '2026-11-16 12:30+00'),
    ('a0000000-0000-4000-8000-000000000001', 'noor@example.com', 'b0000000-0000-4000-8000-000000000002', 'extend_trial', '2026-11-16 13:00+00');

-- 60 more views on the second shop, to prove the cap.
INSERT INTO public.admin_activity_logs (admin_user_id, tenant_id, action, created_at)
SELECT 'a0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000002', 'support_view',
       '2026-11-15 00:00+00'::timestamptz + make_interval(mins => g)
FROM generate_series(1, 60) g;

DO $$
DECLARE
    v jsonb := public.support_staff_visits('b0000000-0000-4000-8000-000000000001');
BEGIN
    PERFORM pg_temp.check('access: anon', NOT has_function_privilege('anon', 'public.support_staff_visits(uuid)', 'EXECUTE'));
    PERFORM pg_temp.check('access: authenticated', NOT has_function_privilege('authenticated', 'public.support_staff_visits(uuid)', 'EXECUTE'));
    PERFORM pg_temp.check('access: service', has_function_privilege('service_role', 'public.support_staff_visits(uuid)', 'EXECUTE'));

    PERFORM pg_temp.check('list: only what the merchant should know, this shop only', jsonb_array_length(v) = 2);
    PERFORM pg_temp.check('list: newest first', v -> 0 ->> 'action' = 'pause_tenant' AND v -> 1 ->> 'action' = 'extend_trial');
    PERFORM pg_temp.check('list: display name, trimmed', v -> 1 ->> 'staff' = 'Noor');
    PERFORM pg_temp.check('list: no name gives null', v -> 0 -> 'staff' = 'null'::jsonb);
    PERFORM pg_temp.check('list: never an email', position('@' IN v::text) = 0);
    PERFORM pg_temp.check('list: has the time', (v -> 0 ->> 'at')::timestamptz = '2026-11-16 11:00+00');
    PERFORM pg_temp.check('list: capped at 50',
        jsonb_array_length(public.support_staff_visits('b0000000-0000-4000-8000-000000000002')) = 50);
    PERFORM pg_temp.check('list: cap keeps the newest',
        public.support_staff_visits('b0000000-0000-4000-8000-000000000002') -> 0 ->> 'action' = 'extend_trial');
    PERFORM pg_temp.check('list: empty shop gives an empty list',
        public.support_staff_visits('b0000000-0000-4000-8000-000000000009') = '[]'::jsonb);
END $$;

DO $$
BEGIN
    IF current_setting('tt.failures') <> '' THEN
        RAISE EXCEPTION 'FAILED: %', current_setting('tt.failures');
    END IF;
END $$;

SELECT 'ALL ASSERTIONS PASSED' AS result;

ROLLBACK;
