-- Harden chat_members_self_insert: a user may only add THEMSELVES, and only to a
-- public channel in their tenant OR a conversation they created. Private DMs/channels
-- created by others can no longer be self-joined. DMs / order threads / #general are
-- created via SECURITY DEFINER RPCs that bypass RLS, so they are unaffected.
DROP POLICY IF EXISTS chat_members_self_insert ON public.chat_members;
CREATE POLICY chat_members_self_insert ON public.chat_members
    FOR INSERT WITH CHECK (
        user_id = auth.uid()
        AND conversation_id IN (
            SELECT id FROM public.chat_conversations
            WHERE tenant_id IN (SELECT get_user_tenant_ids())
              AND (
                    created_by = auth.uid()
                 OR (kind = 'channel' AND is_private = false)
              )
        )
    );;
