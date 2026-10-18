-- =============================================
-- CHAT CORE TABLES (channels + DMs + order threads)
-- All tenant-scoped, RLS on from creation.
-- =============================================

-- 1. CONVERSATIONS
CREATE TABLE public.chat_conversations (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    kind            text NOT NULL CHECK (kind IN ('channel','dm','group','order')),
    name            text,                       -- null for dm
    topic           text,
    order_id        uuid REFERENCES public.orders(id) ON DELETE SET NULL,
    is_private      boolean NOT NULL DEFAULT true,
    created_by      uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    last_message_at timestamptz,
    archived_at     timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX chat_conversations_tenant_idx ON public.chat_conversations (tenant_id);
CREATE INDEX chat_conversations_tenant_lastmsg_idx ON public.chat_conversations (tenant_id, last_message_at DESC NULLS LAST);
CREATE UNIQUE INDEX chat_conversations_order_uidx ON public.chat_conversations (order_id) WHERE kind = 'order';

-- 2. MEMBERS
CREATE TABLE public.chat_members (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id uuid NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
    user_id         uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    role            text NOT NULL DEFAULT 'member' CHECK (role IN ('owner','member')),
    last_read_at    timestamptz NOT NULL DEFAULT now(),
    muted           boolean NOT NULL DEFAULT false,
    joined_at       timestamptz NOT NULL DEFAULT now(),
    UNIQUE (conversation_id, user_id)
);
CREATE INDEX chat_members_user_idx ON public.chat_members (user_id);
CREATE INDEX chat_members_conversation_idx ON public.chat_members (conversation_id);

-- 3. MESSAGES
CREATE TABLE public.chat_messages (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id uuid NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
    tenant_id       uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    sender_id       uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    body            text NOT NULL DEFAULT '',
    reply_to_id     uuid REFERENCES public.chat_messages(id) ON DELETE SET NULL,
    client_msg_id   text,
    edited_at       timestamptz,
    deleted_at      timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX chat_messages_conversation_created_idx ON public.chat_messages (conversation_id, created_at DESC);
CREATE INDEX chat_messages_tenant_idx ON public.chat_messages (tenant_id);

-- 4. REFERENCES
CREATE TABLE public.chat_message_references (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id  uuid NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
    ref_type    text NOT NULL CHECK (ref_type IN ('order','customer','product')),
    ref_id      text NOT NULL,                  -- order.id uuid OR phone OR product name; text for flexibility
    snapshot    jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX chat_message_references_message_idx ON public.chat_message_references (message_id);

-- 5. REACTIONS
CREATE TABLE public.chat_message_reactions (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id  uuid NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
    user_id     uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    emoji       text NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (message_id, user_id, emoji)
);
CREATE INDEX chat_message_reactions_message_idx ON public.chat_message_reactions (message_id);

-- 6. ATTACHMENTS
CREATE TABLE public.chat_message_attachments (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id    uuid NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
    storage_path  text NOT NULL,
    file_name     text NOT NULL,
    mime          text,
    size_bytes    integer,
    width         integer,
    height        integer,
    created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX chat_message_attachments_message_idx ON public.chat_message_attachments (message_id);

-- 7. MENTIONS
CREATE TABLE public.chat_message_mentions (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id         uuid NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
    mentioned_user_id  uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE
);
CREATE INDEX chat_message_mentions_message_idx ON public.chat_message_mentions (message_id);
CREATE INDEX chat_message_mentions_user_idx ON public.chat_message_mentions (mentioned_user_id);

-- 8. PINS
CREATE TABLE public.chat_pins (
    conversation_id uuid NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
    message_id      uuid NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
    pinned_by       uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    pinned_at       timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (conversation_id, message_id)
);

-- 9. USER STATUS (persisted last-seen + custom status)
CREATE TABLE public.chat_user_status (
    user_id      uuid PRIMARY KEY REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    tenant_id    uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
    custom_emoji text,
    custom_text  text,
    last_seen_at timestamptz,
    updated_at   timestamptz NOT NULL DEFAULT now()
);

-- =============================================
-- MEMBERSHIP HELPER (avoids RLS recursion between conversations<->members)
-- =============================================
CREATE OR REPLACE FUNCTION public.chat_is_member(p_conversation_id uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.chat_members
        WHERE conversation_id = p_conversation_id AND user_id = auth.uid()
    );
$$;

-- =============================================
-- RLS
-- =============================================
ALTER TABLE public.chat_conversations         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_members               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_message_references    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_message_reactions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_message_attachments   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_message_mentions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_pins                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_user_status           ENABLE ROW LEVEL SECURITY;

-- conversations: members read; tenant members create
CREATE POLICY chat_conversations_member_read ON public.chat_conversations
    FOR SELECT USING (
        tenant_id IN (SELECT get_user_tenant_ids())
        AND (chat_is_member(id) OR (kind = 'channel' AND is_private = false))
    );
CREATE POLICY chat_conversations_tenant_insert ON public.chat_conversations
    FOR INSERT WITH CHECK (
        tenant_id IN (SELECT get_user_tenant_ids())
        AND created_by = auth.uid()
    );
CREATE POLICY chat_conversations_member_update ON public.chat_conversations
    FOR UPDATE USING (chat_is_member(id)) WITH CHECK (tenant_id IN (SELECT get_user_tenant_ids()));

-- members: a user sees membership rows of conversations they belong to
CREATE POLICY chat_members_read ON public.chat_members
    FOR SELECT USING (chat_is_member(conversation_id));
CREATE POLICY chat_members_self_insert ON public.chat_members
    FOR INSERT WITH CHECK (
        conversation_id IN (
            SELECT id FROM public.chat_conversations WHERE tenant_id IN (SELECT get_user_tenant_ids())
        )
    );
CREATE POLICY chat_members_self_update ON public.chat_members
    FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- messages: members read; sender inserts own; author edits own
CREATE POLICY chat_messages_member_read ON public.chat_messages
    FOR SELECT USING (chat_is_member(conversation_id));
CREATE POLICY chat_messages_sender_insert ON public.chat_messages
    FOR INSERT WITH CHECK (
        sender_id = auth.uid()
        AND chat_is_member(conversation_id)
        AND tenant_id IN (SELECT get_user_tenant_ids())
    );
CREATE POLICY chat_messages_author_update ON public.chat_messages
    FOR UPDATE USING (sender_id = auth.uid()) WITH CHECK (sender_id = auth.uid());

-- child tables: visible/insertable if the parent message's conversation is yours
CREATE POLICY chat_refs_member_read ON public.chat_message_references
    FOR SELECT USING (EXISTS (SELECT 1 FROM public.chat_messages m WHERE m.id = message_id AND chat_is_member(m.conversation_id)));
CREATE POLICY chat_refs_member_insert ON public.chat_message_references
    FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.chat_messages m WHERE m.id = message_id AND m.sender_id = auth.uid()));

CREATE POLICY chat_reactions_member_read ON public.chat_message_reactions
    FOR SELECT USING (EXISTS (SELECT 1 FROM public.chat_messages m WHERE m.id = message_id AND chat_is_member(m.conversation_id)));
CREATE POLICY chat_reactions_self_write ON public.chat_message_reactions
    FOR ALL USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.chat_messages m WHERE m.id = message_id AND chat_is_member(m.conversation_id)));

