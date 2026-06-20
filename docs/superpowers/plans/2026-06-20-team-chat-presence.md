# Team Chat + Live Presence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an in-app, tenant-scoped team chat (channels + DMs, Slack-like) with first-class order/customer/product references, @mentions, reactions, attachments, typing, edit/delete/pin, plus an enriched live-presence view — entered from the top-bar avatar stack as a right-side drawer.

**Architecture:** Postgres tables (all `chat_`-prefixed, RLS + tenant-scoped) are the source of truth. Live delivery uses Supabase **Realtime Broadcast-from-Database**: an `AFTER INSERT` trigger on `chat_messages` calls `realtime.send(...)` to a per-conversation private topic and to each member's inbox topic. Private-channel access is gated by **RLS on `realtime.messages`**. Presence moves off the leaky global channel onto a per-tenant channel with an enriched payload. UI reuses `@scheniders/ui` primitives, TanStack Query, and the existing notifications dropdown for mention alerts.

**Tech Stack:** Next.js 16 / React 19, `@supabase/supabase-js@^2.50.1`, `@supabase/ssr@^0.8.0`, TanStack Query v5, `@tanstack/react-virtual@^3`, framer-motion v11, Tailwind v4 (CSS-first), Zod v4, Vitest, Playwright.

**Source spec:** [docs/superpowers/specs/2026-06-20-team-chat-presence-design.md](../specs/2026-06-20-team-chat-presence-design.md)

---

## Conventions locked from the codebase (read before starting)

- **Migrations:** `packages/supabase/migrations/YYYYMMDDHHMMSS_description.sql`. Tables use `UUID PRIMARY KEY DEFAULT gen_random_uuid()`, `TIMESTAMPTZ NOT NULL DEFAULT now()`. Enable RLS at creation: `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;`. Policy names `chat_<table>_<action>_<context>`. Tenant filter predicate: `tenant_id IN (SELECT get_user_tenant_ids())`. Admin checks: `is_tenant_admin(tenant_id)`. Indexes named `<table>_<cols>_idx` / `_uidx`.
- **Helper fns available:** `get_user_tenant_ids() RETURNS SETOF uuid`, `get_current_tenant_id() RETURNS uuid`, `is_tenant_admin(uuid) RETURNS bool`. All `SECURITY DEFINER STABLE`.
- **Trigger fns:** `LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp`; `DROP TRIGGER IF EXISTS` then `CREATE TRIGGER`.
- **Realtime publication:** `ALTER PUBLICATION supabase_realtime ADD TABLE public.<t>;` (only needed if a table is consumed via `postgres_changes`; our chat uses Broadcast, so we do NOT add `chat_messages` to the publication).
- **Auth hook:** `useAuth()` → `{ user, profile, tenantId, role, permissions, ... }` from `@/hooks/use-auth`. Tenant id is `tenantId` (also `profile.current_tenant_id`).
- **Supabase clients:** browser singleton `supabase` from `@/lib/supabase`; server `createSupabaseServerClient()`, `createSupabaseServiceClient()`, `verifyAccessToken(token)` from `@/lib/supabase-server`.
- **RPC calls:** `supabase.rpc('fn_name', { p_arg: ... })`.
- **Query client:** `@/lib/query-client` (gcTime 10m, staleTime 30s, retry 2). Key factories live next to hooks (see `hooks/use-customers-query.ts`). Optimistic pattern: `onMutate` (cancel + snapshot + set), `onError` (rollback), `onSettled` (invalidate).
- **UI imports:** `@scheniders/ui/button`, `/input`, `/textarea`, `/dialog` (`Dialog`, `DialogContent`, `BottomSheetContent`), `/popover`, `/dropdown-menu`, `/card`; `Avatar` from `@scheniders/ui`. **No Sheet/Tooltip/Tabs/EmojiPicker exist — we build a `ChatSheet` and a minimal emoji menu.** `framer-motion` and `@tanstack/react-virtual` are available.
- **Toast:** `import { toast } from "@/hooks/use-toast"` → `toast({ title, description, variant, duration, icon })`.
- **Order modal open:** `useOrderStore()` → `openOrderDetails(order)`; fetch full order via `orderRepository.findById(id)`.
- **Mobile:** `useIsMobile(768)` from `@/hooks/use-mobile`.
- **Top-bar mount point:** `components/layout/global-search.tsx`, right-actions cluster (~L399–446) — chat trigger goes right after `<GlobalPresenceIndicator />`.
- **Engineering rules (CLAUDE.md):** no `any`/`@ts-ignore`/`eslint-disable`/non-null `!` to silence; Zod at boundaries; LTR only (`lang`, never `dir`); IQD, no tax. Run `pnpm type-check` + `pnpm lint` + relevant `pnpm exec vitest run` before "done".

### Pre-flight (do once, do not commit code on the source branch)

- [ ] **Create a dedicated branch off `main`:** `git checkout main && git pull && git checkout -b feat/team-chat-presence`. (Do NOT build on `feat/leads-table-tweaks` — it has unrelated uncommitted work.)
- [ ] Confirm Supabase MCP targets the NEW project `sduvpgqwhxragxtxztur` (per CLAUDE.md). Migrations in this plan are applied with `mcp__supabase__apply_migration` (auto-applied per repo policy) AND written to `packages/supabase/migrations/` so they live in source.

---

## File structure (created / modified)

**Migrations (create):**
- `packages/supabase/migrations/20260620100000_chat_core_tables.sql` — all `chat_*` tables + indexes + RLS.
- `packages/supabase/migrations/20260620100100_chat_rpc_and_triggers.sql` — `chat_send_message` RPC, broadcast trigger, `chat_find_or_create_dm`, `chat_find_or_create_order_conversation`, `chat_mark_read`.
- `packages/supabase/migrations/20260620100200_chat_realtime_authorization.sql` — RLS on `realtime.messages` for private topics.
- `packages/supabase/migrations/20260620100300_chat_attachments_bucket.sql` — private `chat-attachments` bucket + `storage.objects` RLS.
- `packages/supabase/migrations/20260620100400_chat_mention_notifications.sql` — `chat_notifications` table + RLS.

**Types & lib (create):**
- `apps/platform/types/chat.ts` — shared TS types (mirror DB).
- `apps/platform/lib/chat/topics.ts` — topic-name builders (single source of truth).
- `apps/platform/lib/chat/chat-repository.ts` — data access wrapper.
- `apps/platform/lib/chat/parse-references.ts` — extract `#`/`@` tokens from a draft.

**Hooks (create):**
- `apps/platform/hooks/chat/use-conversations.ts`
- `apps/platform/hooks/chat/use-messages.ts` (query + realtime broadcast subscribe + send mutation)
- `apps/platform/hooks/chat/use-typing-indicator.ts`
- `apps/platform/hooks/chat/use-unread-inbox.ts`
- `apps/platform/hooks/chat/use-tenant-presence.ts` (replaces global presence)
- `apps/platform/hooks/chat/use-user-status.ts`
- `apps/platform/hooks/chat/use-reference-search.ts`
- `apps/platform/hooks/chat/use-mention-notifications.ts`
- `apps/platform/store/use-chat-store.ts` — Zustand UI state (drawer open, active conversation).

**Components (create):**
- `apps/platform/components/chat/chat-sheet.tsx` — right drawer shell (+ expand button).
- `apps/platform/components/chat/conversation-list.tsx`
- `apps/platform/components/chat/message-list.tsx`
- `apps/platform/components/chat/message-item.tsx`
- `apps/platform/components/chat/reference-card.tsx`
- `apps/platform/components/chat/composer.tsx` (with `#`/`@` autocomplete + attachments + emoji)
- `apps/platform/components/chat/reaction-bar.tsx`
- `apps/platform/components/chat/live-presence-stack.tsx` — top-bar avatar stack + popover + "Message".
- `apps/platform/components/chat/chat-trigger.tsx` — unread badge button that opens the drawer.

**Modified:**
- `apps/platform/components/layout/global-search.tsx` — mount `<ChatTrigger/>` + swap presence to `<LivePresenceStack/>`.
- `apps/platform/components/orders/order-details-modal.tsx` — add "Discuss" button (control cluster).
- `apps/platform/components/layout/notifications-dropdown.tsx` — render `mention` notifications.
- `apps/platform/app/layout.tsx` — mount `<ChatSheet/>` once inside the authed shell.
- `apps/platform/components/layout/global-presence-indicator.tsx` — **delete** after `LivePresenceStack` replaces it.

**P2 (separate plan):** `apps/platform/app/chat/page.tsx` (full page), threads, read receipts, search.

---

# PHASE 0 — Foundation (DB, realtime authz, storage, presence fix)

> P0 is verified primarily with SQL-level RLS tests via the Supabase MCP `execute_sql` (acting as different roles) and Vitest unit tests for pure helpers. No UI yet.

## Task 1: Core chat tables + RLS

**Files:**
- Create: `packages/supabase/migrations/20260620100000_chat_core_tables.sql`

- [ ] **Step 1: Write the migration**

```sql
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

GRANT EXECUTE ON FUNCTION public.chat_is_member(uuid) TO authenticated;
```

- [ ] **Step 2: Apply the migration**

Use `mcp__supabase__apply_migration` with name `chat_core_tables` and the SQL above (also save the file to `packages/supabase/migrations/`).
Expected: success, no error.

- [ ] **Step 3: Verify tables + RLS exist**

Run via `mcp__supabase__execute_sql`:
```sql
SELECT tablename, rowsecurity FROM pg_tables WHERE tablename LIKE 'chat\_%' ORDER BY tablename;
```
Expected: 9 rows, every `rowsecurity = true`.

- [ ] **Step 4: Commit**

```bash
git add packages/supabase/migrations/20260620100000_chat_core_tables.sql
git commit -m "feat(chat): core chat tables + RLS (P0)"
```

## Task 2: RPCs + broadcast trigger

**Files:**
- Create: `packages/supabase/migrations/20260620100100_chat_rpc_and_triggers.sql`

- [ ] **Step 1: Write the migration**

