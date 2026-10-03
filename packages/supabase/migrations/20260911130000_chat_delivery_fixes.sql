-- Chat delivery fixes
--
-- Four defects found auditing the team-chat feature:
--
--  1. Order threads reached nobody. chat_find_or_create_order_conversation added
--     ONLY the caller as a member, and chat_send_message wrote chat_notifications
--     rows only for kind='dm' and explicit @mentions. So commenting on an order
--     produced zero members besides the commenter, zero notifications and zero
--     unread for the rest of the team.
--
--  2. System order events (status change / assignment / delivery) never bumped
--     chat_conversations.last_message_at, because chat_post_order_event inserts
--     into chat_messages directly and only the RPC touched the column. Those
--     threads sorted to the bottom of the list with no recency at all.
--
--  3. Group and order conversations produced no notification rows at all — only
--     DMs and @mentions did.
--
--  4. chat_broadcast_message / chat_orders_event / chat_notify_push swallowed
--     every error with `EXCEPTION WHEN OTHERS THEN NULL`. A realtime or push
--     failure was completely invisible. The handlers must still not abort the
--     write they hang off, but they now RAISE WARNING so failures land in the
--     Postgres logs.

-- ---------------------------------------------------------------------------
-- 1. last_message_at is maintained by a trigger, for EVERY insert path
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.chat_touch_conversation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
    UPDATE public.chat_conversations
    SET last_message_at = GREATEST(COALESCE(last_message_at, NEW.created_at), NEW.created_at),
        updated_at      = now()
    WHERE id = NEW.conversation_id;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_chat_touch_conversation ON public.chat_messages;
CREATE TRIGGER trg_chat_touch_conversation
    AFTER INSERT ON public.chat_messages
    FOR EACH ROW EXECUTE FUNCTION public.chat_touch_conversation();

-- Backfill conversations whose last_message_at drifted behind their messages
-- (every order thread that only ever received system events).
UPDATE public.chat_conversations c
SET last_message_at = m.max_created
FROM (
    SELECT conversation_id, max(created_at) AS max_created
    FROM public.chat_messages
    GROUP BY conversation_id
) m
WHERE m.conversation_id = c.id
  AND (c.last_message_at IS NULL OR c.last_message_at < m.max_created);

