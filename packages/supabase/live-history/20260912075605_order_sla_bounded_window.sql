-- D6, corrected.
--
-- The first version counted every order still sitting in `new`, which in this
-- data is ~25-37 per day accumulating indefinitely — 5,426 of them. That made
-- the alert fire permanently with a number nobody could act on, which is how a
-- notification teaches people to ignore it.
--
-- Bounded to a recent window, so it reports the orders someone can still do
-- something about: created within `p_window_hours`, and already past the SLA.
CREATE OR REPLACE FUNCTION public.check_order_sla(
    p_hours        INTEGER DEFAULT 2,
    p_quiet_hours  INTEGER DEFAULT 6,
    p_window_hours INTEGER DEFAULT 24
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    r      RECORD;
    v_sent INTEGER := 0;
BEGIN
    IF p_window_hours <= p_hours THEN
        RAISE EXCEPTION 'window (%h) must exceed the SLA (%h)', p_window_hours, p_hours;
    END IF;

    FOR r IN
        SELECT o.tenant_id, count(*) AS stuck, min(o.created_at) AS oldest
        FROM public.orders o
        WHERE o.tenant_id IS NOT NULL
          AND o.status = 'new'
          AND NOT o.is_archived
          AND o.created_at < now() - make_interval(hours => p_hours)
          AND o.created_at > now() - make_interval(hours => p_window_hours)
        GROUP BY o.tenant_id
        HAVING count(*) > 0
    LOOP
        -- Already told this tenant recently; stay quiet.
        IF EXISTS (
            SELECT 1 FROM public.notifications n
            WHERE n.tenant_id = r.tenant_id
              AND n.type = 'order.sla_breached'
              AND n.created_at > now() - make_interval(hours => p_quiet_hours)
        ) THEN
            CONTINUE;
        END IF;

        INSERT INTO public.notifications (
            tenant_id, type, category, audience, actor_name,
            entity_type, entity_id, entity_label, payload, priority, group_key
        ) VALUES (
            r.tenant_id, 'order.sla_breached', 'orders', 'tenant', 'Automation',
            NULL, NULL, NULL,
            jsonb_build_object('count', r.stuck, 'hours', p_hours, 'oldest', r.oldest),
            'high',
            'sla:' || r.tenant_id::text || ':' || to_char(now(), 'YYYYMMDDHH24')
        );

        v_sent := v_sent + 1;
    END LOOP;

    RETURN v_sent;
END;
$$;

REVOKE ALL ON FUNCTION public.check_order_sla(INTEGER, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
DROP FUNCTION IF EXISTS public.check_order_sla(INTEGER, INTEGER);

SELECT cron.unschedule('check-order-sla')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'check-order-sla');
SELECT cron.schedule('check-order-sla', '*/30 * * * *',
                     $$SELECT public.check_order_sla(2, 6, 24);$$);

-- Remove the misleading notifications the unbounded version produced.
DELETE FROM public.notifications
WHERE type = 'order.sla_breached'
  AND (payload->>'count')::int > 500;;
