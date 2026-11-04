-- Shield call-first list: only open orders from the last 14 days. Older open
-- orders are forgotten rows, not today's calls, and pushed real ones out.

CREATE OR REPLACE FUNCTION public.shield_risky_open_orders(p_limit integer DEFAULT 20)
RETURNS TABLE (id uuid, order_id text, customer_name text, status text, created_at timestamptz,
               own_tier text, network_band text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
    v_tenant uuid := public.require_current_tenant();
BEGIN
    RETURN QUERY
    WITH open AS (
        SELECT o.id, o.order_id, o.customer_name, o.status::text AS status, o.created_at,
               public.normalize_phone_for_search(o.phone) AS n
          FROM public.orders o
         WHERE o.tenant_id = v_tenant
           AND o.deleted_at IS NULL
           AND NOT COALESCE(o.is_test, false)
           AND NOT COALESCE(o.is_return, false)
           AND o.status::text IN ('new', 'contacted', 'confirmed', 'suspended')
           AND o.created_at >= now() - interval '14 days'
    ), net AS (
        SELECT c.phone, c.band FROM shield.compute(v_tenant, (SELECT array_agg(DISTINCT n) FROM open)) c
    )
    SELECT o.id, o.order_id, o.customer_name, o.status, o.created_at, ct.trust_tier, COALESCE(net.band, 'none')
      FROM open o
      LEFT JOIN public.customer_trust ct ON ct.tenant_id = v_tenant AND ct.phone = o.n
      LEFT JOIN net ON net.phone = o.n
     WHERE COALESCE(net.band IN ('red', 'yellow'), false)
        OR COALESCE(ct.trust_tier IN ('watch', 'risky', 'critical'), false)
     ORDER BY (net.band = 'red') DESC NULLS LAST,
              (ct.trust_tier = 'critical') DESC NULLS LAST,
              (ct.trust_tier = 'risky') DESC NULLS LAST,
              o.created_at
     LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
END;
$$;
REVOKE ALL ON FUNCTION public.shield_risky_open_orders(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shield_risky_open_orders(integer) TO authenticated;
