-- =============================================
-- CHAT PHASE 5: order superpowers
-- system messages (auto-events) + resolve flag + orders→thread event engine
-- =============================================

-- ---- system-message support on chat_messages ----
ALTER TABLE public.chat_messages ALTER COLUMN sender_id DROP NOT NULL;
ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS is_system boolean NOT NULL DEFAULT false;
ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS system_event jsonb;

-- guard: make the immutability check null-safe (system rows have sender_id NULL)
CREATE OR REPLACE FUNCTION public.chat_messages_guard_update()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
    IF NEW.conversation_id <> OLD.conversation_id
       OR NEW.tenant_id     <> OLD.tenant_id
       OR NEW.sender_id     IS DISTINCT FROM OLD.sender_id
       OR NEW.created_at    <> OLD.created_at
       OR NEW.client_msg_id IS DISTINCT FROM OLD.client_msg_id THEN
        RAISE EXCEPTION 'chat_messages: immutable column changed' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END; $$;

-- broadcast: include is_system + system_event so clients render incoming events live
CREATE OR REPLACE FUNCTION public.chat_broadcast_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
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
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    RETURN NEW;
END; $$;

-- ---- resolve flag on conversations ----
ALTER TABLE public.chat_conversations ADD COLUMN IF NOT EXISTS resolved_at timestamptz;

-- conversation broadcast: also fire on resolved_at + include it in the payload
CREATE OR REPLACE FUNCTION public.chat_broadcast_conversation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_member record;
BEGIN
    BEGIN
        PERFORM realtime.send(
            jsonb_build_object('id', NEW.id, 'name', NEW.name, 'topic', NEW.topic,
                               'archived_at', NEW.archived_at, 'resolved_at', NEW.resolved_at),
            'conversation:update', public.chat_topic_conversation(NEW.id), true);
        FOR v_member IN SELECT user_id FROM public.chat_members WHERE conversation_id = NEW.id LOOP
            PERFORM realtime.send(jsonb_build_object('conversation_id', NEW.id),
                'inbox:refresh', public.chat_topic_user(v_member.user_id), true);
        END LOOP;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_chat_broadcast_conversation ON public.chat_conversations;
CREATE TRIGGER trg_chat_broadcast_conversation
    AFTER UPDATE OF name, topic, archived_at, resolved_at ON public.chat_conversations
    FOR EACH ROW EXECUTE FUNCTION public.chat_broadcast_conversation();

-- ---- internal: post a system event into an order's thread (no-op if no thread) ----
CREATE OR REPLACE FUNCTION public.chat_post_order_event(p_order_id uuid, p_event jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_conv uuid; v_tenant uuid;
BEGIN
    SELECT id, tenant_id INTO v_conv, v_tenant
    FROM public.chat_conversations WHERE kind = 'order' AND order_id = p_order_id;
    IF v_conv IS NULL THEN RETURN; END IF;  -- no thread → nothing to narrate
    INSERT INTO public.chat_messages (conversation_id, tenant_id, sender_id, body, is_system, system_event)
    VALUES (v_conv, v_tenant, NULL, '', true, p_event);
END; $$;

-- ---- assign an order (explicit; the orders trigger posts the 'assigned' event) ----
CREATE OR REPLACE FUNCTION public.chat_assign_order(p_order_id uuid, p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_tenant uuid;
BEGIN
    SELECT tenant_id INTO v_tenant FROM public.orders WHERE id = p_order_id;
    IF v_tenant IS NULL OR v_tenant NOT IN (SELECT get_user_tenant_ids()) THEN
        RAISE EXCEPTION 'order not in your tenant' USING ERRCODE = '42501';
    END IF;
    IF p_user_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.tenant_members WHERE tenant_id = v_tenant AND user_id = p_user_id AND status = 'active'
    ) THEN
        RAISE EXCEPTION 'assignee not in this tenant' USING ERRCODE = '42501';
    END IF;
    UPDATE public.orders SET assigned_to = p_user_id, assigned_at = now() WHERE id = p_order_id;
END; $$;

-- ---- resolve / unresolve an order (or any) thread ----
CREATE OR REPLACE FUNCTION public.chat_set_conversation_resolved(p_conversation_id uuid, p_resolved boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    IF NOT public.chat_is_member(p_conversation_id) THEN RAISE EXCEPTION 'not a member' USING ERRCODE = '42501'; END IF;
    UPDATE public.chat_conversations
       SET resolved_at = CASE WHEN p_resolved THEN now() ELSE NULL END, updated_at = now()
     WHERE id = p_conversation_id;
END; $$;

-- ---- the engine: orders status/assignment/delivery → thread system events ----
CREATE OR REPLACE FUNCTION public.chat_orders_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
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
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_chat_orders_event ON public.orders;
CREATE TRIGGER trg_chat_orders_event
    AFTER UPDATE OF status, assigned_to, delivered_at ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.chat_orders_event();

-- ---- grants ----
REVOKE EXECUTE ON FUNCTION public.chat_post_order_event(uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.chat_orders_event() FROM PUBLIC, anon;  -- trigger fn; never called directly
REVOKE EXECUTE ON FUNCTION public.chat_assign_order(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.chat_set_conversation_resolved(uuid, boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.chat_assign_order(uuid, uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.chat_set_conversation_resolved(uuid, boolean) TO authenticated;
