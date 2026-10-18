-- A6 + simplification: write order notifications straight into `notifications`,
-- and collapse mass status changes into one entry.
--
-- Until now order events were written to the legacy `order_notifications` table
-- and mirrored across. Writing directly removes the double-write and — more to
-- the point — lets a bulk update produce a notification type the legacy table's
-- CHECK constraint does not allow.
--
-- Coalescing needs to see the WHOLE statement, not one row at a time, so the
-- UPDATE path moves to a statement-level trigger using transition tables. A
-- bulk status change over the threshold becomes a single
-- "N orders moved to X" entry instead of N rows, N realtime events and N pushes.

CREATE OR REPLACE FUNCTION public.log_order_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_name TEXT; v_avatar TEXT;
BEGIN
    IF NEW.tenant_id IS NULL THEN RETURN NEW; END IF;

    SELECT actor_name, actor_avatar INTO v_name, v_avatar
    FROM public.resolve_order_creation_actor(NEW);

    INSERT INTO public.notifications (
        tenant_id, type, category, audience, actor_name, actor_avatar,
        entity_type, entity_id, entity_label, payload, group_key
    ) VALUES (
        NEW.tenant_id, 'order.created', 'orders', 'tenant', v_name, v_avatar,
        'order', NEW.id, '#' || NEW.order_id,
        jsonb_build_object('new_status', NEW.status),
        'order:' || NEW.id::text
    );

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.log_order_notification() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trigger_log_order_notification ON public.orders;
CREATE TRIGGER trigger_log_order_notification
AFTER INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.log_order_notification();

-- ---------------------------------------------------------------------------
-- Statement-level UPDATE handling, with coalescing.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.log_order_update_notifications()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    -- Above this many status changes in one statement, the feed gets a summary.
    BULK_THRESHOLD CONSTANT INTEGER := 5;
    v_uid        UUID;
    v_name       TEXT;
    v_avatar     TEXT;
    v_changed    INTEGER;
    v_tenant     UUID;
    v_to_status  TEXT;
    v_distinct   INTEGER;
BEGIN
    -- The acting person, if there is a session. Never read
    -- last_status_changed_by_name here: update_order_last_actor writes it ~0.4s
    -- LATER, so during this statement it still holds the PREVIOUS actor.
    v_uid := auth.uid();
    IF v_uid IS NOT NULL THEN
        SELECT up.display_name, up.avatar_url INTO v_name, v_avatar
        FROM public.user_profiles up WHERE up.id = v_uid;
    END IF;
    IF v_name IS NULL OR btrim(v_name) = '' THEN
        v_name := 'Automation';
        v_avatar := NULL;
    END IF;

    SELECT count(*), count(DISTINCT n.tenant_id), count(DISTINCT n.status),
           min(n.tenant_id), min(n.status)
      INTO v_changed, v_distinct, v_distinct, v_tenant, v_to_status
    FROM new_rows n
    JOIN old_rows o ON o.id = n.id
    WHERE n.tenant_id IS NOT NULL AND o.status IS DISTINCT FROM n.status;

    IF v_changed > BULK_THRESHOLD THEN
        -- One entry per (tenant, destination status) rather than per order.
        INSERT INTO public.notifications (
            tenant_id, type, category, audience, actor_name, actor_avatar,
            entity_type, entity_id, entity_label, payload, group_key
        )
        SELECT n.tenant_id, 'order.bulk_status_changed', 'orders', 'tenant',
               v_name, v_avatar, NULL, NULL, NULL,
               jsonb_build_object('count', count(*), 'new_status', n.status),
               'bulk:' || txid_current()::text || ':' || n.status
        FROM new_rows n
        JOIN old_rows o ON o.id = n.id
        WHERE n.tenant_id IS NOT NULL AND o.status IS DISTINCT FROM n.status
        GROUP BY n.tenant_id, n.status;

        RETURN NULL;
    END IF;

    INSERT INTO public.notifications (
        tenant_id, type, category, audience, actor_name, actor_avatar,
        entity_type, entity_id, entity_label, payload, group_key
    )
    SELECT n.tenant_id, 'order.status_changed', 'orders', 'tenant',
           v_name, v_avatar, 'order', n.id, '#' || n.order_id,
           jsonb_build_object('old_status', o.status, 'new_status', n.status),
           'order:' || n.id::text
    FROM new_rows n
    JOIN old_rows o ON o.id = n.id
    WHERE n.tenant_id IS NOT NULL AND o.status IS DISTINCT FROM n.status;

    -- A meaningful edit that was not a status change.
    INSERT INTO public.notifications (
        tenant_id, type, category, audience, actor_name, actor_avatar,
        entity_type, entity_id, entity_label, payload, group_key
    )
    SELECT n.tenant_id, 'order.updated', 'orders', 'tenant',
           v_name, v_avatar, 'order', n.id, '#' || n.order_id,
           '{}'::jsonb, 'order:' || n.id::text
    FROM new_rows n
    JOIN old_rows o ON o.id = n.id
    WHERE n.tenant_id IS NOT NULL
      AND o.status IS NOT DISTINCT FROM n.status
      AND (o.customer_name IS DISTINCT FROM n.customer_name
           OR o.phone IS DISTINCT FROM n.phone
           OR o.items::TEXT IS DISTINCT FROM n.items::TEXT);

    RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.log_order_update_notifications() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_log_order_update_notifications ON public.orders;
CREATE TRIGGER trg_log_order_update_notifications
AFTER UPDATE ON public.orders
REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
FOR EACH STATEMENT EXECUTE FUNCTION public.log_order_update_notifications();

-- Order events no longer flow through the legacy table, so its mirrors would
-- never fire. (chat_notifications keeps its mirror: chat_send_message still
-- writes there.)
DROP TRIGGER IF EXISTS trg_mirror_order_notification ON public.order_notifications;
DROP TRIGGER IF EXISTS trg_mirror_order_notification_update ON public.order_notifications;

-- Retarget the actor correction at the table the feed now reads.
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

    IF v_actor_name IS NULL THEN RETURN NEW; END IF;

    UPDATE public.orders
    SET last_status_changed_by_name = v_actor_name,
        last_status_changed_by_avatar = v_actor_avatar
    WHERE id = NEW.order_id;

    -- Name the exact automation behind an unattributed status change, once its
    -- audit row lands. Scoped to the single most recent matching entry inside a
    -- short window so a status re-entered later cannot rewrite an older one.
    IF NEW.from_status IS DISTINCT FROM NEW.to_status THEN
        SELECT n.id INTO v_notification_id
        FROM public.notifications n
        WHERE n.entity_type = 'order'
          AND n.entity_id = NEW.order_id
          AND n.type = 'order.status_changed'
          AND n.payload->>'new_status' = NEW.to_status
          AND n.payload->>'old_status' IS NOT DISTINCT FROM NEW.from_status
          AND n.created_at > now() - interval '5 minutes'
        ORDER BY n.created_at DESC
        LIMIT 1;

        IF v_notification_id IS NOT NULL THEN
            UPDATE public.notifications
            SET actor_name = v_actor_name, actor_avatar = v_actor_avatar
            WHERE id = v_notification_id;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.update_order_last_actor() FROM PUBLIC, anon, authenticated;;
