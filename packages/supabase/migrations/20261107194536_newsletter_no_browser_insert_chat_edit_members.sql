-- Newsletter signups go only through the storefront route (live-store check,
-- email validation). The browser could insert any store's list directly.
REVOKE INSERT ON public.newsletter_subscribers FROM anon, authenticated;
ALTER POLICY public_subscribe_with_tenant ON public.newsletter_subscribers WITH CHECK (false);

-- A chat author may edit their message only while still a member of that
-- store and conversation (a removed member could rewrite old messages).
ALTER POLICY chat_messages_author_update ON public.chat_messages
  USING (sender_id = auth.uid()
         AND tenant_id IN (SELECT public.get_user_tenant_ids())
         AND public.chat_is_member(conversation_id))
  WITH CHECK (sender_id = auth.uid()
              AND tenant_id IN (SELECT public.get_user_tenant_ids())
              AND public.chat_is_member(conversation_id));

-- System messages stay system messages.
CREATE OR REPLACE FUNCTION public.chat_messages_guard_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    IF NEW.conversation_id <> OLD.conversation_id
       OR NEW.tenant_id     <> OLD.tenant_id
       OR NEW.sender_id     IS DISTINCT FROM OLD.sender_id
       OR NEW.created_at    <> OLD.created_at
       OR NEW.client_msg_id IS DISTINCT FROM OLD.client_msg_id
       OR NEW.is_system     IS DISTINCT FROM OLD.is_system
       OR NEW.system_event  IS DISTINCT FROM OLD.system_event THEN
        RAISE EXCEPTION 'chat_messages: immutable column changed' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END; $function$;