-- =============================================
-- CHAT RPCs + BROADCAST TRIGGER
-- =============================================

-- Topic builders (kept in SQL so trigger + RLS agree with the TS lib)
CREATE OR REPLACE FUNCTION public.chat_topic_conversation(p_conversation_id uuid)
RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT 'chat:conv:' || p_conversation_id::text $$;

CREATE OR REPLACE FUNCTION public.chat_topic_user(p_user_id uuid)
RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT 'chat:user:' || p_user_id::text $$;

-- Broadcast a new/changed message to its conversation topic + each member inbox.
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
        'id', NEW.id,
        'conversation_id', NEW.conversation_id,
        'sender_id', NEW.sender_id,
        'body', NEW.body,
        'reply_to_id', NEW.reply_to_id,
        'client_msg_id', NEW.client_msg_id,
        'edited_at', NEW.edited_at,
        'deleted_at', NEW.deleted_at,
        'created_at', NEW.created_at
    );

    -- to the conversation channel (open viewers)
    PERFORM realtime.send(v_payload, v_event, public.chat_topic_conversation(NEW.conversation_id), true);

    -- to each member's inbox (badges/toasts) on new messages only
    IF (TG_OP = 'INSERT') THEN
        FOR v_member IN
            SELECT user_id FROM public.chat_members WHERE conversation_id = NEW.conversation_id
        LOOP
            PERFORM realtime.send(
                jsonb_build_object('conversation_id', NEW.conversation_id, 'message_id', NEW.id, 'sender_id', NEW.sender_id),
                'inbox:new',
                public.chat_topic_user(v_member.user_id),
                true
            );
        END LOOP;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_chat_broadcast_message ON public.chat_messages;
CREATE TRIGGER trg_chat_broadcast_message
    AFTER INSERT OR UPDATE ON public.chat_messages
    FOR EACH ROW EXECUTE FUNCTION public.chat_broadcast_message();

