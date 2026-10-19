CREATE OR REPLACE FUNCTION public.order_source_actor_label(p_source TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT CASE lower(coalesce(p_source, ''))
        WHEN 'lightfunnels'  THEN 'LightFunnels'
        WHEN 'tiktok'        THEN 'TikTok'
        WHEN 'meta'          THEN 'Meta'
        WHEN 'whatsapp'      THEN 'WhatsApp'
        WHEN 'shop'          THEN 'Online Store'
        WHEN 'prime'         THEN 'Prime'
        WHEN 'excel_import'  THEN 'Excel Import'
        WHEN 'manual'        THEN 'Manual Entry'
        WHEN 'other'         THEN 'Automation'
        WHEN ''              THEN 'Automation'
        ELSE initcap(replace(p_source, '_', ' '))
    END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_status_actor(
    p_changed_by TEXT,
    OUT actor_name TEXT,
    OUT actor_avatar TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
    actor_name := NULL;
    actor_avatar := NULL;

    IF p_changed_by IS NULL THEN
        RETURN;
    END IF;

    IF p_changed_by = 'whatsapp_bot' THEN
        actor_name := 'WhatsApp Bot'; actor_avatar := 'bot'; RETURN;
    ELSIF p_changed_by IN ('waseet_api', 'waseet_sync') THEN
        actor_name := 'Waseet'; actor_avatar := 'bot'; RETURN;
    END IF;

    SELECT up.display_name, up.avatar_url INTO actor_name, actor_avatar
    FROM public.user_profiles up
    WHERE up.display_name = p_changed_by OR up.email = p_changed_by
    LIMIT 1;

    IF actor_name IS NULL THEN
        actor_name := p_changed_by;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.log_order_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_display_id TEXT;
    v_user_name  TEXT;
    v_avatar     TEXT;
    v_uid        UUID;
BEGIN
    IF NEW.tenant_id IS NULL THEN
        RETURN NEW;
    END IF;

    v_display_id := '#' || NEW.order_id;

    v_uid := auth.uid();
    IF v_uid IS NOT NULL THEN
        SELECT up.display_name, up.avatar_url INTO v_user_name, v_avatar
        FROM public.user_profiles up WHERE up.id = v_uid;
    END IF;

    IF v_user_name IS NULL OR btrim(v_user_name) = '' THEN
        v_user_name := public.order_source_actor_label(NEW.source);
        v_avatar := NULL;
    END IF;

    IF (TG_OP = 'INSERT') THEN
        INSERT INTO public.order_notifications (
            tenant_id, order_id, order_display_id, type,
            user_name, user_avatar, message, new_status
        ) VALUES (
            NEW.tenant_id, NEW.id, v_display_id, 'order_created',
            v_user_name, v_avatar,
            'New order ' || NEW.order_id || ' created', NEW.status
        );

    ELSIF (TG_OP = 'UPDATE') THEN
        IF (OLD.status IS DISTINCT FROM NEW.status) THEN
            INSERT INTO public.order_notifications (
                tenant_id, order_id, order_display_id, type,
                user_name, user_avatar, message, old_status, new_status
            ) VALUES (
                NEW.tenant_id, NEW.id, v_display_id, 'status_change',
                v_user_name, v_avatar,
                'Order ' || NEW.order_id || ' status changed: '
                    || OLD.status || ' → ' || NEW.status,
                OLD.status, NEW.status
            );

        ELSIF (OLD.customer_name IS DISTINCT FROM NEW.customer_name
               OR OLD.phone IS DISTINCT FROM NEW.phone
               OR OLD.items::TEXT IS DISTINCT FROM NEW.items::TEXT) THEN
            INSERT INTO public.order_notifications (
                tenant_id, order_id, order_display_id, type,
                user_name, user_avatar, message
            ) VALUES (
                NEW.tenant_id, NEW.id, v_display_id, 'order_updated',
                v_user_name, v_avatar,
                'Order ' || NEW.order_id || ' was updated'
            );
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.log_order_notification() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.update_order_last_actor()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_actor_name   TEXT;
    v_actor_avatar TEXT;
    v_notification_id UUID;
BEGIN
    SELECT actor_name, actor_avatar INTO v_actor_name, v_actor_avatar
    FROM public.resolve_status_actor(NEW.changed_by);

    IF v_actor_name IS NULL THEN
        RETURN NEW;
    END IF;

    UPDATE public.orders
    SET last_status_changed_by_name = v_actor_name,
        last_status_changed_by_avatar = v_actor_avatar
    WHERE id = NEW.order_id;

    IF NEW.from_status IS DISTINCT FROM NEW.to_status THEN
        SELECT n.id INTO v_notification_id
        FROM public.order_notifications n
        WHERE n.order_id = NEW.order_id
          AND n.type = 'status_change'
          AND n.new_status = NEW.to_status
          AND n.old_status IS NOT DISTINCT FROM NEW.from_status
          AND n.created_at > now() - interval '5 minutes'
        ORDER BY n.created_at DESC
        LIMIT 1;

        IF v_notification_id IS NOT NULL THEN
            UPDATE public.order_notifications
            SET user_name = v_actor_name,
                user_avatar = v_actor_avatar
            WHERE id = v_notification_id;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;;
