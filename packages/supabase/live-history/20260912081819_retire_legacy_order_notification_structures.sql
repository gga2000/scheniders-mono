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

-- The view is the only reader of the column, so it goes first.
DROP VIEW IF EXISTS public.order_notifications_feed;

-- Superseded by clear_notification_feed() / mark_notifications_read().
DROP FUNCTION IF EXISTS public.clear_order_notification_feed();
DROP FUNCTION IF EXISTS public.mark_order_notifications_read();

-- Superseded by notification_user_state / notification_feed_state, into which
-- every row has been migrated.
DROP TABLE IF EXISTS public.order_notification_user_state;
DROP TABLE IF EXISTS public.order_notification_feed_state;

ALTER TABLE public.order_notifications DROP COLUMN IF EXISTS is_read;;
