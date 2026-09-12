-- E4: drop the frozen `is_read` column and the structures it belonged to.
--
-- `order_notifications.is_read` was a tenant-wide read flag, frozen since
-- 20260911120000 and kept only as a read floor so the pre-June backlog would not
-- reappear as unread. The 90-day retention job has now aged that backlog out
-- (12,329 rows -> 37, all of them already read), so the floor has nothing left
-- to hold up.
--
-- Verified before dropping: every legacy notification, every per-user state row
-- and every watermark is present in the unified tables, and no client module
-- references any of these objects.
--
-- The legacy `order_notifications` TABLE itself is kept for now — it is
-- write-dead (nothing has written it since the direct-write cutover) and tiny,
-- and keeping it costs nothing while the chat side still runs on its own legacy
-- table. This migration removes only what is provably superseded.

-- A handful of legacy rows were written in the four-minute window between the
-- unified backfill and the mirror trigger being installed; carry them across
-- before anything is dropped.
INSERT INTO public.notifications (
    id, tenant_id, type, category, audience, recipient_id,
    actor_name, actor_avatar, entity_type, entity_id, entity_label,
    payload, group_key, created_at
)
SELECT n.id, n.tenant_id,
    CASE n.type WHEN 'order_created' THEN 'order.created'
                WHEN 'status_change' THEN 'order.status_changed'
                ELSE 'order.updated' END,
    'orders', 'tenant', NULL, n.user_name, n.user_avatar,
    'order', n.order_id, n.order_display_id,
    jsonb_strip_nulls(jsonb_build_object('old_status', n.old_status, 'new_status', n.new_status)),
    CASE WHEN n.order_id IS NOT NULL THEN 'order:' || n.order_id::text END,
    n.created_at
FROM public.order_notifications n
WHERE NOT EXISTS (SELECT 1 FROM public.notifications u WHERE u.id = n.id)
ON CONFLICT (id) DO NOTHING;

-- The view is the only reader of the column, so it goes first.
DROP VIEW IF EXISTS public.order_notifications_feed;

-- Superseded by clear_notification_feed() / mark_notifications_read().
DROP FUNCTION IF EXISTS public.clear_order_notification_feed();
DROP FUNCTION IF EXISTS public.mark_order_notifications_read();

-- Superseded by notification_user_state / notification_feed_state, into which
-- every row has been migrated.
DROP TABLE IF EXISTS public.order_notification_user_state;
DROP TABLE IF EXISTS public.order_notification_feed_state;

ALTER TABLE public.order_notifications DROP COLUMN IF EXISTS is_read;
