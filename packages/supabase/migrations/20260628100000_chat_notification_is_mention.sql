-- =============================================
-- CHAT: mark notifications as mention vs not, so the 'mentions'-level
-- notification preference can silence non-mention (DM) pushes.
-- =============================================
ALTER TABLE public.chat_notifications ADD COLUMN IF NOT EXISTS is_mention boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.chat_send_message(
    p_conversation_id uuid, p_body text, p_client_msg_id text DEFAULT NULL::text,
    p_reply_to_id uuid DEFAULT NULL::uuid, p_references jsonb DEFAULT '[]'::jsonb,
    p_mentions uuid[] DEFAULT '{}'::uuid[], p_attachments jsonb DEFAULT '[]'::jsonb)
RETURNS public.chat_messages
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
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
                    INSERT INTO public.chat_notifications (tenant_id, recipient_id, actor_id, actor_name, actor_avatar, conversation_id, message_id, preview, is_mention)
                    VALUES (v_tenant_id, v_mention, auth.uid(), COALESCE(v_sender_name,'Teammate'), v_sender_avatar, p_conversation_id, v_msg.id, left(COALESCE(p_body,''), 140), true);
                END IF;
            END IF;
        END LOOP;
    END IF;

    -- DM messages notify the peer (is_mention=false), unless already @mentioned above.
    IF (SELECT kind FROM public.chat_conversations WHERE id = p_conversation_id) = 'dm' THEN
        IF v_sender_name IS NULL THEN
            SELECT display_name, avatar_url INTO v_sender_name, v_sender_avatar FROM public.user_profiles WHERE id = auth.uid();
        END IF;
        INSERT INTO public.chat_notifications (tenant_id, recipient_id, actor_id, actor_name, actor_avatar, conversation_id, message_id, preview, is_mention)
        SELECT v_tenant_id, m.user_id, auth.uid(), COALESCE(v_sender_name,'Teammate'), v_sender_avatar, p_conversation_id, v_msg.id, left(COALESCE(p_body,''), 140), false
        FROM public.chat_members m
        WHERE m.conversation_id = p_conversation_id
          AND m.user_id <> auth.uid()
          AND NOT (m.user_id = ANY(p_mentions));
    END IF;

    UPDATE public.chat_conversations SET last_message_at = v_msg.created_at, updated_at = now()
    WHERE id = p_conversation_id;

    RETURN v_msg;
END;
$function$;
