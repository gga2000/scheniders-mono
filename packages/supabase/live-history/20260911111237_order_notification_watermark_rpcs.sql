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
GRANT EXECUTE ON FUNCTION public.mark_order_notifications_read() TO authenticated;;