-- =============================================
-- send_message RPC: atomic insert of message + refs + mentions + attachments,
-- bumps conversation.last_message_at, writes mention notifications.
-- SECURITY DEFINER => MUST assert membership itself (does not inherit RLS).
-- =============================================
CREATE OR REPLACE FUNCTION public.chat_send_message(
    p_conversation_id uuid,
    p_body            text,
    p_client_msg_id   text DEFAULT NULL,
    p_reply_to_id     uuid DEFAULT NULL,
    p_references      jsonb DEFAULT '[]'::jsonb,   -- [{ref_type, ref_id, snapshot}]
    p_mentions        uuid[] DEFAULT '{}',         -- mentioned user ids
    p_attachments     jsonb DEFAULT '[]'::jsonb    -- [{storage_path,file_name,mime,size_bytes,width,height}]
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
    -- membership assertion (SECURITY DEFINER bypasses RLS)
    IF NOT EXISTS (SELECT 1 FROM public.chat_members WHERE conversation_id = p_conversation_id AND user_id = auth.uid()) THEN
        RAISE EXCEPTION 'not a member of this conversation' USING ERRCODE = '42501';
    END IF;

    SELECT tenant_id INTO v_tenant_id FROM public.chat_conversations WHERE id = p_conversation_id;

    INSERT INTO public.chat_messages (conversation_id, tenant_id, sender_id, body, reply_to_id, client_msg_id)
    VALUES (p_conversation_id, v_tenant_id, auth.uid(), COALESCE(p_body, ''), p_reply_to_id, p_client_msg_id)
    RETURNING * INTO v_msg;

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
            INSERT INTO public.chat_message_mentions (message_id, mentioned_user_id) VALUES (v_msg.id, v_mention);
            -- notification row (consumed by notifications dropdown). Skip self-mention.
            IF v_mention <> auth.uid() THEN
                INSERT INTO public.chat_notifications (tenant_id, recipient_id, actor_id, actor_name, actor_avatar, conversation_id, message_id, preview)
                VALUES (v_tenant_id, v_mention, auth.uid(), COALESCE(v_sender_name,'Teammate'), v_sender_avatar, p_conversation_id, v_msg.id, left(COALESCE(p_body,''), 140));
            END IF;
        END LOOP;
    END IF;

    UPDATE public.chat_conversations SET last_message_at = v_msg.created_at, updated_at = now()
    WHERE id = p_conversation_id;

    RETURN v_msg;
END;
$$;
GRANT EXECUTE ON FUNCTION public.chat_send_message(uuid, text, text, uuid, jsonb, uuid[], jsonb) TO authenticated;

-- =============================================
-- find_or_create_dm: dedupe a DM on the exact pair {auth.uid(), p_other}
-- =============================================
CREATE OR REPLACE FUNCTION public.chat_find_or_create_dm(p_other_user_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_tenant_id uuid;
    v_conv_id uuid;
BEGIN
    v_tenant_id := get_current_tenant_id();
    IF NOT EXISTS (SELECT 1 FROM public.tenant_members WHERE tenant_id = v_tenant_id AND user_id = p_other_user_id AND status = 'active') THEN
        RAISE EXCEPTION 'other user not in tenant' USING ERRCODE = '42501';
    END IF;

    SELECT c.id INTO v_conv_id
    FROM public.chat_conversations c
    WHERE c.kind = 'dm' AND c.tenant_id = v_tenant_id
      AND (SELECT count(*) FROM public.chat_members m WHERE m.conversation_id = c.id) = 2
      AND EXISTS (SELECT 1 FROM public.chat_members m WHERE m.conversation_id = c.id AND m.user_id = auth.uid())
      AND EXISTS (SELECT 1 FROM public.chat_members m WHERE m.conversation_id = c.id AND m.user_id = p_other_user_id)
    LIMIT 1;

    IF v_conv_id IS NOT NULL THEN RETURN v_conv_id; END IF;

    INSERT INTO public.chat_conversations (tenant_id, kind, is_private, created_by)
    VALUES (v_tenant_id, 'dm', true, auth.uid()) RETURNING id INTO v_conv_id;
    INSERT INTO public.chat_members (conversation_id, user_id, role) VALUES (v_conv_id, auth.uid(), 'owner');
    INSERT INTO public.chat_members (conversation_id, user_id, role) VALUES (v_conv_id, p_other_user_id, 'member');
    RETURN v_conv_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.chat_find_or_create_dm(uuid) TO authenticated;

-- =============================================
-- find_or_create_order_conversation: kind='order' anchored on an order
-- =============================================
CREATE OR REPLACE FUNCTION public.chat_find_or_create_order_conversation(p_order_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_tenant_id uuid;
    v_order_display text;
    v_conv_id uuid;
BEGIN
    SELECT tenant_id, order_id INTO v_tenant_id, v_order_display FROM public.orders WHERE id = p_order_id;
    IF v_tenant_id IS NULL OR v_tenant_id NOT IN (SELECT get_user_tenant_ids()) THEN
        RAISE EXCEPTION 'order not in your tenant' USING ERRCODE = '42501';
    END IF;

    SELECT id INTO v_conv_id FROM public.chat_conversations WHERE kind = 'order' AND order_id = p_order_id;
    IF v_conv_id IS NULL THEN
        INSERT INTO public.chat_conversations (tenant_id, kind, name, order_id, is_private, created_by)
        VALUES (v_tenant_id, 'order', 'Order ' || COALESCE(v_order_display, ''), p_order_id, true, auth.uid())
        RETURNING id INTO v_conv_id;
    END IF;

    -- ensure caller is a member
    INSERT INTO public.chat_members (conversation_id, user_id, role)
    VALUES (v_conv_id, auth.uid(), 'member')
    ON CONFLICT (conversation_id, user_id) DO NOTHING;
    RETURN v_conv_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.chat_find_or_create_order_conversation(uuid) TO authenticated;

-- =============================================
-- mark_read: advance the caller's last_read_at for a conversation
-- =============================================
CREATE OR REPLACE FUNCTION public.chat_mark_read(p_conversation_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
    UPDATE public.chat_members SET last_read_at = now()
    WHERE conversation_id = p_conversation_id AND user_id = auth.uid();
$$;
GRANT EXECUTE ON FUNCTION public.chat_mark_read(uuid) TO authenticated;;