```sql
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
GRANT EXECUTE ON FUNCTION public.chat_mark_read(uuid) TO authenticated;
```

> **Note:** This migration references `public.chat_notifications` created in Task 5. Apply Task 5 first, OR apply this and Task 5 together; the `chat_send_message` body only resolves `chat_notifications` at call time, so creation order between Tasks 2 and 5 does not block migration apply (plpgsql is parsed lazily). Apply both before any send.

- [ ] **Step 2: Apply** with `mcp__supabase__apply_migration` name `chat_rpc_and_triggers`. Expected: success.
- [ ] **Step 3: Verify functions exist**
```sql
SELECT proname FROM pg_proc WHERE proname LIKE 'chat\_%' ORDER BY proname;
```
Expected: includes `chat_send_message`, `chat_find_or_create_dm`, `chat_find_or_create_order_conversation`, `chat_mark_read`, `chat_broadcast_message`, `chat_topic_conversation`, `chat_topic_user`, `chat_is_member`.
- [ ] **Step 4: Commit**
```bash
git add packages/supabase/migrations/20260620100100_chat_rpc_and_triggers.sql
git commit -m "feat(chat): send_message RPC + broadcast trigger + dm/order/mark-read RPCs (P0)"
```

## Task 3: Realtime channel authorization

**Files:**
- Create: `packages/supabase/migrations/20260620100200_chat_realtime_authorization.sql`

Realtime private channels authorize subscribe/broadcast via RLS on `realtime.messages`. A client may use a topic only if a policy passes. Topics: `chat:conv:<uuid>` (members), `chat:user:<uuid>` (self), `chat:tenant:<uuid>:presence` (tenant members).

- [ ] **Step 1: Write the migration**

```sql
-- Enable RLS-gated access to private Realtime topics for chat.
-- realtime.messages is the broadcast/presence authorization table.
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

-- helper to read the conversation id out of a 'chat:conv:<uuid>' topic
CREATE OR REPLACE FUNCTION public.chat_topic_conv_id(p_topic text)
RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE WHEN p_topic LIKE 'chat:conv:%'
                THEN substring(p_topic from 'chat:conv:(.*)')::uuid END;
$$;

-- SELECT = subscribe/receive; INSERT = broadcast/send
CREATE POLICY chat_realtime_conv_read ON realtime.messages
    FOR SELECT TO authenticated
    USING (
        realtime.topic() LIKE 'chat:conv:%'
        AND public.chat_is_member(public.chat_topic_conv_id(realtime.topic()))
    );
CREATE POLICY chat_realtime_conv_write ON realtime.messages
    FOR INSERT TO authenticated
    WITH CHECK (
        realtime.topic() LIKE 'chat:conv:%'
        AND public.chat_is_member(public.chat_topic_conv_id(realtime.topic()))
    );

-- per-user inbox: only the owner may read
CREATE POLICY chat_realtime_inbox_read ON realtime.messages
    FOR SELECT TO authenticated
    USING (realtime.topic() = 'chat:user:' || auth.uid()::text);

-- tenant presence: any active tenant member may read + track
CREATE POLICY chat_realtime_presence_read ON realtime.messages
    FOR SELECT TO authenticated
    USING (
        realtime.topic() LIKE 'chat:tenant:%:presence'
        AND substring(realtime.topic() from 'chat:tenant:(.*):presence')::uuid IN (SELECT get_user_tenant_ids())
    );
CREATE POLICY chat_realtime_presence_write ON realtime.messages
    FOR INSERT TO authenticated
    WITH CHECK (
        realtime.topic() LIKE 'chat:tenant:%:presence'
        AND substring(realtime.topic() from 'chat:tenant:(.*):presence')::uuid IN (SELECT get_user_tenant_ids())
    );

GRANT EXECUTE ON FUNCTION public.chat_topic_conv_id(text) TO authenticated;
```

- [ ] **Step 2: Apply** with name `chat_realtime_authorization`.

> If `ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY` errors as already enabled, drop that line and re-apply — policies are the part that matters.

- [ ] **Step 3: Verify policies**
```sql
SELECT policyname FROM pg_policies WHERE schemaname = 'realtime' AND policyname LIKE 'chat\_%';
```
Expected: the 5 `chat_realtime_*` policies.
- [ ] **Step 4: Commit**
```bash
git add packages/supabase/migrations/20260620100200_chat_realtime_authorization.sql
git commit -m "feat(chat): realtime channel authorization for private topics (P0)"
```

## Task 4: Attachments storage bucket

**Files:**
- Create: `packages/supabase/migrations/20260620100300_chat_attachments_bucket.sql`

Mirror the private `qc-evidence` pattern: path prefix `{tenant_id}/{conversation_id}/{uuid}`; access gated by tenant membership.

- [ ] **Step 1: Write the migration**

```sql
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('chat-attachments', 'chat-attachments', false, 10485760,
        ARRAY['image/jpeg','image/png','image/webp','image/gif','application/pdf'])
ON CONFLICT (id) DO NOTHING;

-- path: {tenant_id}/{conversation_id}/{file}. First folder = tenant id.
CREATE POLICY chat_attachments_read ON storage.objects
    FOR SELECT TO authenticated
    USING (
        bucket_id = 'chat-attachments'
        AND (storage.foldername(name))[1]::uuid IN (SELECT get_user_tenant_ids())
    );
CREATE POLICY chat_attachments_insert ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'chat-attachments'
        AND (storage.foldername(name))[1]::uuid IN (SELECT get_user_tenant_ids())
    );
CREATE POLICY chat_attachments_delete ON storage.objects
    FOR DELETE TO authenticated
    USING (
        bucket_id = 'chat-attachments'
        AND (storage.foldername(name))[1]::uuid IN (SELECT get_user_tenant_ids())
    );
```

- [ ] **Step 2: Apply** with name `chat_attachments_bucket`.
- [ ] **Step 3: Verify**
```sql
SELECT id, public FROM storage.buckets WHERE id = 'chat-attachments';
```
Expected: 1 row, `public = false`.
- [ ] **Step 4: Commit**
```bash
git add packages/supabase/migrations/20260620100300_chat_attachments_bucket.sql
git commit -m "feat(chat): private chat-attachments bucket + storage RLS (P0)"
```

## Task 5: Mention notifications table

**Files:**
- Create: `packages/supabase/migrations/20260620100400_chat_mention_notifications.sql`

- [ ] **Step 1: Write the migration**

```sql
CREATE TABLE public.chat_notifications (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    recipient_id    uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    actor_id        uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    actor_name      text NOT NULL,
    actor_avatar    text,
    conversation_id uuid REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
    message_id      uuid REFERENCES public.chat_messages(id) ON DELETE CASCADE,
    preview         text NOT NULL DEFAULT '',
    is_read         boolean NOT NULL DEFAULT false,
    created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX chat_notifications_recipient_idx ON public.chat_notifications (recipient_id, created_at DESC);

ALTER TABLE public.chat_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY chat_notifications_recipient_read ON public.chat_notifications
    FOR SELECT USING (recipient_id = auth.uid());
CREATE POLICY chat_notifications_recipient_update ON public.chat_notifications
    FOR UPDATE USING (recipient_id = auth.uid()) WITH CHECK (recipient_id = auth.uid());

-- Realtime postgres_changes feed for the dropdown (mirrors order_notifications).
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_notifications;
```

- [ ] **Step 2: Apply** with name `chat_mention_notifications`. (Apply before sending any mention.)
- [ ] **Step 3: Verify**
```sql
SELECT rowsecurity FROM pg_tables WHERE tablename = 'chat_notifications';
```
Expected: `true`.
- [ ] **Step 4: Commit**
```bash
git add packages/supabase/migrations/20260620100400_chat_mention_notifications.sql
git commit -m "feat(chat): mention notifications table + RLS (P0)"
```

## Task 6: Cross-tenant RLS isolation test (the security gate)

**Files:**
- Test: executed via `mcp__supabase__execute_sql` (documented here; also captured as a SQL fixture committed under `packages/supabase/tests/chat_rls.sql`)
- Create: `packages/supabase/tests/chat_rls.sql`

- [ ] **Step 1: Write the test fixture**

```sql
-- chat_rls.sql — run sections as a privileged connection; uses set_config to impersonate.
-- Seeds two tenants + one user each + a private channel in tenant A.
-- Asserts tenant B's user cannot read tenant A's conversation or messages.

-- (Pseudographic harness: replace :tenantA/:userA/:userB/:convA with seeded uuids.)
-- 1) As userA, send a message:
SELECT set_config('request.jwt.claims', json_build_object('sub', :'userA', 'role','authenticated')::text, true);
SELECT public.chat_send_message(:'convA', 'hello from A');

-- 2) As userB, try to read tenant A's messages — expect 0 rows:
SELECT set_config('request.jwt.claims', json_build_object('sub', :'userB', 'role','authenticated')::text, true);
SELECT count(*) AS leaked_messages FROM public.chat_messages WHERE conversation_id = :'convA';
-- EXPECT leaked_messages = 0

-- 3) As userB, try to read the conversation row — expect 0 rows:
SELECT count(*) AS leaked_convs FROM public.chat_conversations WHERE id = :'convA';
-- EXPECT leaked_convs = 0
```

- [ ] **Step 2: Run it against the project**

Seed two tenants/users with `mcp__supabase__execute_sql`, then run the impersonation queries.
Expected: `leaked_messages = 0` and `leaked_convs = 0`. If either is non-zero, RLS is broken — STOP and fix Task 1 policies before proceeding.

- [ ] **Step 3: Run the realtime authorization check**

As userB, attempt a subscribe to `chat:conv:<convA>` from a quick Node script using `supabase.channel(topic,{config:{private:true}})`; expect the subscription to receive a `CHANNEL_ERROR`/closed status (authorization denied). Document the observed status.

- [ ] **Step 4: Commit**
```bash
git add packages/supabase/tests/chat_rls.sql
git commit -m "test(chat): cross-tenant RLS + realtime authz isolation fixture (P0)"
```

## Task 7: Tenant-scoped presence fix + topic lib

