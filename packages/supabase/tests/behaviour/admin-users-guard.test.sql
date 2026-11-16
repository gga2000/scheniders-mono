-- Behaviour test for "the console always keeps one active super admin", run
-- against the migration in packages/supabase/migrations (see run.sh). Every
-- check raises on a wrong result, so psql -v ON_ERROR_STOP=1 fails.
--
-- Rules under test:
--   removing, demoting or switching off the last active super admin is refused;
--   with two super admins, one can go;
--   support staff come and go freely;
--   a switched-off super admin does not count;
--   one statement that removes every super admin at once is refused.

\set ON_ERROR_STOP 1

INSERT INTO public.admin_users (user_id, admin_role, is_active) VALUES
  ('60000000-0000-4000-8000-00000000000a', 'super_admin', true),
  ('60000000-0000-4000-8000-00000000000b', 'super_admin', true),
  ('60000000-0000-4000-8000-00000000000c', 'super_admin', false),
  ('60000000-0000-4000-8000-00000000000d', 'support_staff', true);

DO $t$
DECLARE
    a constant uuid := '60000000-0000-4000-8000-00000000000a';
    b constant uuid := '60000000-0000-4000-8000-00000000000b';
    off_one constant uuid := '60000000-0000-4000-8000-00000000000c';
    support constant uuid := '60000000-0000-4000-8000-00000000000d';
    left_over integer;
BEGIN
    -- Every super admin in one statement: refused, nothing changes.
    BEGIN
        DELETE FROM public.admin_users WHERE admin_role = 'super_admin';
        RAISE EXCEPTION 'removed every super admin in one statement';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    SELECT count(*) INTO left_over FROM public.admin_users;
    IF left_over <> 4 THEN RAISE EXCEPTION 'a refused delete left % rows', left_over; END IF;

    -- Support staff: demote, promote back, remove. All fine.
    UPDATE public.admin_users SET admin_role = 'super_admin' WHERE user_id = support;
    UPDATE public.admin_users SET admin_role = 'support_staff' WHERE user_id = support;
    DELETE FROM public.admin_users WHERE user_id = support;

    -- Two active super admins: one can be demoted.
    UPDATE public.admin_users SET admin_role = 'support_staff' WHERE user_id = b;

    -- Now a is the last active one (c is switched off and does not count).
    BEGIN
        DELETE FROM public.admin_users WHERE user_id = a;
        RAISE EXCEPTION 'removed the last active super admin';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    BEGIN
        UPDATE public.admin_users SET admin_role = 'support_staff' WHERE user_id = a;
        RAISE EXCEPTION 'demoted the last active super admin';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    BEGIN
        UPDATE public.admin_users SET is_active = false WHERE user_id = a;
        RAISE EXCEPTION 'switched off the last active super admin';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    -- Switching the other one back on makes room again.
    UPDATE public.admin_users SET is_active = true WHERE user_id = off_one;
    DELETE FROM public.admin_users WHERE user_id = a;
    IF NOT EXISTS (SELECT 1 FROM public.admin_users WHERE admin_role = 'super_admin' AND is_active) THEN
        RAISE EXCEPTION 'no active super admin left';
    END IF;
END;
$t$;

-- No browser role may run the guard function itself.
DO $g$
BEGIN
    IF has_function_privilege('anon', 'public.admin_users_keep_a_super_admin()', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.admin_users_keep_a_super_admin()', 'EXECUTE') THEN
        RAISE EXCEPTION 'a browser role can execute the guard function';
    END IF;
END;
$g$;
