-- Security audit: a deactivated staff account (user_profiles.is_active = false)
-- kept receiving push alerts and digests for its old store, because the
-- recipient lists only checked tenant_members.status. Both now also require an
-- active profile, the same test has_tenant_permission uses.

CREATE OR REPLACE FUNCTION public.dispatch_notification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_url        TEXT;
    v_secret     TEXT;
    v_recipients UUID[];
BEGIN
    SELECT order_function_url, edge_secret INTO v_url, v_secret
    FROM public.chat_push_config WHERE id = 1;
    IF v_url IS NULL OR v_secret IS NULL THEN RETURN NEW; END IF;

    SELECT array_agg(u) INTO v_recipients FROM (
        SELECT DISTINCT tm.user_id AS u
        FROM public.tenant_members tm
        JOIN public.user_profiles active_profile
          ON active_profile.id = tm.user_id AND COALESCE(active_profile.is_active, true)
        WHERE tm.tenant_id = NEW.tenant_id
          AND tm.status = 'active'
          AND (NEW.audience = 'tenant' OR tm.user_id = NEW.recipient_id)
          -- Never push someone their own action back at them.
          AND NOT EXISTS (
              SELECT 1 FROM public.user_profiles up
              WHERE up.id = tm.user_id AND up.display_name = NEW.actor_name)
          -- C3: muted this specific order/conversation.
          AND NOT EXISTS (
              SELECT 1 FROM public.notification_mutes m
              WHERE m.user_id = tm.user_id
                AND m.entity_type = NEW.entity_type
                AND m.entity_id = NEW.entity_id)
          AND public.notification_channel_enabled(tm.user_id, NEW.tenant_id, NEW.category, 'push')
          AND EXISTS (SELECT 1 FROM public.chat_push_subscriptions s WHERE s.user_id = tm.user_id)
    ) q;

    IF v_recipients IS NULL OR array_length(v_recipients, 1) IS NULL THEN
        RETURN NEW;
    END IF;

    BEGIN
        PERFORM net.http_post(
            url     := v_url,
            headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'Authorization', 'Bearer ' || v_secret),
            body    := jsonb_build_object(
                'notification_id', NEW.id,
                'tenant_id',       NEW.tenant_id,
                'type',            NEW.type,
                'category',        NEW.category,
                'actor_name',      NEW.actor_name,
                'entity_type',     NEW.entity_type,
                'entity_id',       NEW.entity_id,
                'entity_label',    NEW.entity_label,
                'payload',         NEW.payload,
                'priority',        NEW.priority,
                'recipients',      to_jsonb(v_recipients))
        );
    EXCEPTION WHEN OTHERS THEN
        -- A push that cannot be sent must never roll back the notification that
        -- caused it; the in-app feed is the durable channel.
        NULL;
    END;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.send_notification_digests(p_mode text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
        JOIN public.user_profiles active_profile
          ON active_profile.id = s.user_id AND COALESCE(active_profile.is_active, true)
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
$function$;
