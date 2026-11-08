-- Experiment stats: each funnel step counts everyone who got that far.
--
-- Orders placed straight from the product page (direct order) skip the
-- cart, so "add to cart" read below "orders" (0.36% vs 1.56%), and the
-- funnel looked broken. A visitor now counts as reaching the cart if they
-- added to cart, started checkout or ordered; and as reaching checkout if
-- they started checkout or ordered. Steps can only narrow, never widen.
-- Same signature, tenant check and grants as 20261108071856.

CREATE OR REPLACE FUNCTION public.aggregate_experiment_stats(p_tenant_id uuid, p_experiment_id text)
 RETURNS TABLE(arm_id text, visitors bigint, add_to_cart bigint, checkout_start bigint, orders bigint, revenue_iqd numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    IF p_tenant_id IS NULL OR p_tenant_id NOT IN (SELECT public.get_user_tenant_ids()) THEN
        RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    WITH arm_events AS (
        SELECT
            e.arm_id,
            count(DISTINCT e.visitor_key)::bigint AS visitors,
            count(*) FILTER (WHERE e.event_type = 'order')::bigint AS orders,
            COALESCE(sum(e.revenue_iqd) FILTER (WHERE e.event_type = 'order'), 0)::numeric AS revenue_iqd
        FROM public.store_config_experiment_events e
        WHERE e.tenant_id = p_tenant_id
          AND e.experiment_id = p_experiment_id
        GROUP BY e.arm_id
    ),
    first_seen AS (
        SELECT e.arm_id, e.visitor_key, min(e.created_at) AS seen_at
        FROM public.store_config_experiment_events e
        WHERE e.tenant_id = p_tenant_id
          AND e.experiment_id = p_experiment_id
        GROUP BY e.arm_id, e.visitor_key
    ),
    -- The furthest step each visitor reached: 1 cart, 2 checkout, 3 order.
    steps AS (
        SELECT s.visitor_key,
               CASE s.event_type WHEN 'add_to_cart' THEN 1 ELSE 2 END AS step,
               s.created_at
        FROM public.storefront_events s
        WHERE s.tenant_id = p_tenant_id
          AND s.event_type IN ('add_to_cart', 'initiate_checkout')
        UNION ALL
        SELECT e.visitor_key, 3, e.created_at
        FROM public.store_config_experiment_events e
        WHERE e.tenant_id = p_tenant_id
          AND e.experiment_id = p_experiment_id
          AND e.event_type = 'order'
    ),
    furthest AS (
        SELECT f.arm_id, f.visitor_key, max(st.step) AS step
        FROM first_seen f
        JOIN steps st
          ON st.visitor_key = f.visitor_key
         AND st.created_at >= f.seen_at
        GROUP BY f.arm_id, f.visitor_key
    ),
    funnel AS (
        SELECT
            fu.arm_id,
            count(*) FILTER (WHERE fu.step >= 1)::bigint AS add_to_cart,
            count(*) FILTER (WHERE fu.step >= 2)::bigint AS checkout_start
        FROM furthest fu
        GROUP BY fu.arm_id
    )
    SELECT
        a.arm_id,
        a.visitors,
        COALESCE(fn.add_to_cart, 0)::bigint,
        COALESCE(fn.checkout_start, 0)::bigint,
        a.orders,
        a.revenue_iqd
    FROM arm_events a
    LEFT JOIN funnel fn ON fn.arm_id = a.arm_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.aggregate_experiment_stats(uuid, text) FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.aggregate_experiment_stats(uuid, text) TO authenticated;
