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
        v_user_name := CASE
            WHEN TG_OP = 'INSERT' THEN public.order_source_actor_label(NEW.source)
            ELSE 'Automation'
        END;
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

REVOKE ALL ON FUNCTION public.log_order_notification() FROM PUBLIC, anon, authenticated;;
