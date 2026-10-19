-- D6. Orders sitting untouched.
--
-- Every other notification reports something that HAPPENED. This one reports
-- something that did not: orders still in `new` past the SLA. It is a sweep
-- rather than a trigger because the event is the passage of time.
--
-- Re-notifying every run would be noise, so a tenant hears at most once per
-- window and only while the backlog persists.

CREATE OR REPLACE FUNCTION public.check_order_sla(
    p_hours       INTEGER DEFAULT 2,
    p_quiet_hours INTEGER DEFAULT 6
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
    FOR r IN
        SELECT o.tenant_id, count(*) AS stuck, min(o.created_at) AS oldest
        FROM public.orders o
        WHERE o.tenant_id IS NOT NULL
          AND o.status = 'new'
          AND NOT o.is_archived
          AND o.created_at < now() - make_interval(hours => p_hours)
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

REVOKE ALL ON FUNCTION public.check_order_sla(INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;

SELECT cron.unschedule('check-order-sla')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'check-order-sla');
-- Every 30 minutes; the 6-hour quiet window keeps it to a few a day at most.
SELECT cron.schedule('check-order-sla', '*/30 * * * *',
                     $$SELECT public.check_order_sla(2, 6);$$);;
