-- Experiment stats: add-to-cart and checkout came back as 0 for every arm.
--
-- The storefront only writes `view` and `order` rows to
-- store_config_experiment_events. Add-to-cart and checkout are recorded once,
-- per visitor, in storefront_events (the merchant's own funnel). So the
-- editor showed "add to cart 0%, checkout 0%" next to real orders.
--
-- Each visitor's arm is known from their experiment rows. Their add-to-cart
-- and checkout steps are read from storefront_events, counted once per visitor
-- and only after they first saw the experiment. Shoppers send no new requests.
-- Same signature, same tenant check, same grants.

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
    funnel AS (
        SELECT
            f.arm_id,
            count(DISTINCT s.visitor_key) FILTER (WHERE s.event_type = 'add_to_cart')::bigint AS add_to_cart,
            count(DISTINCT s.visitor_key) FILTER (WHERE s.event_type = 'initiate_checkout')::bigint AS checkout_start
        FROM first_seen f
        JOIN public.storefront_events s
          ON s.tenant_id = p_tenant_id
         AND s.visitor_key = f.visitor_key
         AND s.created_at >= f.seen_at
         AND s.event_type IN ('add_to_cart', 'initiate_checkout')
        GROUP BY f.arm_id
    )
    SELECT
        a.arm_id,
        a.visitors,
        COALESCE(fu.add_to_cart, 0)::bigint,
        COALESCE(fu.checkout_start, 0)::bigint,
        a.orders,
        a.revenue_iqd
    FROM arm_events a
    LEFT JOIN funnel fu ON fu.arm_id = a.arm_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.aggregate_experiment_stats(uuid, text) FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.aggregate_experiment_stats(uuid, text) TO authenticated;