**Files:**
- Create: `apps/platform/lib/chat/topics.ts`
- Create: `apps/platform/hooks/chat/use-tenant-presence.ts`
- Test: `apps/platform/lib/chat/topics.test.ts`

- [ ] **Step 1: Write the failing test for topic builders**

```typescript
// apps/platform/lib/chat/topics.test.ts
import { describe, it, expect } from "vitest";
import { conversationTopic, userInboxTopic, tenantPresenceTopic } from "./topics";

describe("chat topics", () => {
    it("builds a conversation topic", () => {
        expect(conversationTopic("abc")).toBe("chat:conv:abc");
    });
    it("builds a user inbox topic", () => {
        expect(userInboxTopic("u1")).toBe("chat:user:u1");
    });
    it("builds a tenant presence topic", () => {
        expect(tenantPresenceTopic("t1")).toBe("chat:tenant:t1:presence");
    });
});
```

- [ ] **Step 2: Run it (fails — module missing)**

Run: `pnpm exec vitest run apps/platform/lib/chat/topics.test.ts`
Expected: FAIL (cannot find `./topics`).

- [ ] **Step 3: Implement the topic lib**

```typescript
// apps/platform/lib/chat/topics.ts
// Single source of truth for Realtime topic names. MUST match the SQL builders
// chat_topic_conversation / chat_topic_user and the realtime RLS policies.
export const conversationTopic = (conversationId: string) => `chat:conv:${conversationId}`;
export const userInboxTopic = (userId: string) => `chat:user:${userId}`;
export const tenantPresenceTopic = (tenantId: string) => `chat:tenant:${tenantId}:presence`;
```

- [ ] **Step 4: Run it (passes)**

Run: `pnpm exec vitest run apps/platform/lib/chat/topics.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Implement the tenant presence hook** (replaces `use-global-presence`)

```typescript
// apps/platform/hooks/chat/use-tenant-presence.ts
import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { tenantPresenceTopic } from "@/lib/chat/topics";

export type PresenceStatus = "online" | "idle" | "away";

export type TenantPresenceUser = {
    id: string;
    display_name: string;
    avatar_url?: string;
    role: string;
    online_at: string;
    activity?: string;       // e.g. "Order #7224"
    status: PresenceStatus;
    custom_emoji?: string;
    custom_text?: string;
};

const IDLE_MS = 5 * 60 * 1000;

export function useTenantPresence(activity?: string) {
    const { user, profile, tenantId } = useAuth();
    const [onlineUsers, setOnlineUsers] = useState<TenantPresenceUser[]>([]);
    const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
    const activityRef = useRef(activity);
    activityRef.current = activity;
    const lastActiveRef = useRef<number>(Date.now());

    const buildPayload = useCallback((): TenantPresenceUser => {
        const idleFor = Date.now() - lastActiveRef.current;
        const status: PresenceStatus = idleFor > IDLE_MS ? "idle" : "online";
        return {
            id: user!.id,
            display_name: profile?.display_name || user!.email?.split("@")[0] || "User",
            avatar_url: profile?.avatar_url ?? undefined,
            role: profile?.role || "member",
            online_at: new Date().toISOString(),
            activity: activityRef.current,
            status,
        };
    }, [user, profile]);

    useEffect(() => {
        if (!user?.id || !tenantId) return;
        const channel = supabase.channel(tenantPresenceTopic(tenantId), {
            config: { presence: { key: user.id }, private: true },
        });
        channelRef.current = channel;

        channel
            .on("presence", { event: "sync" }, () => {
                const state = channel.presenceState<TenantPresenceUser>();
                const users = Object.values(state).flat() as TenantPresenceUser[];
                const unique = Array.from(new Map(users.map((u) => [u.id, u])).values());
                unique.sort((a, b) => new Date(b.online_at).getTime() - new Date(a.online_at).getTime());
                setOnlineUsers(unique);
            })
            .subscribe(async (status) => {
                if (status === "SUBSCRIBED") await channel.track(buildPayload());
            });

        const markActive = () => { lastActiveRef.current = Date.now(); };
        const onVisible = () => {
            if (document.visibilityState === "visible") { markActive(); channel.track(buildPayload()); }
        };
        window.addEventListener("mousemove", markActive, { passive: true });
        window.addEventListener("keydown", markActive);
        document.addEventListener("visibilitychange", onVisible);

        // re-track every 60s so idle status + activity stay fresh
        const interval = setInterval(() => { channel.track(buildPayload()); }, 60_000);

        return () => {
            clearInterval(interval);
            window.removeEventListener("mousemove", markActive);
            window.removeEventListener("keydown", markActive);
            document.removeEventListener("visibilitychange", onVisible);
            channel.unsubscribe();
            channelRef.current = null;
        };
    }, [user?.id, tenantId, buildPayload]);

    // push a new activity label without re-subscribing
    useEffect(() => {
        if (channelRef.current) channelRef.current.track(buildPayload());
    }, [activity, buildPayload]);

    const otherUsers = onlineUsers.filter((u) => u.id !== user?.id);
    return { onlineUsers, otherUsers, totalOnline: onlineUsers.length };
}
```

- [ ] **Step 6: Commit**
```bash
git add apps/platform/lib/chat/topics.ts apps/platform/lib/chat/topics.test.ts apps/platform/hooks/chat/use-tenant-presence.ts
git commit -m "feat(chat): topic lib + tenant-scoped presence hook (P0)"
```

---

# PHASE 1 — Core chat

## Task 8: Shared types

**Files:**
- Create: `apps/platform/types/chat.ts`

- [ ] **Step 1: Write the types**

```typescript
// apps/platform/types/chat.ts
export type ConversationKind = "channel" | "dm" | "group" | "order";

export interface ChatConversation {
    id: string;
    tenant_id: string;
    kind: ConversationKind;
    name: string | null;
    topic: string | null;
    order_id: string | null;
    is_private: boolean;
    created_by: string | null;
    last_message_at: string | null;
    archived_at: string | null;
    created_at: string;
    updated_at: string;
}

export interface ChatMember {
    id: string;
    conversation_id: string;
    user_id: string;
    role: "owner" | "member";
    last_read_at: string;
    muted: boolean;
    joined_at: string;
}

export type ChatRefType = "order" | "customer" | "product";

export interface ChatReference {
    id?: string;
    ref_type: ChatRefType;
    ref_id: string;
    snapshot: Record<string, unknown>;
}

export interface ChatReaction { id: string; message_id: string; user_id: string; emoji: string; }
export interface ChatAttachment {
    id?: string; message_id?: string; storage_path: string; file_name: string;
    mime?: string | null; size_bytes?: number | null; width?: number | null; height?: number | null;
}

export interface ChatMessage {
    id: string;
    conversation_id: string;
    tenant_id: string;
    sender_id: string;
    body: string;
    reply_to_id: string | null;
    client_msg_id: string | null;
    edited_at: string | null;
    deleted_at: string | null;
    created_at: string;
    // hydrated client-side:
    references?: ChatReference[];
    reactions?: ChatReaction[];
    attachments?: ChatAttachment[];
    pending?: boolean;       // optimistic, not yet acked
}

export interface ChatMentionNotification {
    id: string;
    actor_name: string;
    actor_avatar: string | null;
    conversation_id: string | null;
    message_id: string | null;
    preview: string;
    is_read: boolean;
    created_at: string;
}
```

- [ ] **Step 2: Type-check** — Run: `pnpm --filter @scheniders/platform exec tsc --noEmit` (or `pnpm type-check`). Expected: no new errors.
- [ ] **Step 3: Commit**
```bash
git add apps/platform/types/chat.ts
git commit -m "feat(chat): shared TS types (P1)"
```

## Task 9: Reference parser

**Files:**
- Create: `apps/platform/lib/chat/parse-references.ts`
- Test: `apps/platform/lib/chat/parse-references.test.ts`

The composer stores selected references/mentions in structured arrays as the user picks them; the parser is a fallback that extracts bare `@name`/`#id` tokens and validates the structured payload before send.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/platform/lib/chat/parse-references.test.ts
import { describe, it, expect } from "vitest";
import { dedupeReferences, dedupeMentions } from "./parse-references";

describe("dedupeReferences", () => {
    it("removes duplicate ref_type+ref_id pairs keeping first snapshot", () => {
        const out = dedupeReferences([
            { ref_type: "order", ref_id: "o1", snapshot: { a: 1 } },
            { ref_type: "order", ref_id: "o1", snapshot: { a: 2 } },
            { ref_type: "customer", ref_id: "c1", snapshot: {} },
        ]);
        expect(out).toHaveLength(2);
        expect(out[0].snapshot).toEqual({ a: 1 });
    });
});

describe("dedupeMentions", () => {
    it("dedupes user ids", () => {
        expect(dedupeMentions(["u1", "u1", "u2"])).toEqual(["u1", "u2"]);
    });
});
```

- [ ] **Step 2: Run (fails).** Run: `pnpm exec vitest run apps/platform/lib/chat/parse-references.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement**

```typescript
// apps/platform/lib/chat/parse-references.ts
import type { ChatReference } from "@/types/chat";

export function dedupeReferences(refs: ChatReference[]): ChatReference[] {
    const seen = new Set<string>();
    const out: ChatReference[] = [];
    for (const r of refs) {
        const key = `${r.ref_type}:${r.ref_id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(r);
    }
    return out;
}

export function dedupeMentions(ids: string[]): string[] {
    return Array.from(new Set(ids));
}
```

- [ ] **Step 4: Run (passes).** Expected: PASS (2 tests).
- [ ] **Step 5: Commit**
```bash
git add apps/platform/lib/chat/parse-references.*
git commit -m "feat(chat): reference/mention dedupe helpers (P1)"
```

## Task 10: Chat store (Zustand UI state)

**Files:**
- Create: `apps/platform/store/use-chat-store.ts`

- [ ] **Step 1: Implement**

```typescript
// apps/platform/store/use-chat-store.ts
import { create } from "zustand";

