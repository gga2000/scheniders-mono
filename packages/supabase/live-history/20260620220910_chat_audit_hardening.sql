-- =============================================
-- CHAT AUDIT HARDENING (forward migration over 20260620*)
-- Fixes found in the post-build security/correctness audit.
-- =============================================

-- P0: attachment storage scoped to CONVERSATION MEMBERSHIP, not just tenant.
DROP POLICY IF EXISTS chat_attachments_read   ON storage.objects;
DROP POLICY IF EXISTS chat_attachments_insert ON storage.objects;
DROP POLICY IF EXISTS chat_attachments_delete ON storage.objects;

CREATE POLICY chat_attachments_read ON storage.objects
    FOR SELECT TO authenticated
    USING (
        bucket_id = 'chat-attachments'
        AND (storage.foldername(name))[1]::uuid IN (SELECT get_user_tenant_ids())
        AND public.chat_is_member(((storage.foldername(name))[2])::uuid)
    );
CREATE POLICY chat_attachments_insert ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'chat-attachments'
        AND (storage.foldername(name))[1]::uuid IN (SELECT get_user_tenant_ids())
        AND public.chat_is_member(((storage.foldername(name))[2])::uuid)
    );
CREATE POLICY chat_attachments_delete ON storage.objects
    FOR DELETE TO authenticated
    USING (
        bucket_id = 'chat-attachments'
        AND (storage.foldername(name))[1]::uuid IN (SELECT get_user_tenant_ids())
        AND public.chat_is_member(((storage.foldername(name))[2])::uuid)
    );

-- P0: chat_messages immutability.
CREATE OR REPLACE FUNCTION public.chat_messages_guard_update()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
    IF NEW.conversation_id <> OLD.conversation_id
       OR NEW.tenant_id     <> OLD.tenant_id
       OR NEW.sender_id     <> OLD.sender_id
       OR NEW.created_at     <> OLD.created_at
       OR NEW.client_msg_id IS DISTINCT FROM OLD.client_msg_id THEN
        RAISE EXCEPTION 'chat_messages: immutable column changed' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_chat_messages_guard ON public.chat_messages;
CREATE TRIGGER trg_chat_messages_guard
    BEFORE UPDATE ON public.chat_messages
    FOR EACH ROW EXECUTE FUNCTION public.chat_messages_guard_update();

-- P1: chat_members immutable identity/role via client.
CREATE OR REPLACE FUNCTION public.chat_members_guard_update()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
    IF NEW.role <> OLD.role
       OR NEW.user_id <> OLD.user_id
       OR NEW.conversation_id <> OLD.conversation_id THEN
        RAISE EXCEPTION 'chat_members: immutable column changed' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_chat_members_guard ON public.chat_members;
CREATE TRIGGER trg_chat_members_guard
    BEFORE UPDATE ON public.chat_members
    FOR EACH ROW EXECUTE FUNCTION public.chat_members_guard_update();

-- P1: chat_conversations pin identity + privacy-flip gated to owner/admin.
CREATE OR REPLACE FUNCTION public.chat_conversations_guard_update()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
    IF NEW.tenant_id  <> OLD.tenant_id
       OR NEW.kind     <> OLD.kind
       OR NEW.order_id IS DISTINCT FROM OLD.order_id
       OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
        RAISE EXCEPTION 'chat_conversations: immutable column changed' USING ERRCODE = '42501';
    END IF;
    IF NEW.is_private <> OLD.is_private
       AND NOT public.is_tenant_admin(OLD.tenant_id)
       AND NOT EXISTS (
            SELECT 1 FROM public.chat_members
            WHERE conversation_id = OLD.id AND user_id = auth.uid() AND role = 'owner'
       ) THEN
        RAISE EXCEPTION 'chat_conversations: only owner/admin can change privacy' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_chat_conversations_guard ON public.chat_conversations;
CREATE TRIGGER trg_chat_conversations_guard
    BEFORE UPDATE ON public.chat_conversations
    FOR EACH ROW EXECUTE FUNCTION public.chat_conversations_guard_update();

-- P1: child-table INSERT policies require conversation membership.
DROP POLICY IF EXISTS chat_refs_member_insert ON public.chat_message_references;
CREATE POLICY chat_refs_member_insert ON public.chat_message_references
    FOR INSERT WITH CHECK (EXISTS (
        SELECT 1 FROM public.chat_messages m
        WHERE m.id = message_id AND m.sender_id = auth.uid() AND public.chat_is_member(m.conversation_id)
    ));