-- ---------------------------------------------------------------------------
-- 2. Order threads include the assigned agent, not just whoever opened them
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.chat_find_or_create_order_conversation(p_order_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_tenant_id uuid;
    v_order_display text;
    v_assigned_to uuid;
    v_conv_id uuid;
BEGIN
    SELECT tenant_id, order_id, assigned_to
      INTO v_tenant_id, v_order_display, v_assigned_to
    FROM public.orders WHERE id = p_order_id;

    IF v_tenant_id IS NULL OR v_tenant_id NOT IN (SELECT get_user_tenant_ids()) THEN
        RAISE EXCEPTION 'order not in your tenant' USING ERRCODE = '42501';
    END IF;

    SELECT id INTO v_conv_id FROM public.chat_conversations WHERE kind = 'order' AND order_id = p_order_id;
    IF v_conv_id IS NULL THEN
        INSERT INTO public.chat_conversations (tenant_id, kind, name, order_id, is_private, created_by)
        VALUES (v_tenant_id, 'order', 'Order ' || COALESCE(v_order_display, ''), p_order_id, true, auth.uid())
        RETURNING id INTO v_conv_id;
    END IF;

    -- The caller always joins.
    INSERT INTO public.chat_members (conversation_id, user_id, role)
    VALUES (v_conv_id, auth.uid(), 'member')
    ON CONFLICT (conversation_id, user_id) DO NOTHING;

    -- So does the agent the order is assigned to — otherwise a comment aimed at
    -- them lands in a thread they are not a member of and never see.
    IF v_assigned_to IS NOT NULL AND v_assigned_to <> auth.uid()
       AND EXISTS (SELECT 1 FROM public.tenant_members
                   WHERE tenant_id = v_tenant_id AND user_id = v_assigned_to AND status = 'active') THEN
        INSERT INTO public.chat_members (conversation_id, user_id, role)
        VALUES (v_conv_id, v_assigned_to, 'member')
        ON CONFLICT (conversation_id, user_id) DO NOTHING;
    END IF;

    RETURN v_conv_id;
END;
$$;

-- Backfill: add the assigned agent to order threads that already exist.
INSERT INTO public.chat_members (conversation_id, user_id, role)
SELECT c.id, o.assigned_to, 'member'
FROM public.chat_conversations c
JOIN public.orders o ON o.id = c.order_id
JOIN public.tenant_members tm
  ON tm.tenant_id = c.tenant_id AND tm.user_id = o.assigned_to AND tm.status = 'active'
WHERE c.kind = 'order' AND o.assigned_to IS NOT NULL
ON CONFLICT (conversation_id, user_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. Notifications for every directed conversation, not just DMs
-- ---------------------------------------------------------------------------
--
-- Slack's rule, which is the one users expect: a DM, a group or an order thread
-- notifies its members; a broadcast channel notifies only on @mention. Muted
-- members are skipped in all cases.

CREATE OR REPLACE FUNCTION public.chat_send_message(
    p_conversation_id uuid,
    p_body text,
    p_client_msg_id text DEFAULT NULL::text,
    p_reply_to_id uuid DEFAULT NULL::uuid,
    p_references jsonb DEFAULT '[]'::jsonb,
    p_mentions uuid[] DEFAULT '{}'::uuid[],
    p_attachments jsonb DEFAULT '[]'::jsonb)
RETURNS chat_messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
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

    -- Idempotent retry: the row already exists, hand back the original.
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

    -- @mentions: join the mentioned teammate to the conversation and always
    -- notify them, even in a broadcast channel and even if they muted it.
    IF array_length(p_mentions, 1) IS NOT NULL THEN
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

    -- Directed conversations (dm / group / order) notify every other member who
    -- has not muted them and was not already notified as a mention.
    IF v_kind IN ('dm', 'group', 'order') THEN
        INSERT INTO public.chat_notifications (tenant_id, recipient_id, actor_id, actor_name, actor_avatar, conversation_id, message_id, preview, is_mention)
        SELECT v_tenant_id, m.user_id, auth.uid(), COALESCE(v_sender_name,'Teammate'), v_sender_avatar,
               p_conversation_id, v_msg.id, left(COALESCE(p_body,''), 140), false
        FROM public.chat_members m
        WHERE m.conversation_id = p_conversation_id
          AND m.user_id <> auth.uid()
          AND m.muted = false
          AND NOT (m.user_id = ANY(p_mentions));
    END IF;

    -- last_message_at is maintained by trg_chat_touch_conversation.
    RETURN v_msg;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Side-effect handlers log their failures instead of swallowing them
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.chat_broadcast_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_event text; v_payload jsonb; v_member record;
BEGIN
    IF (TG_OP = 'INSERT') THEN v_event := 'message:new'; ELSE v_event := 'message:update'; END IF;
    v_payload := jsonb_build_object(
        'id', NEW.id, 'conversation_id', NEW.conversation_id, 'sender_id', NEW.sender_id,
        'body', NEW.body, 'reply_to_id', NEW.reply_to_id, 'client_msg_id', NEW.client_msg_id,
        'edited_at', NEW.edited_at, 'deleted_at', NEW.deleted_at, 'created_at', NEW.created_at,
        'is_system', NEW.is_system, 'system_event', NEW.system_event
    );
    BEGIN
        PERFORM realtime.send(v_payload, v_event, public.chat_topic_conversation(NEW.conversation_id), true);
        IF (TG_OP = 'INSERT') THEN
            FOR v_member IN SELECT user_id FROM public.chat_members WHERE conversation_id = NEW.conversation_id LOOP
                PERFORM realtime.send(
                    jsonb_build_object('conversation_id', NEW.conversation_id, 'message_id', NEW.id, 'sender_id', NEW.sender_id),
                    'inbox:new', public.chat_topic_user(v_member.user_id), true);
            END LOOP;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        -- Realtime delivery must never abort the write, but a silent failure
        -- means messages stop appearing live with no trace anywhere.
        RAISE WARNING 'chat_broadcast_message failed for message % (conversation %): % (%)',
            NEW.id, NEW.conversation_id, SQLERRM, SQLSTATE;
    END;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.chat_orders_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
    IF NEW.tenant_id IS NULL THEN RETURN NEW; END IF;
    BEGIN
        IF OLD.status IS DISTINCT FROM NEW.status THEN
            PERFORM public.chat_post_order_event(NEW.id, jsonb_build_object(
                'type', 'status_changed', 'from', OLD.status, 'to', NEW.status,
                'actor_name', NEW.last_status_changed_by_name));
        END IF;
        IF OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN
            PERFORM public.chat_post_order_event(NEW.id, jsonb_build_object(
                'type', 'assigned', 'to', NEW.assigned_to, 'actor_name', NEW.last_status_changed_by_name));
        END IF;
        IF OLD.delivered_at IS NULL AND NEW.delivered_at IS NOT NULL THEN
            PERFORM public.chat_post_order_event(NEW.id, jsonb_build_object('type', 'delivered'));
        END IF;
    EXCEPTION WHEN OTHERS THEN
        -- Posting the activity note must never block the order update itself.
        RAISE WARNING 'chat_orders_event failed for order %: % (%)', NEW.id, SQLERRM, SQLSTATE;
    END;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.chat_notify_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_url text; v_secret text;
BEGIN
    SELECT function_url, edge_secret INTO v_url, v_secret FROM public.chat_push_config WHERE id = 1;
    IF v_url IS NULL OR v_secret IS NULL THEN
        -- Unconfigured is a deployment state, not an error: warn once per insert
        -- so an empty chat_push_config is visible in the logs rather than looking
        -- like push "just not working".
        RAISE WARNING 'chat_notify_push skipped: chat_push_config row id=1 is missing or incomplete';
        RETURN NEW;
    END IF;
    BEGIN
        PERFORM net.http_post(
            url     := v_url,
            headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_secret),
            body    := to_jsonb(NEW)
        );
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'chat_notify_push http_post failed for notification %: % (%)', NEW.id, SQLERRM, SQLSTATE;
    END;
    RETURN NEW;
END;
$$;