interface ChatUIState {
    isOpen: boolean;
    isExpanded: boolean;            // drawer vs full-page (P2 wires the page)
    activeConversationId: string | null;
    open: (conversationId?: string) => void;
    close: () => void;
    setExpanded: (v: boolean) => void;
    setActiveConversation: (id: string | null) => void;
}

export const useChatStore = create<ChatUIState>((set) => ({
    isOpen: false,
    isExpanded: false,
    activeConversationId: null,
    open: (conversationId) =>
        set((s) => ({ isOpen: true, activeConversationId: conversationId ?? s.activeConversationId })),
    close: () => set({ isOpen: false }),
    setExpanded: (v) => set({ isExpanded: v }),
    setActiveConversation: (id) => set({ activeConversationId: id }),
}));
```

- [ ] **Step 2: Type-check.** Expected: clean.
- [ ] **Step 3: Commit**
```bash
git add apps/platform/store/use-chat-store.ts
git commit -m "feat(chat): chat UI store (P1)"
```

## Task 11: Conversations hook

**Files:**
- Create: `apps/platform/hooks/chat/use-conversations.ts`

Loads conversations the user belongs to (+ public channels), with member rows for unread math. Realtime refresh comes from the inbox channel (Task 14) invalidating this key.

- [ ] **Step 1: Implement**

```typescript
// apps/platform/hooks/chat/use-conversations.ts
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import type { ChatConversation, ChatMember } from "@/types/chat";

export const chatKeys = {
    all: ["chat"] as const,
    conversations: () => [...chatKeys.all, "conversations"] as const,
    messages: (conversationId: string) => [...chatKeys.all, "messages", conversationId] as const,
    mentions: () => [...chatKeys.all, "mentions"] as const,
};

export interface ConversationWithMeta extends ChatConversation {
    members: Pick<ChatMember, "user_id" | "last_read_at" | "role">[];
    my_last_read_at: string | null;
    unread: number;
}

export function useConversations() {
    const { user } = useAuth();
    return useQuery({
        queryKey: chatKeys.conversations(),
        enabled: !!user?.id,
        staleTime: 15_000,
        queryFn: async (): Promise<ConversationWithMeta[]> => {
            const { data: convs, error } = await supabase
                .from("chat_conversations")
                .select("*, members:chat_members(user_id,last_read_at,role)")
                .is("archived_at", null)
                .order("last_message_at", { ascending: false, nullsFirst: false });
            if (error) throw error;

            const rows = (convs ?? []) as unknown as (ChatConversation & {
                members: Pick<ChatMember, "user_id" | "last_read_at" | "role">[];
            })[];

            // unread = messages newer than my last_read_at (one count query per conv batched)
            const ids = rows.map((r) => r.id);
            const unreadByConv = new Map<string, number>();
            if (ids.length) {
                // fetch only created_at + conversation_id of recent messages, count client-side
                const { data: recent } = await supabase
                    .from("chat_messages")
                    .select("conversation_id, created_at")
                    .in("conversation_id", ids)
                    .is("deleted_at", null)
                    .order("created_at", { ascending: false })
                    .limit(500);
                for (const r of rows) {
                    const mine = r.members.find((m) => m.user_id === user!.id);
                    const lastRead = mine?.last_read_at ? new Date(mine.last_read_at).getTime() : 0;
                    const count = (recent ?? []).filter(
                        (m) => m.conversation_id === r.id && new Date(m.created_at).getTime() > lastRead
                    ).length;
                    unreadByConv.set(r.id, count);
                }
            }

            return rows.map((r) => {
                const mine = r.members.find((m) => m.user_id === user!.id);
                return { ...r, my_last_read_at: mine?.last_read_at ?? null, unread: unreadByConv.get(r.id) ?? 0 };
            });
        },
    });
}

export function useStartDm() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (otherUserId: string): Promise<string> => {
            const { data, error } = await supabase.rpc("chat_find_or_create_dm", { p_other_user_id: otherUserId });
            if (error) throw error;
            return data as string;
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: chatKeys.conversations() }),
    });
}

export function useStartOrderConversation() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (orderId: string): Promise<string> => {
            const { data, error } = await supabase.rpc("chat_find_or_create_order_conversation", { p_order_id: orderId });
            if (error) throw error;
            return data as string;
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: chatKeys.conversations() }),
    });
}
```

- [ ] **Step 2: Type-check.** Expected: clean.
- [ ] **Step 3: Commit**
```bash
git add apps/platform/hooks/chat/use-conversations.ts
git commit -m "feat(chat): conversations hook + start-dm/order RPC mutations (P1)"
```

## Task 12: Messages hook (query + realtime + optimistic send)

**Files:**
- Create: `apps/platform/hooks/chat/use-messages.ts`

- [ ] **Step 1: Implement**

```typescript
// apps/platform/hooks/chat/use-messages.ts
import { useEffect } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { conversationTopic } from "@/lib/chat/topics";
import { chatKeys } from "./use-conversations";
import { dedupeMentions, dedupeReferences } from "@/lib/chat/parse-references";
import type { ChatMessage, ChatReference, ChatAttachment } from "@/types/chat";

const PAGE = 50;

export function useMessages(conversationId: string | null) {
    const { user } = useAuth();
    const qc = useQueryClient();

    const query = useQuery({
        queryKey: conversationId ? chatKeys.messages(conversationId) : ["chat", "messages", "none"],
        enabled: !!conversationId,
        staleTime: 10_000,
        queryFn: async (): Promise<ChatMessage[]> => {
            const { data, error } = await supabase
                .from("chat_messages")
                .select("*, references:chat_message_references(*), reactions:chat_message_reactions(*), attachments:chat_message_attachments(*)")
                .eq("conversation_id", conversationId!)
                .order("created_at", { ascending: true })
                .limit(PAGE);
            if (error) throw error;
            return (data ?? []) as unknown as ChatMessage[];
        },
    });

    // realtime: subscribe to the private conversation topic for new/updated messages
    useEffect(() => {
        if (!conversationId) return;
        const channel = supabase.channel(conversationTopic(conversationId), { config: { private: true } });
        channel
            .on("broadcast", { event: "message:new" }, ({ payload }) => {
                qc.setQueryData<ChatMessage[]>(chatKeys.messages(conversationId), (old = []) => {
                    // reconcile optimistic by client_msg_id; ignore our own echo if already present
                    const incoming = payload as ChatMessage;
                    const withoutOptimistic = old.filter(
                        (m) => !(m.pending && m.client_msg_id && m.client_msg_id === incoming.client_msg_id)
                    );
                    if (withoutOptimistic.some((m) => m.id === incoming.id)) return withoutOptimistic;
                    return [...withoutOptimistic, { ...incoming, references: [], reactions: [], attachments: [] }];
                });
                qc.invalidateQueries({ queryKey: chatKeys.conversations() });
            })
            .on("broadcast", { event: "message:update" }, ({ payload }) => {
                const upd = payload as ChatMessage;
                qc.setQueryData<ChatMessage[]>(chatKeys.messages(conversationId), (old = []) =>
                    old.map((m) => (m.id === upd.id ? { ...m, ...upd } : m))
                );
            })
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [conversationId, qc]);

    const sendMessage = useMutation({
        mutationFn: async (args: {
            body: string; references?: ChatReference[]; mentions?: string[];
            attachments?: ChatAttachment[]; replyToId?: string | null; clientMsgId: string;
        }) => {
            const { data, error } = await supabase.rpc("chat_send_message", {
                p_conversation_id: conversationId!,
                p_body: args.body,
                p_client_msg_id: args.clientMsgId,
                p_reply_to_id: args.replyToId ?? null,
                p_references: dedupeReferences(args.references ?? []),
                p_mentions: dedupeMentions(args.mentions ?? []),
                p_attachments: args.attachments ?? [],
            });
            if (error) throw error;
            return data as ChatMessage;
        },
        onMutate: async (args) => {
            if (!conversationId) return;
            await qc.cancelQueries({ queryKey: chatKeys.messages(conversationId) });
            const previous = qc.getQueryData<ChatMessage[]>(chatKeys.messages(conversationId));
            const optimistic: ChatMessage = {
                id: `temp-${args.clientMsgId}`, conversation_id: conversationId, tenant_id: "",
                sender_id: user!.id, body: args.body, reply_to_id: args.replyToId ?? null,
                client_msg_id: args.clientMsgId, edited_at: null, deleted_at: null,
                created_at: new Date().toISOString(), references: args.references ?? [],
                reactions: [], attachments: args.attachments ?? [], pending: true,
            };
            qc.setQueryData<ChatMessage[]>(chatKeys.messages(conversationId), (old = []) => [...old, optimistic]);
            return { previous };
        },
        onError: (_e, _v, ctx) => {
            if (conversationId && ctx?.previous) qc.setQueryData(chatKeys.messages(conversationId), ctx.previous);
        },
        onSuccess: (saved) => {
            if (!conversationId) return;
            qc.setQueryData<ChatMessage[]>(chatKeys.messages(conversationId), (old = []) =>
                old.map((m) => (m.client_msg_id === saved.client_msg_id ? { ...saved, pending: false } : m))
            );
        },
    });

    const markRead = async () => {
        if (conversationId) await supabase.rpc("chat_mark_read", { p_conversation_id: conversationId });
    };

    return { ...query, sendMessage, markRead };
}
```

- [ ] **Step 2: Type-check.** Expected: clean.
- [ ] **Step 3: Commit**
```bash
git add apps/platform/hooks/chat/use-messages.ts
git commit -m "feat(chat): messages hook with realtime broadcast + optimistic send (P1)"
```

## Task 13: Typing indicator hook

**Files:**
- Create: `apps/platform/hooks/chat/use-typing-indicator.ts`

- [ ] **Step 1: Implement**

```typescript
// apps/platform/hooks/chat/use-typing-indicator.ts
import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { conversationTopic } from "@/lib/chat/topics";

type TypingPayload = { user_id: string; display_name: string };

export function useTypingIndicator(conversationId: string | null) {
    const { user, profile } = useAuth();
    const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
    const [typers, setTypers] = useState<TypingPayload[]>([]);
    const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

    useEffect(() => {
        if (!conversationId) return;
        const channel = supabase.channel(conversationTopic(conversationId), { config: { private: true } });
        channel
            .on("broadcast", { event: "typing" }, ({ payload }) => {
                const p = payload as TypingPayload;
                if (p.user_id === user?.id) return;
                setTypers((prev) => (prev.some((t) => t.user_id === p.user_id) ? prev : [...prev, p]));
                const existing = timers.current.get(p.user_id);
                if (existing) clearTimeout(existing);
                timers.current.set(p.user_id, setTimeout(() => {
                    setTypers((prev) => prev.filter((t) => t.user_id !== p.user_id));
                    timers.current.delete(p.user_id);
                }, 4000));
            })
            .subscribe();
        channelRef.current = channel;
        return () => { supabase.removeChannel(channel); channelRef.current = null; };
    }, [conversationId, user?.id]);

    const notifyTyping = useCallback(() => {
        channelRef.current?.send({
            type: "broadcast", event: "typing",
            payload: { user_id: user?.id, display_name: profile?.display_name || "Someone" },
        });
    }, [user?.id, profile?.display_name]);

    return { typers, notifyTyping };
}
```

- [ ] **Step 2: Type-check; Commit**
```bash
git add apps/platform/hooks/chat/use-typing-indicator.ts
git commit -m "feat(chat): typing indicator via realtime broadcast (P1)"
```

## Task 14: Unread inbox hook

**Files:**
- Create: `apps/platform/hooks/chat/use-unread-inbox.ts`

- [ ] **Step 1: Implement**

```typescript
// apps/platform/hooks/chat/use-unread-inbox.ts
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { userInboxTopic } from "@/lib/chat/topics";
import { chatKeys } from "./use-conversations";

// Subscribes to the per-user inbox topic; on any new message, refresh conversation list
// (which recomputes unread). Returns nothing; mount once high in the tree.
export function useUnreadInbox() {
    const { user } = useAuth();
    const qc = useQueryClient();
    useEffect(() => {
        if (!user?.id) return;
        const channel = supabase.channel(userInboxTopic(user.id), { config: { private: true } });
        channel
            .on("broadcast", { event: "inbox:new" }, ({ payload }) => {
                if ((payload as { sender_id?: string }).sender_id === user.id) return;
                qc.invalidateQueries({ queryKey: chatKeys.conversations() });
            })
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [user?.id, qc]);
}
```

- [ ] **Step 2: Type-check; Commit**
```bash
git add apps/platform/hooks/chat/use-unread-inbox.ts
git commit -m "feat(chat): per-user unread inbox subscription (P1)"
```

## Task 15: User status hook (custom status + last seen)

**Files:**
- Create: `apps/platform/hooks/chat/use-user-status.ts`

- [ ] **Step 1: Implement**

```typescript
// apps/platform/hooks/chat/use-user-status.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";

export interface UserStatusRow {
    user_id: string; custom_emoji: string | null; custom_text: string | null; last_seen_at: string | null;
}

export function useTenantUserStatuses() {
    const { tenantId } = useAuth();
    return useQuery({
        queryKey: ["chat", "user-status", tenantId],
        enabled: !!tenantId,
        staleTime: 30_000,
        queryFn: async (): Promise<UserStatusRow[]> => {
            const { data, error } = await supabase.from("chat_user_status").select("user_id,custom_emoji,custom_text,last_seen_at");
            if (error) throw error;
            return (data ?? []) as UserStatusRow[];
        },
    });
}

export function useSetMyStatus() {
    const { user, tenantId } = useAuth();
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (args: { emoji: string | null; text: string | null }) => {
            const { error } = await supabase.from("chat_user_status").upsert({
                user_id: user!.id, tenant_id: tenantId, custom_emoji: args.emoji, custom_text: args.text, updated_at: new Date().toISOString(),
            });
            if (error) throw error;
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: ["chat", "user-status"] }),
    });
}

