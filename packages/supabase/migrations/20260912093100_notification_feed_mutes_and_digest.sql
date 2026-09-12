-- C3 in the feed, and the scheduled digest that replaces withheld pushes (C4).
--
-- Muting silences what comes NEXT: entries that already existed when the mute
-- was created stay in the feed, so muting is not a retroactive delete.
--
-- The feed and unread-count functions are rewritten here in full (rather than
-- patched) so this file is the whole current definition; see
-- 20260911190200 for why they are anti-joins rather than LEFT JOINs.

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
      AND NOT EXISTS (
              SELECT 1 FROM public.notification_mutes m
              WHERE m.user_id = v_uid
                AND m.entity_type = n.entity_type
                AND m.entity_id = n.entity_id
                AND n.created_at > m.created_at)
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
                AND (s.dismissed_at IS NOT NULL OR s.read_at IS NOT NULL))
      AND NOT EXISTS (
              SELECT 1 FROM public.notification_mutes m
              WHERE m.user_id = v_uid
                AND m.entity_type = n.entity_type
                AND m.entity_id = n.entity_id
                AND n.created_at > m.created_at);

    RETURN COALESCE(v_count, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.notification_feed(INTEGER, TIMESTAMPTZ, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.notification_unread_count() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notification_feed(INTEGER, TIMESTAMPTZ, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.notification_unread_count() TO authenticated;

-- C4. Anyone on a digest had their pushes withheld; this is what replaces them.
-- One summary per user, counting only what arrived since their last digest and
-- is still unread — a digest about things you have already seen is noise.
CREATE OR REPLACE FUNCTION public.send_notification_digests(p_mode TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_url    TEXT;
    v_secret TEXT;
    r        RECORD;
    v_sent   INTEGER := 0;
BEGIN
    IF p_mode NOT IN ('hourly', 'daily') THEN
        RAISE EXCEPTION 'unknown digest mode %', p_mode;
    END IF;

    SELECT order_function_url, edge_secret INTO v_url, v_secret
    FROM public.chat_push_config WHERE id = 1;
    IF v_url IS NULL OR v_secret IS NULL THEN RETURN 0; END IF;

    FOR r IN
        SELECT s.user_id, s.tenant_id,
               count(*) AS pending,
               min(n.created_at) AS oldest
        FROM public.notification_settings s
        JOIN public.tenant_members tm
          ON tm.user_id = s.user_id AND tm.tenant_id = s.tenant_id AND tm.status = 'active'
        JOIN public.notifications n
          ON n.tenant_id = s.tenant_id
         AND (n.audience = 'tenant' OR n.recipient_id = s.user_id)
         AND n.created_at > COALESCE(s.digest_last_sent_at, now() - interval '1 day')
        WHERE s.digest_mode = p_mode
          -- Quiet hours and DND still apply to the digest itself.
          AND NOT public.in_quiet_hours(s.user_id, s.tenant_id)
          AND NOT EXISTS (SELECT 1 FROM public.chat_user_status cs
                          WHERE cs.user_id = s.user_id AND cs.dnd)
          AND EXISTS (SELECT 1 FROM public.chat_push_subscriptions ps
                      WHERE ps.user_id = s.user_id)
          AND NOT EXISTS (
                  SELECT 1 FROM public.notification_user_state us
                  WHERE us.notification_id = n.id AND us.user_id = s.user_id
                    AND (us.read_at IS NOT NULL OR us.dismissed_at IS NOT NULL))
          AND NOT EXISTS (
                  SELECT 1 FROM public.notification_mutes m
                  WHERE m.user_id = s.user_id
                    AND m.entity_type = n.entity_type AND m.entity_id = n.entity_id)
        GROUP BY s.user_id, s.tenant_id
        HAVING count(*) > 0
    LOOP
        BEGIN
            PERFORM net.http_post(
                url     := v_url,
                headers := jsonb_build_object(
                    'Content-Type', 'application/json',
                    'Authorization', 'Bearer ' || v_secret),
                body    := jsonb_build_object(
                    'type',       'digest',
                    'category',   'system',
                    'tenant_id',  r.tenant_id,
                    'payload',    jsonb_build_object('count', r.pending, 'since', r.oldest),
                    'recipients', to_jsonb(ARRAY[r.user_id]))
            );
            v_sent := v_sent + 1;
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END;

        UPDATE public.notification_settings
        SET digest_last_sent_at = now()
        WHERE user_id = r.user_id AND tenant_id = r.tenant_id;
    END LOOP;

    RETURN v_sent;
END;
$$;

REVOKE ALL ON FUNCTION public.send_notification_digests(TEXT) FROM PUBLIC, anon, authenticated;

SELECT cron.unschedule('notification-digest-hourly')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notification-digest-hourly');
SELECT cron.schedule('notification-digest-hourly', '5 * * * *',
                     $$SELECT public.send_notification_digests('hourly');$$);

SELECT cron.unschedule('notification-digest-daily')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notification-digest-daily');
-- 09:00 Baghdad.
SELECT cron.schedule('notification-digest-daily', '0 6 * * *',
                     $$SELECT public.send_notification_digests('daily');$$);
