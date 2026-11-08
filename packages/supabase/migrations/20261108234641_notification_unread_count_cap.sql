-- The bell badge shows "99+" above 99, but notification_unread_count()
-- counted every unread row a user ever had (3,700+ for one store, growing
-- with every order). It runs on each feed poll for every signed-in user, so at
-- 1,000 stores it would count millions of rows for a number nobody sees.
-- Stop counting at 100: the badge reads the same, and the work is bounded.
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
        SELECT 1
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
        LIMIT 100
    ) capped;

    RETURN COALESCE(v_count, 0);
END;
$function$;
