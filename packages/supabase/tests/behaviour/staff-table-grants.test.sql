-- Behaviour test for the staff tables' browser rights, run against the
-- migration in packages/supabase/migrations (see run.sh). Every check raises
-- on a wrong result, so psql -v ON_ERROR_STOP=1 fails.
--
-- Rules under test:
--   anon and authenticated hold no right at all on the seven staff tables
--   (the staff log, notes, watch list, commissions and their rules, badges,
--   the old tracking table);
--   the service role, which the staff console uses, keeps every right;
--   admin_users is left alone (a signed-in person reads their own row).

\set ON_ERROR_STOP 1

DO $t$
DECLARE
    staff_table text;
    browser text;
    privilege text;
BEGIN
    FOREACH staff_table IN ARRAY ARRAY['admin_activity_logs', 'admin_notes', 'admin_watchlist', 'admin_commission_config',
                                       'admin_employee_commissions', 'admin_employee_achievements', 'admin_employee_tracking'] LOOP
        FOREACH privilege IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] LOOP
            FOREACH browser IN ARRAY ARRAY['anon', 'authenticated'] LOOP
                IF has_table_privilege(browser, 'public.' || staff_table, privilege) THEN
                    RAISE EXCEPTION '% still has % on %', browser, privilege, staff_table;
                END IF;
            END LOOP;
            IF NOT has_table_privilege('service_role', 'public.' || staff_table, privilege) THEN
                RAISE EXCEPTION 'the service role lost % on %', privilege, staff_table;
            END IF;
        END LOOP;
    END LOOP;
    IF NOT has_table_privilege('authenticated', 'public.admin_users', 'SELECT') THEN
        RAISE EXCEPTION 'admin_users lost its own-row read';
    END IF;
END;
$t$;
