-- Revoke default PUBLIC/anon EXECUTE on all chat functions; keep only authenticated.
-- (CREATE FUNCTION grants EXECUTE to PUBLIC by default; Supabase also grants anon.)
REVOKE EXECUTE ON FUNCTION public.chat_is_member(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.chat_topic_conversation(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.chat_topic_user(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.chat_broadcast_message() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.chat_send_message(uuid, text, text, uuid, jsonb, uuid[], jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.chat_find_or_create_dm(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.chat_find_or_create_order_conversation(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.chat_mark_read(uuid) FROM PUBLIC, anon;

-- Re-grant only to authenticated (RLS policies invoke chat_is_member as the querying role).
GRANT EXECUTE ON FUNCTION public.chat_is_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.chat_send_message(uuid, text, text, uuid, jsonb, uuid[], jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.chat_find_or_create_dm(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.chat_find_or_create_order_conversation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.chat_mark_read(uuid) TO authenticated;

-- Topic builders are only used inside other functions/RLS; pin search_path (pure string concat, safe).
ALTER FUNCTION public.chat_topic_conversation(uuid) SET search_path = '';
ALTER FUNCTION public.chat_topic_user(uuid) SET search_path = '';
