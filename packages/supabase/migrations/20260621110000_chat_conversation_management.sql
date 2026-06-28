-- =============================================
-- CHAT PHASE 2A: conversation management
-- Narrow SECURITY DEFINER RPCs (authz enforced internally; we deliberately do
-- NOT add a client DELETE policy or loosen INSERT RLS). authenticated-only.
-- =============================================

-- ---- authorization helper: owner member OR tenant admin ----
CREATE OR REPLACE FUNCTION public.chat_is_conversation_admin(p_conversation_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, pg_temp AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.chat_conversations c
        WHERE c.id = p_conversation_id
          AND (
              public.is_tenant_admin(c.tenant_id)
              OR EXISTS (
                  SELECT 1 FROM public.chat_members m
                  WHERE m.conversation_id = c.id AND m.user_id = auth.uid() AND m.role = 'owner'
              )
          )
    );
$$;

-- ---- create channel ----
CREATE OR REPLACE FUNCTION public.chat_create_channel(
    p_name text, p_is_private boolean DEFAULT true, p_topic text DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_tenant uuid; v_id uuid;
BEGIN
    v_tenant := get_current_tenant_id();
    -- current_tenant_id is self-updatable, so trust the membership-verified set,
    -- not get_current_tenant_id() alone (else a poisoned current_tenant_id could
    -- plant a conversation into a tenant the caller does not belong to).
    IF v_tenant IS NULL OR v_tenant NOT IN (SELECT get_user_tenant_ids()) THEN
        RAISE EXCEPTION 'no active tenant' USING ERRCODE = '42501';
    END IF;
    IF COALESCE(btrim(p_name), '') = '' THEN RAISE EXCEPTION 'channel name required' USING ERRCODE = '22023'; END IF;
    INSERT INTO public.chat_conversations (tenant_id, kind, name, topic, is_private, created_by)
    VALUES (v_tenant, 'channel', btrim(p_name), NULLIF(btrim(p_topic), ''), COALESCE(p_is_private, true), auth.uid())
    RETURNING id INTO v_id;
    INSERT INTO public.chat_members (conversation_id, user_id, role) VALUES (v_id, auth.uid(), 'owner');
    RETURN v_id;
END; $$;

-- ---- create group DM ----
CREATE OR REPLACE FUNCTION public.chat_create_group(p_name text, p_user_ids uuid[])
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_tenant uuid; v_id uuid; v_uid uuid;
BEGIN
    v_tenant := get_current_tenant_id();
    -- current_tenant_id is self-updatable, so trust the membership-verified set,
    -- not get_current_tenant_id() alone (else a poisoned current_tenant_id could
    -- plant a conversation into a tenant the caller does not belong to).
    IF v_tenant IS NULL OR v_tenant NOT IN (SELECT get_user_tenant_ids()) THEN
        RAISE EXCEPTION 'no active tenant' USING ERRCODE = '42501';
    END IF;
    INSERT INTO public.chat_conversations (tenant_id, kind, name, is_private, created_by)
    VALUES (v_tenant, 'group', NULLIF(btrim(p_name), ''), true, auth.uid())
    RETURNING id INTO v_id;
    INSERT INTO public.chat_members (conversation_id, user_id, role) VALUES (v_id, auth.uid(), 'owner');
    IF p_user_ids IS NOT NULL THEN
        FOREACH v_uid IN ARRAY p_user_ids LOOP
            IF v_uid <> auth.uid()
               AND EXISTS (SELECT 1 FROM public.tenant_members WHERE tenant_id = v_tenant AND user_id = v_uid AND status = 'active') THEN
                INSERT INTO public.chat_members (conversation_id, user_id, role)
                VALUES (v_id, v_uid, 'member') ON CONFLICT (conversation_id, user_id) DO NOTHING;
            END IF;
        END LOOP;
    END IF;
    RETURN v_id;
END; $$;

-- ---- rename / set topic (channels & groups only) ----
CREATE OR REPLACE FUNCTION public.chat_rename_conversation(p_conversation_id uuid, p_name text, p_topic text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_kind text;
BEGIN
    SELECT kind INTO v_kind FROM public.chat_conversations WHERE id = p_conversation_id;
    IF v_kind IS NULL THEN RAISE EXCEPTION 'conversation not found' USING ERRCODE = '42501'; END IF;
    IF v_kind IN ('dm', 'order') THEN RAISE EXCEPTION 'cannot rename this conversation' USING ERRCODE = '42501'; END IF;
    IF NOT public.chat_is_conversation_admin(p_conversation_id) THEN RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501'; END IF;
    UPDATE public.chat_conversations
       SET name = COALESCE(NULLIF(btrim(p_name), ''), name),
           topic = NULLIF(btrim(p_topic), ''),
           updated_at = now()
     WHERE id = p_conversation_id;
END; $$;

-- ---- archive / unarchive (admin; hides for everyone) ----
CREATE OR REPLACE FUNCTION public.chat_archive_conversation(p_conversation_id uuid, p_archived boolean DEFAULT true)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    IF NOT public.chat_is_conversation_admin(p_conversation_id) THEN RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501'; END IF;
    UPDATE public.chat_conversations
       SET archived_at = CASE WHEN p_archived THEN now() ELSE NULL END, updated_at = now()
     WHERE id = p_conversation_id;
END; $$;

-- ---- leave (self; not for DMs; last owner blocked) ----
CREATE OR REPLACE FUNCTION public.chat_leave_conversation(p_conversation_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_kind text; v_role text; v_owner_count int;
BEGIN
    SELECT kind INTO v_kind FROM public.chat_conversations WHERE id = p_conversation_id;
    IF v_kind IS NULL THEN RAISE EXCEPTION 'conversation not found' USING ERRCODE = '42501'; END IF;
    IF v_kind = 'dm' THEN RAISE EXCEPTION 'cannot leave a direct message' USING ERRCODE = '42501'; END IF;
    SELECT role INTO v_role FROM public.chat_members WHERE conversation_id = p_conversation_id AND user_id = auth.uid();
    IF v_role IS NULL THEN RETURN; END IF;   -- not a member: no-op
    IF v_role = 'owner' THEN
        SELECT count(*) INTO v_owner_count FROM public.chat_members WHERE conversation_id = p_conversation_id AND role = 'owner';
        IF v_owner_count <= 1 THEN
            RAISE EXCEPTION 'last owner cannot leave; delete the conversation or assign another owner' USING ERRCODE = '42501';
        END IF;
    END IF;
    DELETE FROM public.chat_members WHERE conversation_id = p_conversation_id AND user_id = auth.uid();
END; $$;

-- ---- delete (owner only; channels & groups) ----
CREATE OR REPLACE FUNCTION public.chat_delete_conversation(p_conversation_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_kind text;
BEGIN
    SELECT kind INTO v_kind FROM public.chat_conversations WHERE id = p_conversation_id;
    IF v_kind IS NULL THEN RAISE EXCEPTION 'conversation not found' USING ERRCODE = '42501'; END IF;
    IF v_kind IN ('dm', 'order') THEN RAISE EXCEPTION 'cannot delete this conversation' USING ERRCODE = '42501'; END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.chat_members WHERE conversation_id = p_conversation_id AND user_id = auth.uid() AND role = 'owner'
    ) THEN
        RAISE EXCEPTION 'only an owner can delete' USING ERRCODE = '42501';
    END IF;
    DELETE FROM public.chat_conversations WHERE id = p_conversation_id;  -- cascades members + messages
END; $$;

-- ---- add members (admin; private channels & groups) ----
CREATE OR REPLACE FUNCTION public.chat_add_members(p_conversation_id uuid, p_user_ids uuid[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_tenant uuid; v_kind text; v_uid uuid;
BEGIN
    SELECT tenant_id, kind INTO v_tenant, v_kind FROM public.chat_conversations WHERE id = p_conversation_id;
    IF v_tenant IS NULL THEN RAISE EXCEPTION 'conversation not found' USING ERRCODE = '42501'; END IF;
    IF v_kind NOT IN ('channel', 'group') THEN RAISE EXCEPTION 'cannot add members to this conversation' USING ERRCODE = '42501'; END IF;
    IF NOT public.chat_is_conversation_admin(p_conversation_id) THEN RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501'; END IF;
    IF p_user_ids IS NOT NULL THEN
        FOREACH v_uid IN ARRAY p_user_ids LOOP
            IF EXISTS (SELECT 1 FROM public.tenant_members WHERE tenant_id = v_tenant AND user_id = v_uid AND status = 'active') THEN
                INSERT INTO public.chat_members (conversation_id, user_id, role)
                VALUES (p_conversation_id, v_uid, 'member') ON CONFLICT (conversation_id, user_id) DO NOTHING;
            END IF;
        END LOOP;
    END IF;
END; $$;

-- ---- remove member (admin; last owner protected) ----
CREATE OR REPLACE FUNCTION public.chat_remove_member(p_conversation_id uuid, p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_target_role text; v_owner_count int;
BEGIN
    IF NOT public.chat_is_conversation_admin(p_conversation_id) THEN RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501'; END IF;
    SELECT role INTO v_target_role FROM public.chat_members WHERE conversation_id = p_conversation_id AND user_id = p_user_id;
    IF v_target_role IS NULL THEN RETURN; END IF;
    IF v_target_role = 'owner' THEN
        SELECT count(*) INTO v_owner_count FROM public.chat_members WHERE conversation_id = p_conversation_id AND role = 'owner';
        IF v_owner_count <= 1 THEN RAISE EXCEPTION 'cannot remove the last owner' USING ERRCODE = '42501'; END IF;
    END IF;
    DELETE FROM public.chat_members WHERE conversation_id = p_conversation_id AND user_id = p_user_id;
END; $$;

-- ---- broadcast: conversation rename/archive ----
CREATE OR REPLACE FUNCTION public.chat_broadcast_conversation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_member record;
BEGIN
    BEGIN
        PERFORM realtime.send(
            jsonb_build_object('id', NEW.id, 'name', NEW.name, 'topic', NEW.topic, 'archived_at', NEW.archived_at),
            'conversation:update', public.chat_topic_conversation(NEW.id), true
        );
        FOR v_member IN SELECT user_id FROM public.chat_members WHERE conversation_id = NEW.id LOOP
            PERFORM realtime.send(
                jsonb_build_object('conversation_id', NEW.id),
                'inbox:refresh', public.chat_topic_user(v_member.user_id), true
            );
        END LOOP;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    RETURN NEW;
END; $$;

-- fires only when these columns change (NOT on every message's last_message_at bump)
DROP TRIGGER IF EXISTS trg_chat_broadcast_conversation ON public.chat_conversations;
CREATE TRIGGER trg_chat_broadcast_conversation
    AFTER UPDATE OF name, topic, archived_at ON public.chat_conversations
    FOR EACH ROW EXECUTE FUNCTION public.chat_broadcast_conversation();

-- ---- broadcast: membership add/remove ----
CREATE OR REPLACE FUNCTION public.chat_broadcast_membership()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_conv uuid; v_user uuid;
BEGIN
    IF TG_OP = 'INSERT' THEN v_conv := NEW.conversation_id; v_user := NEW.user_id;
    ELSE v_conv := OLD.conversation_id; v_user := OLD.user_id;
    END IF;
    BEGIN
        PERFORM realtime.send(jsonb_build_object('conversation_id', v_conv), 'inbox:refresh', public.chat_topic_user(v_user), true);
        PERFORM realtime.send(jsonb_build_object('id', v_conv), 'conversation:update', public.chat_topic_conversation(v_conv), true);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    RETURN COALESCE(NEW, OLD);
END; $$;

DROP TRIGGER IF EXISTS trg_chat_broadcast_membership ON public.chat_members;
CREATE TRIGGER trg_chat_broadcast_membership
    AFTER INSERT OR DELETE ON public.chat_members
    FOR EACH ROW EXECUTE FUNCTION public.chat_broadcast_membership();

-- ---- harden pre-existing chat_find_or_create_dm (same poisonable-tenant base) ----
-- It resolved the tenant from get_current_tenant_id() and verified only the OTHER
-- user's membership, never the caller's — so a poisoned current_tenant_id could
-- create a DM row inside a foreign tenant. Add the caller-membership assertion.
CREATE OR REPLACE FUNCTION public.chat_find_or_create_dm(p_other_user_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_tenant_id uuid;
    v_conv_id uuid;
BEGIN
    v_tenant_id := get_current_tenant_id();
    IF v_tenant_id IS NULL OR v_tenant_id NOT IN (SELECT get_user_tenant_ids()) THEN
        RAISE EXCEPTION 'no active tenant' USING ERRCODE = '42501';
    END IF;
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
END; $$;

-- ---- grants: authenticated-only ----
REVOKE EXECUTE ON FUNCTION public.chat_is_conversation_admin(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.chat_create_channel(text, boolean, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.chat_create_group(text, uuid[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.chat_rename_conversation(uuid, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.chat_archive_conversation(uuid, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.chat_leave_conversation(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.chat_delete_conversation(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.chat_add_members(uuid, uuid[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.chat_remove_member(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.chat_broadcast_conversation() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.chat_broadcast_membership() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.chat_is_conversation_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.chat_create_channel(text, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.chat_create_group(text, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.chat_rename_conversation(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.chat_archive_conversation(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.chat_leave_conversation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.chat_delete_conversation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.chat_add_members(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.chat_remove_member(uuid, uuid) TO authenticated;
