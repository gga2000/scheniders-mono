-- Shield impact: also say what the stopped orders were worth (goods that did
-- not go out on a risky trip), so the home card can show money, not only counts.
-- The return type changes, so the function is dropped and made again.

DROP FUNCTION IF EXISTS public.shield_impact(timestamptz, timestamptz);

CREATE FUNCTION public.shield_impact(p_from timestamptz, p_to timestamptz)
RETURNS TABLE (flagged_decided integer, stopped integer, stopped_value bigint, shipped integer,
               shipped_delivered integer, shipped_refused integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
    v_tenant uuid := public.require_current_tenant();
BEGIN
    RETURN QUERY
    SELECT count(*)::int,
           count(*) FILTER (WHERE o.shield_snapshot->>'decided' IN ('cancelled', 'no_response'))::int,
           COALESCE(sum(o.price) FILTER (WHERE o.shield_snapshot->>'decided' IN ('cancelled', 'no_response')), 0)::bigint,
           count(*) FILTER (WHERE o.shield_snapshot->>'decided' NOT IN ('cancelled', 'no_response'))::int,
           count(*) FILTER (WHERE o.shield_snapshot->>'decided' NOT IN ('cancelled', 'no_response')
                              AND o.status::text IN ('delivered', 'completed'))::int,
           count(*) FILTER (WHERE o.shield_snapshot->>'decided' NOT IN ('cancelled', 'no_response')
                              AND o.status::text IN ('rejected', 'returned', 'return_pending'))::int
      FROM public.orders o
     WHERE o.tenant_id = v_tenant
       AND o.deleted_at IS NULL
       AND NOT COALESCE(o.is_test, false)
       AND (o.shield_snapshot->>'flagged')::boolean
       AND (o.shield_snapshot->>'at')::timestamptz >= p_from
       AND (o.shield_snapshot->>'at')::timestamptz < p_to;
END;
$$;
REVOKE ALL ON FUNCTION public.shield_impact(timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shield_impact(timestamptz, timestamptz) TO authenticated;
