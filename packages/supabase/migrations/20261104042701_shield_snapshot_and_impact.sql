-- Shield wave 3: remember what Shield knew when the store decided, so the app
-- can prove its value ("risky orders stopped before shipping, courier fees
-- saved") and list today's risky open orders for the morning calls.
--
-- * orders.shield_snapshot: written once, server side, the moment an order
--   leaves the open states (new / contacted / confirmed / suspended). Holds
--   the network band + score (other stores only, same rules as shield_lookup)
--   and this store's own trust tier at that moment. Nothing about other stores
--   beyond the band/score the store could already see.
-- * shield_risky_open_orders(): this store's open orders whose customer has a
--   bad record here (watch / risky / critical) or a yellow/red network band.
-- * shield_impact(from, to): flagged orders stopped before shipping vs shipped
--   anyway, and how the shipped ones ended.

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shield_snapshot jsonb;
GRANT SELECT (shield_snapshot) ON public.orders TO authenticated;

CREATE OR REPLACE FUNCTION shield.record_of(p_tenant_id uuid, p_phone text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
    SELECT jsonb_build_object(
        'network_band', COALESCE(c.band, 'none'),
        'network_score', c.score,
        'own_tier', ct.trust_tier,
        'flagged', COALESCE(c.band IN ('red', 'yellow'), false)
                   OR COALESCE(ct.trust_tier IN ('watch', 'risky', 'critical'), false),
        'at', now())
      FROM (SELECT public.normalize_phone_for_search(p_phone) AS n) x
      LEFT JOIN LATERAL shield.compute(p_tenant_id, ARRAY[x.n]) c ON true
      LEFT JOIN public.customer_trust ct ON ct.tenant_id = p_tenant_id AND ct.phone = x.n;
$$;
REVOKE ALL ON FUNCTION shield.record_of(uuid, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION shield.orders_snapshot_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
    IF NEW.shield_snapshot IS NULL
       AND OLD.status::text IN ('new', 'contacted', 'confirmed', 'suspended')
       AND NEW.status::text NOT IN ('new', 'contacted', 'confirmed', 'suspended', 'pending_checkout')
       AND NOT COALESCE(NEW.is_return, false) THEN
        NEW.shield_snapshot := shield.record_of(NEW.tenant_id, NEW.phone)
                               || jsonb_build_object('decided', NEW.status::text);
    END IF;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION shield.orders_snapshot_trigger() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_orders_shield_snapshot ON public.orders;
CREATE TRIGGER trg_orders_shield_snapshot
BEFORE UPDATE OF status ON public.orders
FOR EACH ROW EXECUTE FUNCTION shield.orders_snapshot_trigger();

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

CREATE OR REPLACE FUNCTION public.shield_impact(p_from timestamptz, p_to timestamptz)
RETURNS TABLE (flagged_decided integer, stopped integer, shipped integer, shipped_delivered integer,
               shipped_refused integer)
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
