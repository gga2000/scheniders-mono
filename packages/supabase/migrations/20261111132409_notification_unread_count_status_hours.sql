-- Bell number: order status changes in the same hour count as ONE, the way
-- the feed now shows them as one line ("14 orders changed"). About 2 of every
-- 3 notifications are status changes, so counting each one kept the badge at
-- 99+ and buried real alerts. Every other notification still counts alone.
--
-- The hour is the UTC hour (floor(epoch / 3600)). Iraq is UTC+3 with no
-- daylight saving, so it is the same hour the reader sees; the feed groups by
-- the same key (lib/notification-feed-sections.ts unreadUnitKey).
--
-- Work stays bounded: only the newest 1,000 unread rows are looked at, and
-- counting stops at 100 (the badge shows 99+ above 99).
CREATE OR REPLACE FUNCTION public.notification_unread_count()
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_uid     UUID := auth.uid();
    v_tenants UUID[];
    v_cleared TIMESTAMPTZ;
    v_read    TIMESTAMPTZ;
    v_count   INTEGER;
BEGIN
    IF v_uid IS NULL THEN RETURN 0; END IF;

    SELECT array_agg(t) INTO v_tenants FROM public.get_user_tenant_ids() t;
    IF v_tenants IS NULL THEN RETURN 0; END IF;

    SELECT f.cleared_before, f.read_before INTO v_cleared, v_read
    FROM public.notification_feed_state f WHERE f.user_id = v_uid;

    SELECT count(*) INTO v_count
    FROM (
        SELECT DISTINCT unit
        FROM (
            SELECT CASE
                       WHEN n.type = 'order.status_changed'
                           THEN 'status-hour:' || floor(extract(epoch FROM n.created_at) / 3600)::bigint
                       ELSE n.id::text
                   END AS unit
            FROM public.notifications n
            WHERE n.tenant_id = ANY (v_tenants)
              AND (n.audience = 'tenant' OR n.recipient_id = v_uid)
              AND (v_cleared IS NULL OR n.created_at > v_cleared)
              AND (v_read IS NULL OR n.created_at > v_read)
              AND NOT EXISTS (
                      SELECT 1 FROM public.notification_user_state s
                      WHERE s.notification_id = n.id AND s.user_id = v_uid
                        AND (s.dismissed_at IS NOT NULL OR s.read_at IS NOT NULL))
              AND NOT EXISTS (
                      SELECT 1 FROM public.notification_mutes m
                      WHERE m.user_id = v_uid
                        AND m.entity_type = n.entity_type
                        AND m.entity_id = n.entity_id
                        AND n.created_at > m.created_at)
            ORDER BY n.created_at DESC
            LIMIT 1000
        ) newest
        LIMIT 100
    ) units;

    RETURN COALESCE(v_count, 0);
END;
$function$;
