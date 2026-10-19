-- Defence in depth on the chat/push tables, matching what the notification
-- tables already have.
--
-- All four carry Supabase's default full-DML grant to `anon`. RLS is what
-- actually stops an anonymous caller today — every policy is self-scoped on
-- auth.uid(), which is NULL for anon — so nothing changes functionally. But the
-- grant is surface nobody needs: chat is authenticated-only, and the push
-- subscribe/unsubscribe routes act either as the signed-in user or as the
-- service role, both of which keep their access below.
--
-- Same cleanup as 20260913100000 did for the SECURITY DEFINER functions: state
-- the access rather than leave it inherited, so a future policy mistake is not
-- also an anonymous data path.

REVOKE ALL ON public.chat_push_subscriptions FROM anon;
REVOKE ALL ON public.chat_notification_prefs FROM anon;
REVOKE ALL ON public.chat_user_status FROM anon;
REVOKE ALL ON public.chat_notifications FROM anon;

-- Narrow `authenticated` to real DML too — TRUNCATE/REFERENCES/TRIGGER are not
-- something a client role should hold.
REVOKE ALL ON public.chat_push_subscriptions FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_push_subscriptions TO authenticated;

REVOKE ALL ON public.chat_notification_prefs FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_notification_prefs TO authenticated;

REVOKE ALL ON public.chat_user_status FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_user_status TO authenticated;

REVOKE ALL ON public.chat_notifications FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_notifications TO authenticated;;