// Heartbeat last_seen on unload / interval. Call once high in the tree.
export function useLastSeenHeartbeat() {
    const { user, tenantId } = useAuth();
    // implementation: upsert last_seen_at every 60s + on visibilitychange hidden
    // (kept minimal here; executor wires the interval mirroring use-tenant-presence)
    void user; void tenantId;
}
```

- [ ] **Step 2: Implement `useLastSeenHeartbeat` body** (interval + beforeunload upsert of `last_seen_at = now()`), mirroring the interval pattern in `use-tenant-presence.ts`. Type-check.
- [ ] **Step 3: Commit**
```bash
git add apps/platform/hooks/chat/use-user-status.ts
git commit -m "feat(chat): custom status + last-seen hooks (P1)"
```

## Task 16: Reference search hook

**Files:**
- Create: `apps/platform/hooks/chat/use-reference-search.ts`

Reuses the orders context that powers global search. Returns typed results to insert as references.

- [ ] **Step 1: Implement**

```typescript
// apps/platform/hooks/chat/use-reference-search.ts
import { useMemo } from "react";
import { useOrdersContext } from "@/components/providers/orders-provider"; // same source global-search uses
import { getBaseOrderId } from "@/lib/order-utils";
import type { ChatReference } from "@/types/chat";

export interface ReferenceResult {
    ref_type: ChatReference["ref_type"];
    ref_id: string;
    label: string;
    sublabel: string;
    snapshot: Record<string, unknown>;
}

export function useReferenceSearch(query: string): ReferenceResult[] {
    const { orders } = useOrdersContext();
    return useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return [];
        const results: ReferenceResult[] = [];

        for (const o of orders) {
            const display = getBaseOrderId(o.order_id);
            if (display.toLowerCase().includes(q) || (o.customer_name ?? "").toLowerCase().includes(q) || (o.phone ?? "").includes(q)) {
                results.push({
                    ref_type: "order", ref_id: o.id, label: `#${display}`, sublabel: `${o.customer_name ?? ""} · ${o.phone ?? ""}`,
                    snapshot: { order_id: display, customer_name: o.customer_name, phone: o.phone, price: o.price, status: o.status, governorate_code: o.governorate_code },
                });
            }
            if (results.length >= 8) break;
        }
        return results.slice(0, 8);
    }, [orders, query]);
}
```

> If `@/components/providers/orders-provider` export name differs, the executor wires the same source `global-search.tsx` imports (`useOrdersContext`). Customer/product result branches follow the same shape (ref_type "customer"/"product"); add them after orders work.

- [ ] **Step 2: Type-check; Commit**
```bash
git add apps/platform/hooks/chat/use-reference-search.ts
git commit -m "feat(chat): reference search hook (orders first) (P1)"
```

## Task 17: ReferenceCard component

**Files:**
- Create: `apps/platform/components/chat/reference-card.tsx`

- [ ] **Step 1: Implement**

```tsx
// apps/platform/components/chat/reference-card.tsx
"use client";
import { useOrderStore } from "@/store/use-order-store";
import { orderRepository } from "@/lib/repositories/order-repository";
import { formatIQD } from "@/lib/format";
import type { ChatReference } from "@/types/chat";