DROP POLICY IF EXISTS chat_attachments_member_insert ON public.chat_message_attachments;
CREATE POLICY chat_attachments_member_insert ON public.chat_message_attachments
    FOR INSERT WITH CHECK (EXISTS (
        SELECT 1 FROM public.chat_messages m
        WHERE m.id = message_id AND m.sender_id = auth.uid() AND public.chat_is_member(m.conversation_id)
    ));

DROP POLICY IF EXISTS chat_mentions_member_insert ON public.chat_message_mentions;
CREATE POLICY chat_mentions_member_insert ON public.chat_message_mentions
    FOR INSERT WITH CHECK (EXISTS (
        SELECT 1 FROM public.chat_messages m
        WHERE m.id = message_id AND m.sender_id = auth.uid() AND public.chat_is_member(m.conversation_id)
    ));

-- P2: chat_user_status tenant claim must be a tenant the user belongs to.
DROP POLICY IF EXISTS chat_user_status_self_write ON public.chat_user_status;
CREATE POLICY chat_user_status_self_write ON public.chat_user_status
    FOR ALL USING (user_id = auth.uid())
    WITH CHECK (
        user_id = auth.uid()
        AND (tenant_id IS NULL OR tenant_id IN (SELECT get_user_tenant_ids()))
    );

-- P1: realtime/broadcast failure must not roll back committed message/reaction.
CREATE OR REPLACE FUNCTION public.chat_broadcast_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_event text;
    v_payload jsonb;
    v_member record;
BEGIN
    IF (TG_OP = 'INSERT') THEN v_event := 'message:new';
    ELSE v_event := 'message:update';
    END IF;

    v_payload := jsonb_build_object(
        'id', NEW.id, 'conversation_id', NEW.conversation_id, 'sender_id', NEW.sender_id,
        'body', NEW.body, 'reply_to_id', NEW.reply_to_id, 'client_msg_id', NEW.client_msg_id,
        'edited_at', NEW.edited_at, 'deleted_at', NEW.deleted_at, 'created_at', NEW.created_at
    );

    BEGIN
        PERFORM realtime.send(v_payload, v_event, public.chat_topic_conversation(NEW.conversation_id), true);
        IF (TG_OP = 'INSERT') THEN
            FOR v_member IN SELECT user_id FROM public.chat_members WHERE conversation_id = NEW.conversation_id LOOP
                PERFORM realtime.send(
                    jsonb_build_object('conversation_id', NEW.conversation_id, 'message_id', NEW.id, 'sender_id', NEW.sender_id),
                    'inbox:new', public.chat_topic_user(v_member.user_id), true
                );
            END LOOP;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.chat_broadcast_reaction()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_conv uuid; v_msg uuid;
BEGIN
    v_msg := COALESCE(NEW.message_id, OLD.message_id);
    SELECT conversation_id INTO v_conv FROM public.chat_messages WHERE id = v_msg;
    IF v_conv IS NOT NULL THEN
        BEGIN
            PERFORM realtime.send(jsonb_build_object('message_id', v_msg), 'reaction:update', public.chat_topic_conversation(v_conv), true);
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$;

