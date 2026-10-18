REVOKE ALL ON public.order_notification_user_state FROM anon;
REVOKE ALL ON public.order_notifications_feed FROM anon;

REVOKE ALL ON public.order_notification_user_state FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_notification_user_state TO authenticated;

REVOKE ALL ON public.order_notifications_feed FROM authenticated;
GRANT SELECT ON public.order_notifications_feed TO authenticated;;