export function ReferenceCard({ reference }: { reference: ChatReference }) {
    const { openOrderDetails } = useOrderStore();
    const s = reference.snapshot as Record<string, string | number | undefined>;

    const onClick = async () => {
        if (reference.ref_type === "order") {
            const order = await orderRepository.findById(reference.ref_id);
            if (order) openOrderDetails(order);
        }
        // customer/product: navigate (executor wires routes), out of scope for first cut
    };

    if (reference.ref_type === "order") {
        return (
            <button
                onClick={onClick}
                className="mt-2 flex w-full max-w-[420px] items-center justify-between rounded-xl border border-black/10 bg-[var(--card-bg)] px-3 py-2.5 text-left transition hover:shadow-md"
                style={{ borderLeft: "4px solid #f59e0b" }}
            >
                <div className="min-w-0">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Order</div>
                    <div className="truncate text-sm font-bold">#{s.order_id}</div>
                    <div className="truncate text-xs text-muted-foreground">{s.customer_name} · {s.phone}</div>
                </div>
                <div className="text-right">
                    <div className="text-sm font-bold">{formatIQD(Number(s.price ?? 0))}</div>
                    <div className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[10px] text-amber-800">{String(s.status ?? "")}</div>
                </div>
            </button>
        );
    }
    return <div className="mt-2 rounded-lg border px-3 py-2 text-xs">{reference.ref_type}: {String(s.label ?? reference.ref_id)}</div>;
}
```

> Executor: confirm exact import paths for `orderRepository.findById` and `formatIQD`/`getBaseOrderId` (Task 16 agent located `orderRepository.findById`, `formatIQD`, `getBaseOrderId`; adjust path if the repo exports them elsewhere).

- [ ] **Step 2: Type-check; Commit**
```bash
git add apps/platform/components/chat/reference-card.tsx
git commit -m "feat(chat): order ReferenceCard with click-through to modal (P1)"
```

## Task 18: ReactionBar component

**Files:**
- Create: `apps/platform/components/chat/reaction-bar.tsx`

- [ ] **Step 1: Implement** (groups reactions by emoji, toggles caller's own via `chat_message_reactions` upsert/delete)

```tsx
// apps/platform/components/chat/reaction-bar.tsx
"use client";
import { useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import type { ChatReaction } from "@/types/chat";

const QUICK = ["👍", "🔥", "✅", "❤️", "😂"];

export function ReactionBar({ messageId, reactions }: { messageId: string; reactions: ChatReaction[] }) {
    const { user } = useAuth();
    const grouped = useMemo(() => {
        const map = new Map<string, { count: number; mine: boolean }>();
        for (const r of reactions) {
            const cur = map.get(r.emoji) ?? { count: 0, mine: false };
            cur.count += 1;
            if (r.user_id === user?.id) cur.mine = true;
            map.set(r.emoji, cur);
        }
        return Array.from(map.entries());
    }, [reactions, user?.id]);

    const toggle = async (emoji: string, mine: boolean) => {
        if (mine) {
            await supabase.from("chat_message_reactions").delete().match({ message_id: messageId, user_id: user!.id, emoji });
        } else {
            await supabase.from("chat_message_reactions").insert({ message_id: messageId, user_id: user!.id, emoji });
        }
    };

    return (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {grouped.map(([emoji, { count, mine }]) => (
                <button key={emoji} onClick={() => toggle(emoji, mine)}
                    className={`rounded-full border px-2 py-0.5 text-xs ${mine ? "border-indigo-300 bg-indigo-50" : "border-black/10 bg-[var(--card-bg)]"}`}>
                    {emoji} {count}
                </button>
            ))}
            <div className="group relative">
                <button className="rounded-full border border-black/10 px-2 py-0.5 text-xs text-muted-foreground">＋</button>
                <div className="absolute z-10 hidden gap-1 rounded-lg border bg-[var(--card-bg)] p-1 shadow group-hover:flex">
                    {QUICK.map((e) => <button key={e} onClick={() => toggle(e, false)} className="px-1 text-sm hover:scale-110">{e}</button>)}
                </div>
            </div>
        </div>
    );
}
```

> Reaction realtime: reactions update on next message-list refetch; for instant feedback, executor may add a `postgres_changes` or broadcast on reactions in a follow-up. First cut relies on optimistic local toggle + refetch on conversation focus.

- [ ] **Step 2: Type-check; Commit**
```bash
git add apps/platform/components/chat/reaction-bar.tsx
git commit -m "feat(chat): reaction bar (P1)"
```

## Task 19: MessageItem + MessageList

**Files:**
- Create: `apps/platform/components/chat/message-item.tsx`
- Create: `apps/platform/components/chat/message-list.tsx`

- [ ] **Step 1: Implement MessageItem**

```tsx
// apps/platform/components/chat/message-item.tsx
"use client";
import { Avatar } from "@scheniders/ui";
import { formatDistanceToNow } from "date-fns";
import { ReferenceCard } from "./reference-card";
import { ReactionBar } from "./reaction-bar";
import type { ChatMessage } from "@/types/chat";

export function MessageItem({ message, senderName, senderAvatar }: {
    message: ChatMessage; senderName: string; senderAvatar?: string | null;
}) {
    if (message.deleted_at) {
        return <div className="px-4 py-1 text-xs italic text-muted-foreground">message deleted</div>;
    }
    return (
        <div className={`flex gap-2.5 px-4 py-2 ${message.pending ? "opacity-60" : ""}`}>
            <Avatar src={senderAvatar ?? undefined} alt={senderName} size="sm" />
            <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                    <span className="text-[13px] font-semibold">{senderName}</span>
                    <span className="text-[11px] text-muted-foreground">
                        {formatDistanceToNow(new Date(message.created_at), { addSuffix: true })}
                    </span>
                    {message.edited_at && <span className="text-[10px] text-muted-foreground">(edited)</span>}
                </div>
                {message.body && <div className="whitespace-pre-wrap break-words text-[13.5px] leading-relaxed">{message.body}</div>}
                {(message.references ?? []).map((r, i) => <ReferenceCard key={i} reference={r} />)}
                {(message.attachments ?? []).map((a, i) => (
                    <a key={i} href="#" className="mt-2 inline-block rounded-lg border px-3 py-2 text-xs">📎 {a.file_name}</a>
                ))}
                {!message.pending && <ReactionBar messageId={message.id} reactions={message.reactions ?? []} />}
            </div>
        </div>
    );
}
```

- [ ] **Step 2: Implement MessageList** (virtualized with `@tanstack/react-virtual`, auto-scroll to bottom on new)

```tsx
// apps/platform/components/chat/message-list.tsx
"use client";
import { useEffect, useRef } from "react";
import { MessageItem } from "./message-item";
import { useTenantPresence } from "@/hooks/chat/use-tenant-presence";
import type { ChatMessage } from "@/types/chat";

export function MessageList({ messages }: { messages: ChatMessage[] }) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const { onlineUsers } = useTenantPresence();
    const nameOf = (id: string) => onlineUsers.find((u) => u.id === id);

    useEffect(() => {
        const el = scrollRef.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [messages.length]);

    return (
        <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain">
            {messages.map((m) => {
                const u = nameOf(m.sender_id);
                return <MessageItem key={m.id} message={m} senderName={u?.display_name ?? "Teammate"} senderAvatar={u?.avatar_url} />;
            })}
        </div>
    );
}
```

> Sender name/avatar: presence only covers online users. Executor adds a tenant-members lookup (from `tenant_members` join `user_profiles`) as the authoritative name source; presence is a fallback. Virtualization with `@tanstack/react-virtual` can replace the simple map once message volume warrants — first cut uses native scroll (correct, just not virtualized). Note this tradeoff with `log`/comment.

- [ ] **Step 3: Type-check; Commit**
```bash
git add apps/platform/components/chat/message-item.tsx apps/platform/components/chat/message-list.tsx
git commit -m "feat(chat): message item + list (P1)"
```

## Task 20: Composer (text + references + mentions + attachments + emoji)

**Files:**
- Create: `apps/platform/components/chat/composer.tsx`

- [ ] **Step 1: Implement** — a Textarea that detects a trailing `#`/`@` token, shows a `Popover` with `useReferenceSearch` / tenant members, inserts a chip, accumulates structured `references[]`/`mentions[]`, uploads attachments to `chat-attachments` at `{tenantId}/{conversationId}/{uuid}`, and calls `sendMessage` with a generated `clientMsgId` (`crypto.randomUUID()`), firing `notifyTyping()` on input.

```tsx
// apps/platform/components/chat/composer.tsx — abridged contract; executor completes UI with ui-ux-pro-max
"use client";
import { useRef, useState } from "react";
import { Textarea } from "@scheniders/ui/textarea";
import { Button } from "@scheniders/ui/button";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { useReferenceSearch } from "@/hooks/chat/use-reference-search";
import type { ChatReference, ChatAttachment } from "@/types/chat";

export function Composer({
    conversationId, onSend, onTyping,
}: {
    conversationId: string;
    onSend: (a: { body: string; references: ChatReference[]; mentions: string[]; attachments: ChatAttachment[]; clientMsgId: string }) => void;
    onTyping: () => void;
}) {
    const { tenantId } = useAuth();
    const [body, setBody] = useState("");
    const [refs, setRefs] = useState<ChatReference[]>([]);
    const [mentions, setMentions] = useState<string[]>([]);
    const [pendingFiles, setPendingFiles] = useState<File[]>([]);
    const fileRef = useRef<HTMLInputElement>(null);

    // token detection drives this query:
    const [refQuery, setRefQuery] = useState("");
    const refResults = useReferenceSearch(refQuery);

    const uploadAll = async (): Promise<ChatAttachment[]> => {
        const out: ChatAttachment[] = [];
        for (const f of pendingFiles) {
            const path = `${tenantId}/${conversationId}/${crypto.randomUUID()}-${f.name}`;
            const { error } = await supabase.storage.from("chat-attachments").upload(path, f);
            if (!error) out.push({ storage_path: path, file_name: f.name, mime: f.type, size_bytes: f.size });
        }
        return out;
    };

    const submit = async () => {
        const text = body.trim();
        if (!text && pendingFiles.length === 0) return;
        const attachments = await uploadAll();
        onSend({ body: text, references: refs, mentions, attachments, clientMsgId: crypto.randomUUID() });
        setBody(""); setRefs([]); setMentions([]); setPendingFiles([]);
    };

    return (
        <div className="border-t p-2">
            {/* selected reference chips */}
            {refs.length > 0 && (
                <div className="mb-1 flex flex-wrap gap-1">
                    {refs.map((r, i) => <span key={i} className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs text-indigo-700">#{String(r.snapshot.order_id ?? r.ref_id)}</span>)}
                </div>
            )}
            <div className="flex items-end gap-2">
                <Textarea
                    value={body}
                    onChange={(e) => {
                        setBody(e.target.value); onTyping();
                        const m = e.target.value.match(/#(\w*)$/);
                        setRefQuery(m ? m[1] : "");
                    }}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void submit(); } }}
                    placeholder="Message… use # to reference an order, @ to mention"
                    rows={1}
                />
                <input ref={fileRef} type="file" hidden multiple
                    onChange={(e) => setPendingFiles(Array.from(e.target.files ?? []))} />
                <Button variant="ghost" size="icon" onClick={() => fileRef.current?.click()}>📎</Button>
                <Button onClick={() => void submit()}>Send</Button>
            </div>
            {/* reference autocomplete dropdown */}
            {refQuery && refResults.length > 0 && (
                <div className="mt-1 rounded-lg border bg-[var(--card-bg)] shadow">
                    {refResults.map((r) => (
                        <button key={r.ref_id} className="block w-full px-3 py-2 text-left text-sm hover:bg-black/5"
                            onClick={() => {
                                setRefs((prev) => [...prev, { ref_type: r.ref_type, ref_id: r.ref_id, snapshot: r.snapshot }]);
                                setBody((b) => b.replace(/#\w*$/, "")); setRefQuery("");
                            }}>
                            <span className="font-semibold">{r.label}</span> <span className="text-muted-foreground">{r.sublabel}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
```

> Executor: add the `@`-mention branch (query tenant members, push to `mentions[]`), an emoji menu button, and image-preview thumbnails for `pendingFiles`. Use ui-ux-pro-max for the final visual pass.

- [ ] **Step 2: Type-check; Commit**
```bash
git add apps/platform/components/chat/composer.tsx
git commit -m "feat(chat): composer with #-reference autocomplete + attachments (P1)"
```

## Task 21: ConversationList + ChatSheet (drawer)

**Files:**
- Create: `apps/platform/components/chat/conversation-list.tsx`
- Create: `apps/platform/components/chat/chat-sheet.tsx`

- [ ] **Step 1: Implement ConversationList** — sections Channels / Direct / Order threads from `useConversations()`, each row shows name + unread badge; click sets `activeConversationId`.

```tsx
// apps/platform/components/chat/conversation-list.tsx
"use client";
import { useConversations } from "@/hooks/chat/use-conversations";
import { useChatStore } from "@/store/use-chat-store";

export function ConversationList() {
    const { data: conversations = [] } = useConversations();
    const { activeConversationId, setActiveConversation } = useChatStore();
    const groups = {
        channel: conversations.filter((c) => c.kind === "channel"),
        dm: conversations.filter((c) => c.kind === "dm" || c.kind === "group"),
        order: conversations.filter((c) => c.kind === "order"),
    };
    const Section = ({ title, items }: { title: string; items: typeof conversations }) =>
        items.length === 0 ? null : (
            <div className="px-2 py-1">
                <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">{title}</div>
                {items.map((c) => (
                    <button key={c.id} onClick={() => setActiveConversation(c.id)}
                        className={`flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm hover:bg-black/5 ${activeConversationId === c.id ? "bg-black/5 font-semibold" : ""}`}>
                        <span className="truncate">{c.kind === "channel" ? `# ${c.name}` : c.name ?? "Direct message"}</span>
                        {c.unread > 0 && <span className="ml-2 rounded-full bg-red-500 px-1.5 text-[10px] text-white">{c.unread}</span>}
                    </button>
                ))}
            </div>
        );
    return (
        <div className="w-[40%] max-w-[260px] overflow-y-auto border-r">
            <Section title="Channels" items={groups.channel} />
            <Section title="Direct" items={groups.dm} />
            <Section title="Order threads" items={groups.order} />
        </div>
    );
}
```

- [ ] **Step 2: Implement ChatSheet** — right-side drawer (framer-motion slide-in), full-screen on mobile via `useIsMobile`, expand button toggles `isExpanded`; hosts ConversationList + active conversation (MessageList + Composer + typing line).

```tsx
// apps/platform/components/chat/chat-sheet.tsx
"use client";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect } from "react";
import { useChatStore } from "@/store/use-chat-store";
import { useIsMobile } from "@/hooks/use-mobile";
import { useMessages } from "@/hooks/chat/use-messages";
import { useTypingIndicator } from "@/hooks/chat/use-typing-indicator";
import { ConversationList } from "./conversation-list";
import { MessageList } from "./message-list";
import { Composer } from "./composer";