CREATE POLICY chat_attachments_member_read ON public.chat_message_attachments
    FOR SELECT USING (EXISTS (SELECT 1 FROM public.chat_messages m WHERE m.id = message_id AND chat_is_member(m.conversation_id)));
CREATE POLICY chat_attachments_member_insert ON public.chat_message_attachments
    FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.chat_messages m WHERE m.id = message_id AND m.sender_id = auth.uid()));

CREATE POLICY chat_mentions_member_read ON public.chat_message_mentions
    FOR SELECT USING (EXISTS (SELECT 1 FROM public.chat_messages m WHERE m.id = message_id AND chat_is_member(m.conversation_id)));
CREATE POLICY chat_mentions_member_insert ON public.chat_message_mentions
    FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.chat_messages m WHERE m.id = message_id AND m.sender_id = auth.uid()));

CREATE POLICY chat_pins_member_read ON public.chat_pins
    FOR SELECT USING (chat_is_member(conversation_id));
CREATE POLICY chat_pins_member_write ON public.chat_pins
    FOR ALL USING (chat_is_member(conversation_id)) WITH CHECK (chat_is_member(conversation_id));

CREATE POLICY chat_user_status_tenant_read ON public.chat_user_status
    FOR SELECT USING (tenant_id IN (SELECT get_user_tenant_ids()));
CREATE POLICY chat_user_status_self_write ON public.chat_user_status
    FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

GRANT EXECUTE ON FUNCTION public.chat_is_member(uuid) TO authenticated;;
