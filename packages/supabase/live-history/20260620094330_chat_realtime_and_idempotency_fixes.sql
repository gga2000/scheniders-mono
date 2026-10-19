-- =============================================
-- Chat fixes: idempotency, mention=join (tenant-guarded), reaction broadcast, unread RPC
-- =============================================

-- C2: client_msg_id idempotency (prevents duplicate physical rows on retry)
CREATE UNIQUE INDEX IF NOT EXISTS chat_messages_conv_client_uidx
    ON public.chat_messages (conversation_id, client_msg_id) WHERE client_msg_id IS NOT NULL;

-- C2 + I6: rewrite chat_send_message — idempotent insert; mentioning a SAME-TENANT user
-- adds them as a conversation member (so they can see/receive the thread). Cross-tenant
-- mentions are ignored (no membership, no notification) to prevent leaks.
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

    -- Idempotent insert on (conversation_id, client_msg_id)
    INSERT INTO public.chat_messages (conversation_id, tenant_id, sender_id, body, reply_to_id, client_msg_id)
    VALUES (p_conversation_id, v_tenant_id, auth.uid(), COALESCE(p_body, ''), p_reply_to_id, p_client_msg_id)
    ON CONFLICT (conversation_id, client_msg_id) DO NOTHING
    RETURNING * INTO v_msg;

    -- Duplicate retry: return the existing row, skip all side effects
    IF v_msg.id IS NULL THEN
        SELECT * INTO v_msg FROM public.chat_messages
        WHERE conversation_id = p_conversation_id AND client_msg_id = p_client_msg_id
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
            -- Only act on mentions of ACTIVE members of THIS conversation's tenant (no cross-tenant leak)
            IF EXISTS (SELECT 1 FROM public.tenant_members WHERE tenant_id = v_tenant_id AND user_id = v_mention AND status = 'active') THEN
                -- mention = join: add the mentioned teammate to the conversation
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

-- I2: broadcast reaction changes to the conversation topic so all viewers update live
CREATE OR REPLACE FUNCTION public.chat_broadcast_reaction()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_conv uuid; v_msg uuid;
BEGIN
    v_msg := COALESCE(NEW.message_id, OLD.message_id);
    SELECT conversation_id INTO v_conv FROM public.chat_messages WHERE id = v_msg;
    IF v_conv IS NOT NULL THEN
        PERFORM realtime.send(jsonb_build_object('message_id', v_msg), 'reaction:update', public.chat_topic_conversation(v_conv), true);
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$;
DROP TRIGGER IF EXISTS trg_chat_broadcast_reaction ON public.chat_message_reactions;
CREATE TRIGGER trg_chat_broadcast_reaction
    AFTER INSERT OR DELETE ON public.chat_message_reactions
    FOR EACH ROW EXECUTE FUNCTION public.chat_broadcast_reaction();
REVOKE EXECUTE ON FUNCTION public.chat_broadcast_reaction() FROM PUBLIC, anon;

-- I4: accurate per-conversation unread counts (no 500-row cap, excludes own messages)
CREATE OR REPLACE FUNCTION public.chat_unread_counts()
RETURNS TABLE(conversation_id uuid, unread integer)
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, pg_temp AS $$
    SELECT m.conversation_id, COUNT(msg.id)::int AS unread
    FROM public.chat_members m
    LEFT JOIN public.chat_messages msg
        ON msg.conversation_id = m.conversation_id
       AND msg.deleted_at IS NULL
       AND msg.sender_id <> m.user_id
       AND msg.created_at > m.last_read_at
    WHERE m.user_id = auth.uid()
    GROUP BY m.conversation_id;
$$;
REVOKE EXECUTE ON FUNCTION public.chat_unread_counts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.chat_unread_counts() TO authenticated;;
