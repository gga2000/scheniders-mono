-- =============================================================================
-- SECURITY DEFINER guard audit — read-only, run periodically or before a deploy
-- =============================================================================
--
-- Lists every public SECURITY DEFINER function an API role can execute that
-- has no visible caller check, plus every SECURITY DEFINER function with no
-- pinned search_path. The owner (postgres) bypasses RLS, so a definer body that
-- never looks at the caller exposes whatever it reads or writes to every
-- signed-up user (or, with anon EXECUTE, to the internet).
--
-- "Caller check" is a heuristic over the body text: a reference to auth.uid(),
-- auth.role(), get_user_tenant_ids(), is_tenant_admin(), chat_is_member() /
-- chat_is_conversation_admin(), or an explicit tenant_members lookup. A hit
-- here is a function to read, not proof of a hole; a function that is safe
-- without one (it only reads public reference data, say) belongs in the
-- allowlist below, with the reason next to it.
--
-- Also flags migration files present in packages/supabase/migrations but absent
-- from supabase_migrations.schema_migrations: pass their versions in
-- tt.expected_versions (comma-separated) to check, e.g.
--   SELECT set_config('tt.expected_versions', '20261019100000,20261019100100', false);
--
-- No DDL, no writes. Returns zero rows when clean.
-- =============================================================================

WITH allowlist(fn, reason) AS (
    VALUES
        -- Storefront order tracking: needs the exact order number AND the
        -- phone's last 10 digits; returns status/stage/name/governorate only.
        ('lookup_order(uuid,text,text)', 'public order tracking, matched on order number + phone'),
        -- Membership helpers ARE the caller check.
        ('get_user_tenant_ids()', 'membership source'),
        ('is_tenant_admin(uuid)', 'reads auth.uid()'),
        ('get_current_tenant_id()', 'reads auth.uid()')
),
definers AS (
    SELECT p.oid,
           p.oid::regprocedure::text AS fn,
           p.prosrc,
           p.proconfig,
           pg_get_function_result(p.oid) AS result,
           has_function_privilege('anon', p.oid, 'execute') AS anon_x,
           has_function_privilege('authenticated', p.oid, 'execute') AS auth_x
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.prosecdef
)
SELECT 'unguarded definer' AS finding,
       d.fn,
       CASE WHEN d.anon_x THEN 'anon+authenticated' ELSE 'authenticated' END AS executable_by
  FROM definers d
 WHERE (d.anon_x OR d.auth_x)
   AND d.result <> 'trigger'
   AND d.fn NOT IN (SELECT fn FROM allowlist)
   AND d.prosrc !~* '(auth\.uid\(\)|auth\.role\(\)|get_user_tenant_ids|is_tenant_admin|chat_is_member|chat_is_conversation_admin|tenant_members)'
UNION ALL
SELECT 'definer without pinned search_path', d.fn,
       CASE WHEN d.anon_x THEN 'anon+authenticated' WHEN d.auth_x THEN 'authenticated' ELSE 'service only' END
  FROM definers d
 WHERE NOT EXISTS (SELECT 1 FROM unnest(coalesce(d.proconfig, '{}')) c WHERE c LIKE 'search_path=%')
UNION ALL
SELECT 'migration not recorded', v, NULL
  FROM unnest(string_to_array(nullif(current_setting('tt.expected_versions', true), ''), ',')) AS v
 WHERE NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations m WHERE m.version = btrim(v))
ORDER BY 1, 2;
