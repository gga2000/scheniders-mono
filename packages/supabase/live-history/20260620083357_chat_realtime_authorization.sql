-- Enable RLS-gated access to private Realtime topics for chat.
-- realtime.messages is the broadcast/presence authorization table.
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

-- helper to read the conversation id out of a 'chat:conv:<uuid>' topic
-- (pure substring/cast, no table access -> pin search_path for the advisor)
CREATE OR REPLACE FUNCTION public.chat_topic_conv_id(p_topic text)
RETURNS uuid LANGUAGE sql IMMUTABLE
SET search_path = '' AS $$
    SELECT CASE WHEN p_topic LIKE 'chat:conv:%'
                THEN substring(p_topic from 'chat:conv:(.*)')::uuid END;
$$;

-- SELECT = subscribe/receive; INSERT = broadcast/send
CREATE POLICY chat_realtime_conv_read ON realtime.messages
    FOR SELECT TO authenticated
    USING (
        realtime.topic() LIKE 'chat:conv:%'
        AND public.chat_is_member(public.chat_topic_conv_id(realtime.topic()))
    );
CREATE POLICY chat_realtime_conv_write ON realtime.messages
    FOR INSERT TO authenticated
    WITH CHECK (
        realtime.topic() LIKE 'chat:conv:%'
        AND public.chat_is_member(public.chat_topic_conv_id(realtime.topic()))
    );

-- per-user inbox: only the owner may read
CREATE POLICY chat_realtime_inbox_read ON realtime.messages
    FOR SELECT TO authenticated
    USING (realtime.topic() = 'chat:user:' || auth.uid()::text);

-- tenant presence: any active tenant member may read + track
CREATE POLICY chat_realtime_presence_read ON realtime.messages
    FOR SELECT TO authenticated
    USING (
        realtime.topic() LIKE 'chat:tenant:%:presence'
        AND substring(realtime.topic() from 'chat:tenant:(.*):presence')::uuid IN (SELECT get_user_tenant_ids())
    );
CREATE POLICY chat_realtime_presence_write ON realtime.messages
    FOR INSERT TO authenticated
    WITH CHECK (
        realtime.topic() LIKE 'chat:tenant:%:presence'
        AND substring(realtime.topic() from 'chat:tenant:(.*):presence')::uuid IN (SELECT get_user_tenant_ids())
    );

-- Lock function execute to authenticated only.
-- (CREATE FUNCTION grants EXECUTE to PUBLIC by default; Supabase also grants anon.)
GRANT EXECUTE ON FUNCTION public.chat_topic_conv_id(text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.chat_topic_conv_id(text) FROM PUBLIC, anon;;
