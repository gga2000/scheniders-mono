-- Staff console: the Merchants list's "last done by" badge, for every shop
-- (staff console audit, R3-6).
--
-- The badge route read the newest staff log rows of all the shops asked, cut
-- at five rows per shop, and took at most 200 shops. One busy shop's steps
-- pushed the other shops' last step out of the cut, so they showed no badge,
-- and once more than 200 shops were loaded every badge went.
--
-- admin_last_actors(shop ids) answers each shop's newest step, one per shop,
-- read through the (tenant_id, created_at) index. It is one object, shop id
-- to step, so a long list is never cut at the API's 1,000 rows. A shop with
-- no step is left out. Service role only.
--
-- Rollback: DROP FUNCTION public.admin_last_actors(uuid[]);

CREATE FUNCTION public.admin_last_actors(p_tenant_ids uuid[])
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO ''
AS $$
    SELECT coalesce(jsonb_object_agg(s.id, to_jsonb(l)), '{}'::jsonb)
    FROM (SELECT DISTINCT unnest(p_tenant_ids) AS id) s
    CROSS JOIN LATERAL (
        SELECT a.admin_user_id, a.admin_label, a.action, a.created_at
        FROM public.admin_activity_logs a
        WHERE a.tenant_id = s.id
        ORDER BY a.created_at DESC, a.id DESC
        LIMIT 1
    ) l;
$$;

REVOKE ALL ON FUNCTION public.admin_last_actors(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_last_actors(uuid[]) TO service_role;

COMMENT ON FUNCTION public.admin_last_actors(uuid[]) IS
    'Each asked shop''s newest staff log step as {shop id: {admin_user_id, admin_label, action, created_at}}, for the staff console''s Merchants badges. Service role only.';