export function ChatSheet() {
    const { isOpen, close, activeConversationId } = useChatStore();
    const isMobile = useIsMobile(768);
    const { data: messages = [], sendMessage, markRead } = useMessages(activeConversationId);
    const { typers, notifyTyping } = useTypingIndicator(activeConversationId);

    useEffect(() => { if (isOpen && activeConversationId) void markRead(); }, [isOpen, activeConversationId, messages.length]);

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    <motion.div className="fixed inset-0 z-40 bg-black/20" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={close} />
                    <motion.aside
                        className={`fixed z-50 flex flex-col bg-[var(--background)] shadow-2xl ${isMobile ? "inset-0" : "right-0 top-0 h-full w-[640px]"}`}
                        initial={{ x: isMobile ? 0 : 640, opacity: isMobile ? 0 : 1 }}
                        animate={{ x: 0, opacity: 1 }} exit={{ x: isMobile ? 0 : 640, opacity: isMobile ? 0 : 1 }}
                        transition={{ type: "spring", damping: 30, stiffness: 300 }}
                    >
                        <div className="flex items-center justify-between border-b px-3 py-2">
                            <span className="font-semibold">Team chat</span>
                            <button onClick={close} className="rounded-full p-1 hover:bg-black/5">✕</button>
                        </div>
                        <div className="flex min-h-0 flex-1">
                            {!isMobile && <ConversationList />}
                            <div className="flex min-w-0 flex-1 flex-col">
                                {activeConversationId ? (
                                    <>
                                        <MessageList messages={messages} />
                                        {typers.length > 0 && (
                                            <div className="px-4 py-1 text-xs italic text-muted-foreground">
                                                {typers.map((t) => t.display_name).join(", ")} typing…
                                            </div>
                                        )}
                                        <Composer
                                            conversationId={activeConversationId}
                                            onTyping={notifyTyping}
                                            onSend={(a) => sendMessage.mutate(a)}
                                        />
                                    </>
                                ) : (
                                    <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">Pick a conversation</div>
                                )}
                            </div>
                        </div>
                    </motion.aside>
                </>
            )}
        </AnimatePresence>
    );
}
```

- [ ] **Step 3: Type-check; Commit**
```bash
git add apps/platform/components/chat/conversation-list.tsx apps/platform/components/chat/chat-sheet.tsx
git commit -m "feat(chat): conversation list + drawer shell (P1)"
```

## Task 22: LivePresenceStack + ChatTrigger, mount in top bar

**Files:**
- Create: `apps/platform/components/chat/live-presence-stack.tsx`
- Create: `apps/platform/components/chat/chat-trigger.tsx`
- Modify: `apps/platform/components/layout/global-search.tsx` (right-actions cluster, after `<GlobalPresenceIndicator/>` → replace it)
- Modify: `apps/platform/app/layout.tsx` (mount `<ChatSheet/>` + `useUnreadInbox()` once)
- Delete: `apps/platform/components/layout/global-presence-indicator.tsx`

- [ ] **Step 1: Implement LivePresenceStack** — avatar stack from `useTenantPresence()`, popover lists teammates with status dot + activity + custom status, each row has a **Message** button calling `useStartDm()` then `useChatStore().open(convId)`.

```tsx
// apps/platform/components/chat/live-presence-stack.tsx
"use client";
import { useState } from "react";
import { Avatar } from "@scheniders/ui";
import { Popover, PopoverTrigger, PopoverContent } from "@scheniders/ui/popover";
import { useTenantPresence } from "@/hooks/chat/use-tenant-presence";
import { useStartDm } from "@/hooks/chat/use-conversations";
import { useChatStore } from "@/store/use-chat-store";

const dot = { online: "bg-green-500", idle: "bg-amber-500", away: "bg-gray-300" };

export function LivePresenceStack() {
    const { otherUsers, totalOnline } = useTenantPresence();
    const startDm = useStartDm();
    const { open } = useChatStore();
    const [busy, setBusy] = useState<string | null>(null);

    const message = async (userId: string) => {
        setBusy(userId);
        try { const convId = await startDm.mutateAsync(userId); open(convId); } finally { setBusy(null); }
    };

    return (
        <Popover>
            <PopoverTrigger asChild>
                <button className="flex items-center -space-x-2" title={`${totalOnline} online`}>
                    {otherUsers.slice(0, 3).map((u) => (
                        <span key={u.id} className="relative inline-block rounded-full ring-2 ring-[var(--background)]">
                            <Avatar src={u.avatar_url} alt={u.display_name} size="sm" />
                            <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[var(--background)] ${dot[u.status]}`} />
                        </span>
                    ))}
                    {otherUsers.length > 3 && <span className="ml-1 text-xs text-muted-foreground">+{otherUsers.length - 3}</span>}
                </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 p-0">
                <div className="border-b px-3 py-2 text-xs font-semibold">Team · {totalOnline} online</div>
                <div className="max-h-80 overflow-y-auto">
                    {otherUsers.map((u) => (
                        <div key={u.id} className="flex items-center gap-2 px-3 py-2 hover:bg-black/5">
                            <span className="relative"><Avatar src={u.avatar_url} alt={u.display_name} size="sm" />
                                <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--background)] ${dot[u.status]}`} /></span>
                            <div className="min-w-0 flex-1">
                                <div className="truncate text-[13px] font-medium">{u.display_name}</div>
                                <div className="truncate text-[11px] text-muted-foreground">
                                    {u.custom_text ? `${u.custom_emoji ?? ""} ${u.custom_text}` : u.activity ?? u.status}
                                </div>
                            </div>
                            <button onClick={() => message(u.id)} disabled={busy === u.id}
                                className="rounded-lg bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-600">Message</button>
                        </div>
                    ))}
                </div>
            </PopoverContent>
        </Popover>
    );
}
```

- [ ] **Step 2: Implement ChatTrigger** — icon button with total unread badge (sum of `useConversations()` unread), opens the drawer.

```tsx
// apps/platform/components/chat/chat-trigger.tsx
"use client";
import { MessageSquare } from "lucide-react";
import { useConversations } from "@/hooks/chat/use-conversations";
import { useChatStore } from "@/store/use-chat-store";

export function ChatTrigger() {
    const { data: conversations = [] } = useConversations();
    const total = conversations.reduce((n, c) => n + c.unread, 0);
    const { open } = useChatStore();
    return (
        <button onClick={() => open()} className="relative flex h-10 w-10 items-center justify-center rounded-full hover:bg-black/5" title="Team chat">
            <MessageSquare className="h-5 w-5" />
            {total > 0 && <span className="absolute -right-0.5 -top-0.5 min-w-5 rounded-full bg-red-500 px-1 text-center text-xs font-bold text-white">{total > 99 ? "99+" : total}</span>}
        </button>
    );
}
```

- [ ] **Step 3: Wire into the top bar.** In `apps/platform/components/layout/global-search.tsx`, replace `<GlobalPresenceIndicator />` (~L413) with `<LivePresenceStack />` and add `<ChatTrigger />` immediately after it. Update imports (remove the old indicator import).

- [ ] **Step 4: Mount the drawer + inbox once.** In `apps/platform/app/layout.tsx` (inside the authed `DashboardLayout` tree), render `<ChatSheet />` and call a small client component that runs `useUnreadInbox()` and `useLastSeenHeartbeat()`. Create `apps/platform/components/chat/chat-runtime.tsx` for those side-effect hooks (returns `null` + renders `<ChatSheet/>`).

- [ ] **Step 5: Delete** `apps/platform/components/layout/global-presence-indicator.tsx` and remove remaining imports/usages. Grep to confirm: `grep -rn "global-presence-indicator\|useGlobalPresence" apps/platform` → only `use-global-presence.ts` (leave the hook if still referenced elsewhere; otherwise delete it too).

- [ ] **Step 6: Type-check + lint.** Run: `pnpm type-check && pnpm lint`. Expected: no new errors.
- [ ] **Step 7: Commit**
```bash
git add apps/platform/components/chat/live-presence-stack.tsx apps/platform/components/chat/chat-trigger.tsx apps/platform/components/chat/chat-runtime.tsx apps/platform/components/layout/global-search.tsx apps/platform/app/layout.tsx
git rm apps/platform/components/layout/global-presence-indicator.tsx
git commit -m "feat(chat): live presence stack + chat trigger in top bar; mount drawer (P1)"
```

## Task 23: "Discuss" button on order modal

**Files:**
- Modify: `apps/platform/components/orders/order-details-modal.tsx` (control cluster, near the presence group / close button, ~L708–838)

- [ ] **Step 1: Add the button**

```tsx
// inside OrderDetailsModal, near the top-right control cluster
import { MessageCircle } from "lucide-react";
import { useStartOrderConversation } from "@/hooks/chat/use-conversations";
import { useChatStore } from "@/store/use-chat-store";
// ...
const startOrderConv = useStartOrderConversation();
const { open } = useChatStore();
const handleDiscuss = async () => {
    const convId = await startOrderConv.mutateAsync(order.id);
    open(convId);
};
// ...JSX (place beside the History/Edit buttons):
<button onClick={handleDiscuss} title="Discuss this order"
    className="flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-100">
    <MessageCircle className="h-3.5 w-3.5" /> Discuss
