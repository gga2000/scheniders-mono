CREATE OR REPLACE FUNCTION public.aggregate_experiment_stats(
    p_tenant_id     uuid,
    p_experiment_id text
)
RETURNS TABLE (
    arm_id         text,
    visitors       bigint,
    add_to_cart    bigint,
    checkout_start bigint,
    orders         bigint,
    revenue_iqd    numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.tenant_members
        WHERE tenant_id = p_tenant_id
          AND user_id = auth.uid()
          AND status = 'active'
    ) THEN
        RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    SELECT
        e.arm_id,
        count(DISTINCT e.visitor_key)::bigint AS visitors,
        count(*) FILTER (WHERE e.event_type = 'add_to_cart')::bigint AS add_to_cart,
        count(*) FILTER (WHERE e.event_type = 'checkout_start')::bigint AS checkout_start,
        count(*) FILTER (WHERE e.event_type = 'order')::bigint AS orders,
        COALESCE(sum(e.revenue_iqd) FILTER (WHERE e.event_type = 'order'), 0)::numeric AS revenue_iqd
    FROM public.store_config_experiment_events e
    WHERE e.tenant_id = p_tenant_id
      AND e.experiment_id = p_experiment_id
    GROUP BY e.arm_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.aggregate_experiment_stats(uuid, text) FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.aggregate_experiment_stats(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';;
