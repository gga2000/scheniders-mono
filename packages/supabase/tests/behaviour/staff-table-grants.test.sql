-- Behaviour test for the staff-only tables' browser rights, run against the
-- migrations in packages/supabase/migrations (see run.sh). Every check raises
-- on a wrong result, so psql -v ON_ERROR_STOP=1 fails.
--
-- Rules under test:
--   anon and authenticated hold no right at all on the seven staff tables
--   (the staff log, notes, watch list, commissions and their rules, badges,
--   the old tracking table), the five lead tables, the outreach templates
--   and the two seed-order tables;
--   the service role, which the staff console uses, keeps every right;
--   admin_users is left alone (a signed-in person reads their own row);
--   industries keeps its read for both and loses every write.

\set ON_ERROR_STOP 1

DO $t$
DECLARE
    staff_table text;
    browser text;
    privilege text;
BEGIN
    FOREACH staff_table IN ARRAY ARRAY['admin_activity_logs', 'admin_notes', 'admin_watchlist', 'admin_commission_config',
                                       'admin_employee_commissions', 'admin_employee_achievements', 'admin_employee_tracking',
                                       'leads', 'lead_activities', 'lead_follow_ups', 'lead_competitors', 'lead_social_links',
                                       'whatsapp_outreach_templates', 'order_generation_config', 'seed_customers'] LOOP
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
    FOREACH browser IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        IF NOT has_table_privilege(browser, 'public.industries', 'SELECT') THEN
            RAISE EXCEPTION '% lost the industries read the store setup needs', browser;
        END IF;
        FOREACH privilege IN ARRAY ARRAY['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] LOOP
            IF has_table_privilege(browser, 'public.industries', privilege) THEN
                RAISE EXCEPTION '% still has % on industries', browser, privilege;
            END IF;
        END LOOP;
    END LOOP;
END;
$t$;
