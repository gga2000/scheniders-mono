-- Platform audit round 2 (N4): get_dashboard_metrics had no shop argument and
-- read through RLS, so a member of two shops saw both shops' orders, revenue
-- forecast, funnel and staff board added together on one shop's dashboard.
-- The two-argument version reads only the named shop, after checking the
-- caller belongs to it. It is built from the live one-argument body, so the
-- rest of the formulas stay exactly as they are; each edit must land or this
-- migration fails. The one-argument form stays for pages loaded before this
-- deploy and now reads the caller's active shop only.
DO $$
DECLARE
    v_def text;
    v_hits int;
BEGIN
    v_def := pg_get_functiondef('public.get_dashboard_metrics(text)'::regprocedure);

    IF position($q$public.get_dashboard_metrics(p_range text DEFAULT 'all'::text)$q$ IN v_def) = 0 THEN
        RAISE EXCEPTION 'get_dashboard_metrics: signature not found';
    END IF;
    v_def := replace(v_def,
        $q$public.get_dashboard_metrics(p_range text DEFAULT 'all'::text)$q$,
        $q$public.get_dashboard_metrics(p_range text, p_tenant_id uuid)$q$);

    IF position('v_can_see_money := public.can_view_dashboard_money(NULL);' IN v_def) = 0 THEN
        RAISE EXCEPTION 'get_dashboard_metrics: money check not found';
    END IF;
    v_def := replace(v_def,
        'v_can_see_money := public.can_view_dashboard_money(NULL);',
        $q$IF p_tenant_id IS NULL OR p_tenant_id NOT IN (SELECT public.get_user_tenant_ids()) THEN
    RAISE EXCEPTION 'Unauthorized: not a member of this store' USING ERRCODE = '42501';
  END IF;
  v_can_see_money := public.can_view_dashboard_money(p_tenant_id);$q$);

    -- Both order reads (the working set and recent orders).
    v_hits := (SELECT count(*) FROM regexp_matches(v_def, 'WHERE o\.is_archived = false', 'g'));
    IF v_hits <> 2 THEN
        RAISE EXCEPTION 'get_dashboard_metrics: expected 2 order filters, found %', v_hits;
    END IF;
    v_def := replace(v_def, 'WHERE o.is_archived = false', 'WHERE o.tenant_id = p_tenant_id AND o.is_archived = false');

    -- The staff board reads activity logs.
    IF position($q$WHERE l.action = 'order.status_change'$q$ IN v_def) = 0 THEN
        RAISE EXCEPTION 'get_dashboard_metrics: staff filter not found';
    END IF;
    v_def := replace(v_def, $q$WHERE l.action = 'order.status_change'$q$,
        $q$WHERE l.tenant_id = p_tenant_id AND l.action = 'order.status_change'$q$);

    EXECUTE v_def;
END $$;

REVOKE EXECUTE ON FUNCTION public.get_dashboard_metrics(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_dashboard_metrics(text, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_dashboard_metrics(p_range text DEFAULT 'all'::text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
    SELECT public.get_dashboard_metrics(p_range, public.get_current_tenant_id());
$function$;
