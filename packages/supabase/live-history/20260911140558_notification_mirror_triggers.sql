-- Transition bridge: every legacy write mirrors into `notifications`, keeping the
-- same id so per-user state maps across. This avoids editing chat_send_message
-- (a large function) and leaves the legacy feed intact as a fallback while the
-- client switches over. Both mirrors are dropped once the legacy tables go.

CREATE OR REPLACE FUNCTION public.mirror_order_notification()
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
        CASE NEW.type
            WHEN 'order_created' THEN 'order.created'
            WHEN 'status_change' THEN 'order.status_changed'
            ELSE 'order.updated'
        END,
        'orders', 'tenant', NULL,
        NEW.user_name, NEW.user_avatar,
        'order', NEW.order_id, NEW.order_display_id,
        jsonb_strip_nulls(jsonb_build_object(
            'old_status', NEW.old_status, 'new_status', NEW.new_status)),
        CASE WHEN NEW.order_id IS NOT NULL THEN 'order:' || NEW.order_id::text END,
        NEW.created_at
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.mirror_order_notification() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_mirror_order_notification ON public.order_notifications;
CREATE TRIGGER trg_mirror_order_notification
AFTER INSERT ON public.order_notifications
FOR EACH ROW EXECUTE FUNCTION public.mirror_order_notification();

-- Actor corrections made by update_order_last_actor must reach the unified row too.
CREATE OR REPLACE FUNCTION public.mirror_order_notification_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
    IF NEW.user_name IS DISTINCT FROM OLD.user_name
       OR NEW.user_avatar IS DISTINCT FROM OLD.user_avatar THEN
        UPDATE public.notifications
        SET actor_name = NEW.user_name, actor_avatar = NEW.user_avatar
        WHERE id = NEW.id;
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.mirror_order_notification_update() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_mirror_order_notification_update ON public.order_notifications;
CREATE TRIGGER trg_mirror_order_notification_update
AFTER UPDATE ON public.order_notifications
FOR EACH ROW EXECUTE FUNCTION public.mirror_order_notification_update();

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
FOR EACH ROW EXECUTE FUNCTION public.mirror_chat_notification_delete();;
