-- Security round 8 (R6-05): outbound HTTP from the database is server-only.
-- Every caller (dispatch_notification, send_notification_digests,
-- notify_order_push, chat_notify_push) is SECURITY DEFINER owned by postgres,
-- so client roles never need pg_net.
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA net FROM PUBLIC, anon, authenticated;
REVOKE USAGE ON SCHEMA net FROM PUBLIC, anon, authenticated;
