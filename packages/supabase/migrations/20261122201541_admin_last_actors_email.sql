-- Staff console: the Merchants badge names the person a staff log row names
-- (staff console audit, round 23 data new 3).
--
-- admin_last_actors answered admin_user_id, admin_label, action and
-- created_at, so a step whose row keeps the person's email but no staff id
-- (written outside the console) read "system" on Merchants, while the shop's
-- timeline named the email. It now answers actor_email too; the route names
-- the step as the timeline does: the staff name, else the email, else the
-- label. Same body otherwise. Service role only, as before.
--
-- Rollback: re-run 20261122192432_admin_last_actors.sql's body with
-- CREATE OR REPLACE.

CREATE OR REPLACE FUNCTION public.admin_last_actors(p_tenant_ids uuid[])
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO ''
AS $$
    SELECT coalesce(jsonb_object_agg(s.id, to_jsonb(l)), '{}'::jsonb)
    FROM (SELECT DISTINCT unnest(p_tenant_ids) AS id) s
    CROSS JOIN LATERAL (
        SELECT a.admin_user_id, a.admin_label, a.actor_email, a.action, a.created_at
        FROM public.admin_activity_logs a
        WHERE a.tenant_id = s.id
        ORDER BY a.created_at DESC, a.id DESC
        LIMIT 1
    ) l;
$$;

REVOKE ALL ON FUNCTION public.admin_last_actors(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_last_actors(uuid[]) TO service_role;

COMMENT ON FUNCTION public.admin_last_actors(uuid[]) IS
    'Each asked shop''s newest staff log step as {shop id: {admin_user_id, admin_label, actor_email, action, created_at}}, for the staff console''s Merchants badges. Service role only.';