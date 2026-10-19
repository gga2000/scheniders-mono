ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.order_notifications;
ALTER TABLE public.order_notifications REPLICA IDENTITY FULL;;