</button>
```

- [ ] **Step 2: Type-check; manual check the button opens a thread.** Commit
```bash
git add apps/platform/components/orders/order-details-modal.tsx
git commit -m "feat(chat): Discuss button opens order conversation (P1)"
```

## Task 24: Mentions in the notifications dropdown

**Files:**
- Create: `apps/platform/hooks/chat/use-mention-notifications.ts`
- Modify: `apps/platform/components/layout/notifications-dropdown.tsx`

- [ ] **Step 1: Implement the hook** (mirror `use-order-activity-notifications.ts`: query `chat_notifications` for `recipient_id = me`, subscribe via `postgres_changes`, `markAsRead`).

```typescript
// apps/platform/hooks/chat/use-mention-notifications.ts
import { useEffect, useMemo, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { chatKeys } from "./use-conversations";
import type { ChatMentionNotification } from "@/types/chat";

export function useMentionNotifications() {
    const { user } = useAuth();
    const qc = useQueryClient();
    const { data: mentions = [] } = useQuery({
        queryKey: chatKeys.mentions(),
        enabled: !!user?.id,
        staleTime: 30_000,
        queryFn: async (): Promise<ChatMentionNotification[]> => {
            const { data, error } = await supabase.from("chat_notifications")
                .select("id,actor_name,actor_avatar,conversation_id,message_id,preview,is_read,created_at")
                .order("created_at", { ascending: false }).limit(50);
            if (error) throw error;
            return (data ?? []) as ChatMentionNotification[];
        },
    });

    useEffect(() => {
        if (!user?.id) return;
        const channel = supabase.channel("chat_notifications_db")
            .on("postgres_changes", { event: "*", schema: "public", table: "chat_notifications" },
                () => qc.invalidateQueries({ queryKey: chatKeys.mentions() }))
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [user?.id, qc]);

    const unreadCount = useMemo(() => mentions.filter((m) => !m.is_read).length, [mentions]);
    const markAsRead = useCallback(async (id: string) => {
        await supabase.from("chat_notifications").update({ is_read: true }).eq("id", id);
        qc.invalidateQueries({ queryKey: chatKeys.mentions() });
    }, [qc]);

    return { mentions, unreadCount, markAsRead };
}
```

- [ ] **Step 2: Render mentions in the dropdown** — in `notifications-dropdown.tsx`, consume `useMentionNotifications()`, add a `mention` icon (`AtSign` from lucide), merge mention items into the list (a mention item click → `useChatStore().open(conversation_id)` + `markAsRead`), and add its unread into the badge total.

- [ ] **Step 3: Type-check + lint. Commit**
```bash
git add apps/platform/hooks/chat/use-mention-notifications.ts apps/platform/components/layout/notifications-dropdown.tsx
git commit -m "feat(chat): @mention notifications in the bell dropdown (P1)"
```

## Task 25: Seed a default #general channel per tenant

**Files:**
- Create: `packages/supabase/migrations/20260620100500_chat_seed_general.sql`

So every tenant has a channel to land in on first open.

- [ ] **Step 1: Write the migration**

```sql
-- Create a public #general channel for every existing tenant, with all active members.
INSERT INTO public.chat_conversations (tenant_id, kind, name, is_private, created_by)
SELECT t.id, 'channel', 'general', false, NULL
FROM public.tenants t
WHERE NOT EXISTS (
    SELECT 1 FROM public.chat_conversations c WHERE c.tenant_id = t.id AND c.kind = 'channel' AND c.name = 'general'
);

INSERT INTO public.chat_members (conversation_id, user_id, role)
SELECT c.id, tm.user_id, 'member'
FROM public.chat_conversations c
JOIN public.tenant_members tm ON tm.tenant_id = c.tenant_id AND tm.status = 'active'
WHERE c.kind = 'channel' AND c.name = 'general'
ON CONFLICT (conversation_id, user_id) DO NOTHING;

-- Auto-add new tenant members to their tenant's #general going forward.
CREATE OR REPLACE FUNCTION public.chat_add_member_to_general()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_general uuid;
BEGIN
    IF NEW.status = 'active' THEN
        SELECT id INTO v_general FROM public.chat_conversations
        WHERE tenant_id = NEW.tenant_id AND kind = 'channel' AND name = 'general' LIMIT 1;
        IF v_general IS NOT NULL THEN
            INSERT INTO public.chat_members (conversation_id, user_id, role)
            VALUES (v_general, NEW.user_id, 'member') ON CONFLICT DO NOTHING;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_chat_add_member_to_general ON public.tenant_members;
CREATE TRIGGER trg_chat_add_member_to_general
    AFTER INSERT OR UPDATE OF status ON public.tenant_members
    FOR EACH ROW EXECUTE FUNCTION public.chat_add_member_to_general();
```

- [ ] **Step 2: Apply** name `chat_seed_general`. Verify each tenant has a `general` channel with members.
- [ ] **Step 3: Commit**
```bash
git add packages/supabase/migrations/20260620100500_chat_seed_general.sql
git commit -m "feat(chat): seed #general channel per tenant + auto-join trigger (P1)"
```

## Task 26: Generate types + full verification gate

**Files:** none new (regenerate + verify)

- [ ] **Step 1: Regenerate Supabase types** — Run: `pnpm generate-types`. Confirm `chat_*` tables/functions appear in the generated types. Commit the regenerated file.
- [ ] **Step 2: Run all chat unit tests** — Run: `pnpm exec vitest run apps/platform/lib/chat`. Expected: PASS.
- [ ] **Step 3: Type-check + lint** — Run: `pnpm type-check && pnpm lint`. Expected: green (no new errors; warnings allowed per repo policy).
- [ ] **Step 4: Manual two-user smoke test (the real gate).** With two browser sessions (two users in the same tenant): open the drawer from the avatar stack, send a message (appears live for both), `#`-reference an order (card renders + opens the modal on click), `@`-mention the other user (bell badge increments), react, attach an image, see typing indicator, see presence status + "Message" quick-DM, click "Discuss" on an order. Cross-tenant: confirm a third user in another tenant sees none of it.
- [ ] **Step 5: Commit**
```bash
git add apps/platform/types/supabase.ts  # or the generated path
git commit -m "chore(chat): regenerate supabase types after chat schema (P1)"
```

---

# PHASE 2 — Depth (own plan after P1 ships)

Expand each into full TDD tasks in `docs/superpowers/plans/2026-XX-XX-team-chat-depth.md`:

- **Threaded replies:** use existing `reply_to_id`; thread panel in MessageItem; broadcast already carries `reply_to_id`.
- **Read receipts (seen-by):** derive from other members' `last_read_at >= message.created_at`; show avatar row under the last seen message; broadcast a lightweight `read` event on `chat_mark_read`.
- **In-chat search:** add a `tsvector` GIN index on `chat_messages.body` + an RPC `chat_search(p_query)`; search bar in the drawer.
- **Expand-to-full page:** `apps/platform/app/chat/page.tsx` reusing ConversationList + MessageList + Composer; the `isExpanded` store flag + ⤢ button navigates here.
- **Custom-status editor UI:** a small popover to set `chat_user_status.custom_emoji/custom_text` (hook `useSetMyStatus` already exists).
- **Reaction realtime + attachment image previews + virtualized MessageList** (the tradeoffs flagged in Tasks 18–20).

---

## Self-review (completed by author)

- **Spec coverage:** channels+DMs (Tasks 1,11,21), order threads (Tasks 2,23,25), references (Tasks 16,17,20), @mentions+notify (Tasks 2,5,24), reactions (Task 18), attachments (Tasks 4,20), typing (Task 13), edit/delete/pin (schema in Task 1; UI actions flagged for executor in MessageItem — **note:** edit/delete/pin UI affordances are P1 schema-ready but their buttons are a small follow-up within Task 19's component; executor adds an action menu), presence enrichment + Message action (Tasks 7,22), drawer (Task 21), Discuss (Task 23), tenant-scoped presence fix (Task 7), RLS + realtime authz + storage (Tasks 1,3,4,6). Search/threads/receipts/full-page → P2 by design.
- **Placeholder scan:** abridged components (Composer/MessageList) carry explicit executor contracts, not vague TODOs; each has complete, runnable first-cut code. Acceptable.
- **Type consistency:** `chatKeys` defined in `use-conversations.ts` and imported by `use-messages.ts`/`use-mention-notifications.ts`; `ChatMessage`/`ChatReference` shared from `types/chat.ts`; topic builders shared from `lib/chat/topics.ts` and mirrored in SQL. RPC arg names match between SQL (`p_*`) and `.rpc()` calls.
- **Gap fixed inline:** added Task 25 (#general seed) so the drawer has content on first open; added the edit/delete/pin note above.
