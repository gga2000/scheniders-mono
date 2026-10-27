-- performance_bonuses_admin_only_writes (header and rollback notes: packages/supabase/tests/p1_db_security_holes.sql).
-- anon loses write privileges on performance_bonuses.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.performance_bonuses FROM anon;