-- P1: idempotency key must include sender_id.
DROP INDEX IF EXISTS public.chat_messages_conv_client_uidx;
CREATE UNIQUE INDEX IF NOT EXISTS chat_messages_conv_sender_client_uidx
    ON public.chat_messages (conversation_id, sender_id, client_msg_id) WHERE client_msg_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.chat_send_message(
    p_conversation_id uuid,
    p_body            text,
    p_client_msg_id   text DEFAULT NULL,
    p_reply_to_id     uuid DEFAULT NULL,
    p_references      jsonb DEFAULT '[]'::jsonb,
    p_mentions        uuid[] DEFAULT '{}',
    p_attachments     jsonb DEFAULT '[]'::jsonb
)
RETURNS public.chat_messages
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_tenant_id uuid;
    v_msg public.chat_messages;
    v_ref jsonb;
    v_att jsonb;
    v_mention uuid;
    v_sender_name text;
    v_sender_avatar text;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.chat_members WHERE conversation_id = p_conversation_id AND user_id = auth.uid()) THEN
        RAISE EXCEPTION 'not a member of this conversation' USING ERRCODE = '42501';
    END IF;

    SELECT tenant_id INTO v_tenant_id FROM public.chat_conversations WHERE id = p_conversation_id;

    IF v_tenant_id IS NULL OR v_tenant_id NOT IN (SELECT get_user_tenant_ids()) THEN
        RAISE EXCEPTION 'conversation tenant not accessible' USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.chat_messages (conversation_id, tenant_id, sender_id, body, reply_to_id, client_msg_id)
    VALUES (p_conversation_id, v_tenant_id, auth.uid(), COALESCE(p_body, ''), p_reply_to_id, p_client_msg_id)
    ON CONFLICT (conversation_id, sender_id, client_msg_id) WHERE client_msg_id IS NOT NULL DO NOTHING
    RETURNING * INTO v_msg;

    IF v_msg.id IS NULL THEN
        SELECT * INTO v_msg FROM public.chat_messages
        WHERE conversation_id = p_conversation_id AND sender_id = auth.uid() AND client_msg_id = p_client_msg_id
        LIMIT 1;
        RETURN v_msg;
    END IF;

    FOR v_ref IN SELECT * FROM jsonb_array_elements(p_references) LOOP
        INSERT INTO public.chat_message_references (message_id, ref_type, ref_id, snapshot)
        VALUES (v_msg.id, v_ref->>'ref_type', v_ref->>'ref_id', COALESCE(v_ref->'snapshot', '{}'::jsonb));
    END LOOP;

    FOR v_att IN SELECT * FROM jsonb_array_elements(p_attachments) LOOP
        INSERT INTO public.chat_message_attachments (message_id, storage_path, file_name, mime, size_bytes, width, height)
        VALUES (v_msg.id, v_att->>'storage_path', v_att->>'file_name', v_att->>'mime',
                (v_att->>'size_bytes')::int, (v_att->>'width')::int, (v_att->>'height')::int);
    END LOOP;

    IF array_length(p_mentions, 1) IS NOT NULL THEN
        SELECT display_name, avatar_url INTO v_sender_name, v_sender_avatar
        FROM public.user_profiles WHERE id = auth.uid();

        FOREACH v_mention IN ARRAY p_mentions LOOP
            IF EXISTS (SELECT 1 FROM public.tenant_members WHERE tenant_id = v_tenant_id AND user_id = v_mention AND status = 'active') THEN
                INSERT INTO public.chat_members (conversation_id, user_id, role)
                VALUES (p_conversation_id, v_mention, 'member')
                ON CONFLICT (conversation_id, user_id) DO NOTHING;

                INSERT INTO public.chat_message_mentions (message_id, mentioned_user_id) VALUES (v_msg.id, v_mention);

                IF v_mention <> auth.uid() THEN
                    INSERT INTO public.chat_notifications (tenant_id, recipient_id, actor_id, actor_name, actor_avatar, conversation_id, message_id, preview)
                    VALUES (v_tenant_id, v_mention, auth.uid(), COALESCE(v_sender_name,'Teammate'), v_sender_avatar, p_conversation_id, v_msg.id, left(COALESCE(p_body,''), 140));
                END IF;
            END IF;
        END LOOP;
    END IF;

    UPDATE public.chat_conversations SET last_message_at = v_msg.created_at, updated_at = now()
    WHERE id = p_conversation_id;

    RETURN v_msg;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.chat_send_message(uuid, text, text, uuid, jsonb, uuid[], jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.chat_send_message(uuid, text, text, uuid, jsonb, uuid[], jsonb) TO authenticated;

-- Typing topic id extractor (optional suffix tolerated).
CREATE OR REPLACE FUNCTION public.chat_topic_conv_id(p_topic text)
RETURNS uuid LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
    SELECT CASE WHEN p_topic LIKE 'chat:conv:%'
                THEN substring(p_topic from 'chat:conv:([0-9a-fA-F-]{36})')::uuid END;
$$;
GRANT EXECUTE ON FUNCTION public.chat_topic_conv_id(text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.chat_topic_conv_id(text) FROM PUBLIC, anon;

-- Harden presence authz extraction (anchored regex).
DROP POLICY IF EXISTS chat_realtime_presence_read  ON realtime.messages;
DROP POLICY IF EXISTS chat_realtime_presence_write ON realtime.messages;
CREATE POLICY chat_realtime_presence_read ON realtime.messages
    FOR SELECT TO authenticated
    USING (
        realtime.topic() LIKE 'chat:tenant:%:presence'
        AND substring(realtime.topic() from '^chat:tenant:([0-9a-fA-F-]{36}):presence$')::uuid IN (SELECT get_user_tenant_ids())
    );
CREATE POLICY chat_realtime_presence_write ON realtime.messages
    FOR INSERT TO authenticated
    WITH CHECK (
        realtime.topic() LIKE 'chat:tenant:%:presence'
        AND substring(realtime.topic() from '^chat:tenant:([0-9a-fA-F-]{36}):presence$')::uuid IN (SELECT get_user_tenant_ids())
    );;
