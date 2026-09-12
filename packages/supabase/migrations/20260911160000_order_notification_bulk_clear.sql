-- Migration: O(1) bulk clear / mark-all-read for the Activity Feed, and make
-- mentions clearable.
--
-- Problem: "Clear my feed" and "Mark all as read" operated on the 50 rows the
-- dropdown had loaded. With 12,306 rows in the backlog that meant ~247 clicks to
-- actually empty the feed — it looked like it "only removes a few at a time".
-- Per-row state cannot fix that without writing 12k rows per user, so bulk
-- clearing becomes a per-user watermark instead: one row, one timestamp.
--
-- Per-row state (order_notification_user_state) stays for single-item actions.

CREATE TABLE IF NOT EXISTS public.order_notification_feed_state (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    -- Everything created at or before this is hidden from this user's feed.
    cleared_before TIMESTAMPTZ,
    -- Everything created at or before this counts as read for this user.
    read_before TIMESTAMPTZ
);

ALTER TABLE public.order_notification_feed_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS order_notification_feed_state_select ON public.order_notification_feed_state;
CREATE POLICY order_notification_feed_state_select
    ON public.order_notification_feed_state FOR SELECT
    USING (user_id = auth.uid());

DROP POLICY IF EXISTS order_notification_feed_state_insert ON public.order_notification_feed_state;
CREATE POLICY order_notification_feed_state_insert
    ON public.order_notification_feed_state FOR INSERT
    WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS order_notification_feed_state_update ON public.order_notification_feed_state;
CREATE POLICY order_notification_feed_state_update
    ON public.order_notification_feed_state FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

REVOKE ALL ON public.order_notification_feed_state FROM anon;
REVOKE ALL ON public.order_notification_feed_state FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.order_notification_feed_state TO authenticated;

-- ---------------------------------------------------------------------------
-- Feed view, now honouring the watermarks
-- ---------------------------------------------------------------------------

DROP VIEW IF EXISTS public.order_notifications_feed;
CREATE VIEW public.order_notifications_feed
WITH (security_invoker = true) AS
SELECT
    n.id,
    n.tenant_id,
    n.order_id,
    n.order_display_id,
    n.type,
    n.user_name,
    n.user_avatar,
    n.message,
    n.old_status,
    n.new_status,
    n.created_at,
    (
        n.is_read                                   -- frozen legacy floor
        OR s.read_at IS NOT NULL                    -- this user read this row
        OR (f.read_before IS NOT NULL AND n.created_at <= f.read_before)
    ) AS is_read
FROM public.order_notifications n
LEFT JOIN public.order_notification_user_state s
    ON s.notification_id = n.id AND s.user_id = auth.uid()
LEFT JOIN public.order_notification_feed_state f
    ON f.user_id = auth.uid()
WHERE s.dismissed_at IS NULL
  AND (f.cleared_before IS NULL OR n.created_at > f.cleared_before);

REVOKE ALL ON public.order_notifications_feed FROM anon;
REVOKE ALL ON public.order_notifications_feed FROM authenticated;
GRANT SELECT ON public.order_notifications_feed TO authenticated;

-- ---------------------------------------------------------------------------
-- Mentions were unclearable: chat_notifications had SELECT and UPDATE policies
-- but no DELETE, so nothing could remove them. Each row belongs to exactly one
-- recipient, so deleting your own is safe and needs no watermark.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS chat_notifications_recipient_delete ON public.chat_notifications;
CREATE POLICY chat_notifications_recipient_delete
    ON public.chat_notifications FOR DELETE
    USING (recipient_id = auth.uid());

-- ---------------------------------------------------------------------------
-- The watermarks must be stamped with SERVER time. Letting the browser send
-- `new Date()` means a user whose clock runs fast writes a cleared_before in the
-- future, which silently swallows genuinely new notifications until real time
-- catches up. These RPCs take no timestamp argument at all.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.clear_order_notification_feed()
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $$
    INSERT INTO public.order_notification_feed_state (user_id, cleared_before)
    VALUES (auth.uid(), now())
    ON CONFLICT (user_id) DO UPDATE SET cleared_before = now();
$$;

CREATE OR REPLACE FUNCTION public.mark_order_notifications_read()
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $$
    INSERT INTO public.order_notification_feed_state (user_id, read_before)
    VALUES (auth.uid(), now())
    ON CONFLICT (user_id) DO UPDATE SET read_before = now();
$$;

REVOKE ALL ON FUNCTION public.clear_order_notification_feed() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mark_order_notifications_read() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clear_order_notification_feed() TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_order_notifications_read() TO authenticated;
