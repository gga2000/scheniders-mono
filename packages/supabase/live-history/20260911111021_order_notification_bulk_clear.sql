CREATE TABLE IF NOT EXISTS public.order_notification_feed_state (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    cleared_before TIMESTAMPTZ,
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
        n.is_read
        OR s.read_at IS NOT NULL
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

DROP POLICY IF EXISTS chat_notifications_recipient_delete ON public.chat_notifications;
CREATE POLICY chat_notifications_recipient_delete
    ON public.chat_notifications FOR DELETE
    USING (recipient_id = auth.uid());;
