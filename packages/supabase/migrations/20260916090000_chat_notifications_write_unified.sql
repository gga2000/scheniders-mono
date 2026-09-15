-- Finish E1: chat writes `notifications` directly.
--
-- Order events moved onto the unified table already; chat kept writing
-- `chat_notifications` with mirror triggers copying rows across. That bridge was
-- always meant to be temporary — it doubles every write and leaves two tables
-- that can disagree about read state.
--
-- PUSH: chat push used to come from `trg_chat_notify_push` on
-- chat_notifications -> the send-chat-push function. Now that chat rows land in
-- `notifications`, `trg_dispatch_notification` covers them — and it applies the
-- per-category preferences, quiet hours, mutes and DND that the old path never
-- consulted. The old trigger is dropped in the same migration so a message
-- cannot push twice.
--
-- The client hook keeps its exact return shape, so nothing that renders mentions
-- had to change.

CREATE OR REPLACE FUNCTION public.chat_send_message(
    p_conversation_id uuid,
    p_body text,
    p_client_msg_id text DEFAULT NULL::text,
    p_reply_to_id uuid DEFAULT NULL::uuid,
    p_references jsonb DEFAULT '[]'::jsonb,
    p_mentions uuid[] DEFAULT '{}'::uuid[],
    p_attachments jsonb DEFAULT '[]'::jsonb
)
RETURNS chat_messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_tenant_id uuid;
    v_kind text;
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

    SELECT tenant_id, kind INTO v_tenant_id, v_kind
    FROM public.chat_conversations WHERE id = p_conversation_id;

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

    SELECT display_name, avatar_url INTO v_sender_name, v_sender_avatar
    FROM public.user_profiles WHERE id = auth.uid();

    IF array_length(p_mentions, 1) IS NOT NULL THEN
        FOREACH v_mention IN ARRAY p_mentions LOOP
            IF EXISTS (SELECT 1 FROM public.tenant_members WHERE tenant_id = v_tenant_id AND user_id = v_mention AND status = 'active') THEN
                INSERT INTO public.chat_members (conversation_id, user_id, role)
                VALUES (p_conversation_id, v_mention, 'member')
                ON CONFLICT (conversation_id, user_id) DO NOTHING;

                INSERT INTO public.chat_message_mentions (message_id, mentioned_user_id) VALUES (v_msg.id, v_mention);

                IF v_mention <> auth.uid() THEN
                    INSERT INTO public.notifications (
                        tenant_id, type, category, audience, recipient_id,
                        actor_name, actor_avatar, entity_type, entity_id, entity_label,
                        payload, priority, group_key
                    ) VALUES (
                        v_tenant_id, 'chat.mention', 'chat', 'user', v_mention,
                        COALESCE(v_sender_name, 'Teammate'), v_sender_avatar,
                        'conversation', p_conversation_id, NULL,
                        jsonb_strip_nulls(jsonb_build_object(
                            'preview', left(COALESCE(p_body, ''), 140),
                            'message_id', v_msg.id)),
                        -- Being named is louder than a message going past.
                        'high',
                        'conversation:' || p_conversation_id::text
                    );
                END IF;
            END IF;
        END LOOP;
    END IF;

    IF v_kind IN ('dm', 'group', 'order') THEN
        INSERT INTO public.notifications (
            tenant_id, type, category, audience, recipient_id,
            actor_name, actor_avatar, entity_type, entity_id, entity_label,
            payload, group_key
        )
        SELECT v_tenant_id, 'chat.message', 'chat', 'user', m.user_id,
               COALESCE(v_sender_name, 'Teammate'), v_sender_avatar,
               'conversation', p_conversation_id, NULL,
               jsonb_strip_nulls(jsonb_build_object(
                   'preview', left(COALESCE(p_body, ''), 140),
                   'message_id', v_msg.id)),
               'conversation:' || p_conversation_id::text
        FROM public.chat_members m
        WHERE m.conversation_id = p_conversation_id
          AND m.user_id <> auth.uid()
          AND m.muted = false
          AND NOT (m.user_id = ANY(p_mentions));
    END IF;

    RETURN v_msg;
END;
$function$;

-- Nothing writes chat_notifications now, so the mirrors have no source and the
-- old push trigger has nothing to fire on. Dropping them keeps a future writer
-- from silently resurrecting the double-write.
DROP TRIGGER IF EXISTS trg_mirror_chat_notification ON public.chat_notifications;
DROP TRIGGER IF EXISTS trg_mirror_chat_notification_read ON public.chat_notifications;
DROP TRIGGER IF EXISTS trg_mirror_chat_notification_delete ON public.chat_notifications;
DROP TRIGGER IF EXISTS trg_chat_notify_push ON public.chat_notifications;
