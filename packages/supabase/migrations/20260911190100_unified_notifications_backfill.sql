-- Wave 2a — migrate both legacy systems into `notifications`.
--
-- The original UUIDs are preserved, so every existing per-user read/dismiss row
-- maps across without a lookup table and nothing a user already cleared comes
-- back unread.

INSERT INTO public.notifications (
    id, tenant_id, type, category, audience, recipient_id,
    actor_name, actor_avatar, entity_type, entity_id, entity_label,
    payload, group_key, created_at
)
SELECT
    n.id,
    n.tenant_id,
    CASE n.type
        WHEN 'order_created'  THEN 'order.created'
        WHEN 'status_change'  THEN 'order.status_changed'
        ELSE                       'order.updated'
    END,
    'orders',
    'tenant',
    NULL,
    n.user_name,
    n.user_avatar,
    'order',
    n.order_id,
    n.order_display_id,
    jsonb_strip_nulls(jsonb_build_object(
        'old_status', n.old_status,
        'new_status', n.new_status
    )),
    -- Group by order so B6 can collapse a busy order into one entry.
    CASE WHEN n.order_id IS NOT NULL THEN 'order:' || n.order_id::text END,
    n.created_at
FROM public.order_notifications n
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.notifications (
    id, tenant_id, type, category, audience, recipient_id,
    actor_name, actor_avatar, entity_type, entity_id, entity_label,
    payload, group_key, created_at
)
SELECT
    c.id,
    c.tenant_id,
    CASE WHEN c.is_mention THEN 'chat.mention' ELSE 'chat.message' END,
    'chat',
    'user',
    c.recipient_id,
    c.actor_name,
    c.actor_avatar,
    'conversation',
    c.conversation_id,
    NULL,
    jsonb_strip_nulls(jsonb_build_object(
        'preview',    c.preview,
        'message_id', c.message_id
    )),
    CASE WHEN c.conversation_id IS NOT NULL THEN 'conversation:' || c.conversation_id::text END,
    c.created_at
FROM public.chat_notifications c
ON CONFLICT (id) DO NOTHING;

-- Carry per-row state across (same ids).
INSERT INTO public.notification_user_state (notification_id, user_id, read_at, dismissed_at)
SELECT s.notification_id, s.user_id, s.read_at, s.dismissed_at
FROM public.order_notification_user_state s
WHERE EXISTS (SELECT 1 FROM public.notifications n WHERE n.id = s.notification_id)
ON CONFLICT (notification_id, user_id) DO NOTHING;

INSERT INTO public.notification_feed_state (user_id, cleared_before, read_before)
SELECT f.user_id, f.cleared_before, f.read_before
FROM public.order_notification_feed_state f
ON CONFLICT (user_id) DO NOTHING;

-- chat_notifications carried read state in its own boolean, per recipient.
INSERT INTO public.notification_user_state (notification_id, user_id, read_at)
SELECT c.id, c.recipient_id, c.created_at
FROM public.chat_notifications c
WHERE c.is_read
  AND EXISTS (SELECT 1 FROM public.notifications n WHERE n.id = c.id)
ON CONFLICT (notification_id, user_id) DO NOTHING;

-- The legacy order_notifications.is_read column was a frozen, tenant-wide read
-- floor: every migrated row was true, so the pre-June backlog must not reappear
-- as unread for anybody. Reproduce it as a per-user read watermark at the newest
-- such row, without moving a watermark that is already later.
DO $$
DECLARE v_floor TIMESTAMPTZ;
BEGIN
    SELECT max(created_at) INTO v_floor
    FROM public.order_notifications WHERE is_read;

    IF v_floor IS NULL THEN RETURN; END IF;

    INSERT INTO public.notification_feed_state (user_id, read_before)
    SELECT DISTINCT tm.user_id, v_floor
    FROM public.tenant_members tm
    WHERE tm.status = 'active'
    ON CONFLICT (user_id) DO UPDATE
    SET read_before = GREATEST(
        COALESCE(public.notification_feed_state.read_before, 'epoch'::timestamptz),
        EXCLUDED.read_before
    );
END $$;
