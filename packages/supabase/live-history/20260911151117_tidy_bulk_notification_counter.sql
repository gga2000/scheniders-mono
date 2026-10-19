CREATE OR REPLACE FUNCTION public.log_order_update_notifications()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    -- Above this many status changes in one statement, the feed gets a summary.
    BULK_THRESHOLD CONSTANT INTEGER := 5;
    v_uid     UUID;
    v_name    TEXT;
    v_avatar  TEXT;
    v_changed INTEGER;
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

    SELECT count(*) INTO v_changed
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

REVOKE ALL ON FUNCTION public.log_order_update_notifications() FROM PUBLIC, anon, authenticated;;
