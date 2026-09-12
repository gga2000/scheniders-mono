-- Wave 2a follow-ups.
--
-- 1. Retention must cover the unified table the feed now reads.
--    order_status_history is still deliberately NOT pruned: payroll, agent
--    confirmation stats and the order timeline all read it.
-- 2. Transition bridge — legacy writes mirror into `notifications` keeping the
--    same id, so per-user state maps across and the legacy feed stays usable as
--    a fallback while the client switches over.
--
-- The order mirrors are dropped again in 20260911220000, once order events are
-- written straight to `notifications`. The chat mirror stays: chat_send_message
-- still writes chat_notifications.

CREATE OR REPLACE FUNCTION public.prune_order_notifications(p_keep_days INTEGER DEFAULT 90)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_deleted INTEGER;
    v_total   INTEGER := 0;
BEGIN
    IF p_keep_days IS NULL OR p_keep_days < 7 THEN
        RAISE EXCEPTION 'refusing to prune with keep_days=%; minimum is 7', p_keep_days;
    END IF;

    -- Per-user state rows follow via ON DELETE CASCADE.
    DELETE FROM public.notifications
    WHERE created_at < now() - make_interval(days => p_keep_days);
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    v_total := v_total + v_deleted;

    DELETE FROM public.order_notifications
    WHERE created_at < now() - make_interval(days => p_keep_days);
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    v_total := v_total + v_deleted;

    DELETE FROM public.chat_notifications
    WHERE created_at < now() - make_interval(days => p_keep_days);
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    v_total := v_total + v_deleted;

    RETURN v_total;
END;
$$;

REVOKE ALL ON FUNCTION public.prune_order_notifications(INTEGER) FROM PUBLIC, anon, authenticated;

-- The canary must watch the table the feed reads.
CREATE OR REPLACE FUNCTION public.check_notification_pipeline()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_orders_recent  INTEGER;
    v_notifs_recent  INTEGER;
    v_status         TEXT;
    v_detail         TEXT;
BEGIN
    SELECT count(*) INTO v_orders_recent
    FROM public.orders WHERE created_at > now() - interval '2 hours';

    SELECT count(*) INTO v_notifs_recent
    FROM public.notifications WHERE created_at > now() - interval '2 hours';

    IF v_orders_recent > 0 AND v_notifs_recent = 0 THEN
        v_status := 'fail';
        v_detail := format(
            '%s orders created in the last 2h but no notification written. Last notification: %s.',
            v_orders_recent, COALESCE((SELECT max(created_at)::text FROM public.notifications), 'never'));
    ELSIF v_orders_recent = 0 THEN
        v_status := 'ok';
        v_detail := 'No order activity in the last 2h — nothing expected.';
    ELSE
        v_status := 'ok';
        v_detail := format('%s orders, %s notifications in the last 2h.', v_orders_recent, v_notifs_recent);
    END IF;

    INSERT INTO public.system_health_checks (check_name, status, detail, observed_at, failing_since)
    VALUES (
        'notification_pipeline', v_status, v_detail, now(),
        CASE WHEN v_status = 'fail'
             THEN COALESCE((SELECT failing_since FROM public.system_health_checks
                            WHERE check_name = 'notification_pipeline' AND status = 'fail'), now())
             ELSE NULL END
    )
    ON CONFLICT (check_name) DO UPDATE
    SET status = EXCLUDED.status, detail = EXCLUDED.detail,
        observed_at = EXCLUDED.observed_at, failing_since = EXCLUDED.failing_since;

    IF v_status = 'fail' THEN
        RAISE WARNING '[health] notification_pipeline FAIL: %', v_detail;
    END IF;

    RETURN v_status;
END;
$$;

REVOKE ALL ON FUNCTION public.check_notification_pipeline() FROM PUBLIC, anon, authenticated;

-- Mirrors: legacy write -> unified row, same id.
CREATE OR REPLACE FUNCTION public.mirror_chat_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
    INSERT INTO public.notifications (
        id, tenant_id, type, category, audience, recipient_id,
        actor_name, actor_avatar, entity_type, entity_id, entity_label,
        payload, group_key, created_at
    ) VALUES (
        NEW.id, NEW.tenant_id,
        CASE WHEN NEW.is_mention THEN 'chat.mention' ELSE 'chat.message' END,
        'chat', 'user', NEW.recipient_id,
        NEW.actor_name, NEW.actor_avatar,
        'conversation', NEW.conversation_id, NULL,
        jsonb_strip_nulls(jsonb_build_object(
            'preview', NEW.preview, 'message_id', NEW.message_id)),
        CASE WHEN NEW.conversation_id IS NOT NULL
             THEN 'conversation:' || NEW.conversation_id::text END,
        NEW.created_at
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.mirror_chat_notification() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_mirror_chat_notification ON public.chat_notifications;
CREATE TRIGGER trg_mirror_chat_notification
AFTER INSERT ON public.chat_notifications
FOR EACH ROW EXECUTE FUNCTION public.mirror_chat_notification();

-- Legacy chat read/delete still happens from the un-migrated chat UI; keep the
-- unified per-user state in step so the badge cannot disagree with itself.
CREATE OR REPLACE FUNCTION public.mirror_chat_notification_read()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
    IF NEW.is_read AND NOT OLD.is_read THEN
        INSERT INTO public.notification_user_state (notification_id, user_id, read_at)
        VALUES (NEW.id, NEW.recipient_id, now())
        ON CONFLICT (notification_id, user_id)
        DO UPDATE SET read_at = COALESCE(public.notification_user_state.read_at, EXCLUDED.read_at);
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.mirror_chat_notification_read() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_mirror_chat_notification_read ON public.chat_notifications;
CREATE TRIGGER trg_mirror_chat_notification_read
AFTER UPDATE ON public.chat_notifications
FOR EACH ROW EXECUTE FUNCTION public.mirror_chat_notification_read();

CREATE OR REPLACE FUNCTION public.mirror_chat_notification_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
    DELETE FROM public.notifications WHERE id = OLD.id;
    RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.mirror_chat_notification_delete() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_mirror_chat_notification_delete ON public.chat_notifications;
CREATE TRIGGER trg_mirror_chat_notification_delete
AFTER DELETE ON public.chat_notifications
FOR EACH ROW EXECUTE FUNCTION public.mirror_chat_notification_delete();
