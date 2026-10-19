-- The LEFT JOIN + `s.dismissed_at IS NULL` made the planner materialise every
-- row before it could filter, so it fell back to a Seq Scan + top-N sort (88ms,
-- 12,329 rows read to return 50). Expressed as NOT EXISTS, the dismissal check
-- becomes a per-row PK probe, which lets the (tenant_id, created_at DESC) index
-- drive the ORDER BY and stop at LIMIT.
CREATE OR REPLACE FUNCTION public.notification_feed(
    p_limit  INTEGER     DEFAULT 50,
    p_before TIMESTAMPTZ DEFAULT NULL,
    p_filter TEXT        DEFAULT 'all'
)
RETURNS TABLE (
    id           UUID,
    type         TEXT,
    category     TEXT,
    actor_name   TEXT,
    actor_avatar TEXT,
    entity_type  TEXT,
    entity_id    UUID,
    entity_label TEXT,
    payload      JSONB,
    priority     TEXT,
    group_key    TEXT,
    created_at   TIMESTAMPTZ,
    is_read      BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_uid     UUID := auth.uid();
    v_tenants UUID[];
    v_cleared TIMESTAMPTZ;
    v_read    TIMESTAMPTZ;
BEGIN
    IF v_uid IS NULL THEN RETURN; END IF;

    SELECT array_agg(t) INTO v_tenants FROM public.get_user_tenant_ids() t;
    IF v_tenants IS NULL THEN RETURN; END IF;

    SELECT f.cleared_before, f.read_before INTO v_cleared, v_read
    FROM public.notification_feed_state f WHERE f.user_id = v_uid;

    RETURN QUERY
    SELECT n.id, n.type, n.category, n.actor_name, n.actor_avatar,
           n.entity_type, n.entity_id, n.entity_label, n.payload,
           n.priority, n.group_key, n.created_at,
           (
               (v_read IS NOT NULL AND n.created_at <= v_read)
               OR EXISTS (
                   SELECT 1 FROM public.notification_user_state s
                   WHERE s.notification_id = n.id AND s.user_id = v_uid
                     AND s.read_at IS NOT NULL)
           ) AS is_read
    FROM public.notifications n
    WHERE n.tenant_id = ANY (v_tenants)
      AND (n.audience = 'tenant' OR n.recipient_id = v_uid)
      AND (v_cleared IS NULL OR n.created_at > v_cleared)
      AND (p_before IS NULL OR n.created_at < p_before)
      AND NOT EXISTS (
              SELECT 1 FROM public.notification_user_state s
              WHERE s.notification_id = n.id AND s.user_id = v_uid
                AND s.dismissed_at IS NOT NULL)
      AND (
            p_filter = 'all'
        OR (p_filter = 'mentions' AND n.category = 'chat')
        OR (p_filter = 'unread' AND NOT (
                (v_read IS NOT NULL AND n.created_at <= v_read)
                OR EXISTS (
                    SELECT 1 FROM public.notification_user_state s
                    WHERE s.notification_id = n.id AND s.user_id = v_uid
                      AND s.read_at IS NOT NULL)))
      )
    ORDER BY n.created_at DESC
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
END;
$$;

CREATE OR REPLACE FUNCTION public.notification_unread_count()
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
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
    FROM public.notifications n
    WHERE n.tenant_id = ANY (v_tenants)
      AND (n.audience = 'tenant' OR n.recipient_id = v_uid)
      AND (v_cleared IS NULL OR n.created_at > v_cleared)
      AND (v_read IS NULL OR n.created_at > v_read)
      AND NOT EXISTS (
              SELECT 1 FROM public.notification_user_state s
              WHERE s.notification_id = n.id AND s.user_id = v_uid
                AND (s.dismissed_at IS NOT NULL OR s.read_at IS NOT NULL));

    RETURN COALESCE(v_count, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.notification_feed(INTEGER, TIMESTAMPTZ, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.notification_unread_count() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notification_feed(INTEGER, TIMESTAMPTZ, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.notification_unread_count() TO authenticated;;
