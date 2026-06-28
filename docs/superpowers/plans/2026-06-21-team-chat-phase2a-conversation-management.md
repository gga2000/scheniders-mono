# Team Chat — Phase 2A: Conversation Management — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Let users create channels & group DMs, rename/set topic, archive, leave, delete (owner), and add/remove members — via narrow `SECURITY DEFINER` RPCs (authorization enforced inside) with realtime propagation, plus the UI to drive it, built to the Phase-1 visual bar.

**Architecture:** One migration adds eight authorization-gated RPCs + an admin helper + two broadcast triggers (no new tables/columns). Client gets mutation hooks mirroring the existing `useStartDm` shape, a `conversation:update`/`inbox:refresh` realtime handler, and UI (create dialogs, per-conversation overflow menus, a settings dialog with member management).

**Tech Stack:** Postgres (Supabase, RLS), Next.js 16 / React 19, TanStack Query, zustand, framer-motion, Tailwind v4 tokens, `@scheniders/ui` (Dialog/Popover/Button/Textarea), Vitest.

**Spec:** `docs/superpowers/specs/2026-06-21-team-chat-phase2a-conversation-management-design.md`.

**Conventions:**
- Verification: `pnpm` needs `export PATH="/opt/homebrew/bin:$PATH"` first. Gates: `pnpm --filter @scheniders/platform type-check` + `lint` (0 errors) + `pnpm --filter @scheniders/platform exec vitest run <path>`. Commit with trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. Use `git -C /Users/ali/scheniders-mono`.
- **DB apply is deferred:** the Supabase MCP is disconnected this session. Tasks 1–2 DRAFT the migration + RLS fixture as files (committed). Do NOT claim applied/verified. Application, `pnpm generate-types`, the RLS fixture run, advisor check, and 2-user smoke happen when DB access returns (Task 10 checklist). The client (`supabase.rpc` is loosely typed — client is `createBrowserClient` without `<Database>`) compiles against the new RPC names regardless.
- Reuse existing helpers verified present: `get_current_tenant_id()`, `get_user_tenant_ids()`, `is_tenant_admin(uuid)`, `chat_topic_conversation(uuid)`, `chat_topic_user(uuid)`, `chat_is_member(uuid)`.

---

## Task 1: Migration — conversation-management RPCs + broadcasts

**Files:**
- Create: `packages/supabase/migrations/20260621110000_chat_conversation_management.sql`

- [ ] **Step 1: Write the migration verbatim**

```sql
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
    IF v_tenant IS NULL THEN RAISE EXCEPTION 'no active tenant' USING ERRCODE = '42501'; END IF;
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
    IF v_tenant IS NULL THEN RAISE EXCEPTION 'no active tenant' USING ERRCODE = '42501'; END IF;
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
```

- [ ] **Step 2: Self-review the SQL** (no live DB this session): confirm every mutating RPC begins with an authorization check or self-scope; every target user is verified `tenant_members ... status='active'`; last-owner is protected in leave + remove; the conversation broadcast trigger is `AFTER UPDATE OF name, topic, archived_at` (not unscoped — would spam on every message's `last_message_at`); all functions `REVOKE ... FROM PUBLIC, anon` + `GRANT ... TO authenticated`.

- [ ] **Step 3: Commit (drafted, not applied)**

```bash
git -C /Users/ali/scheniders-mono add packages/supabase/migrations/20260621110000_chat_conversation_management.sql
git -C /Users/ali/scheniders-mono commit -m "feat(chat): conversation-management RPCs + broadcasts (Phase 2A migration)"
```

---

## Task 2: RLS/authorization SQL fixture (drafted; run deferred)

**Files:**
- Create: `packages/supabase/tests/chat_phase2a_authz.sql`

This fixture documents + (when DB access returns) proves the authorization. Mirror the structure of the existing `packages/supabase/tests/chat_rls.sql` (read it first for the harness: how it sets `request.jwt.claims` / `role`, asserts, and uses an inverted control). It must assert:

- [ ] **Step 1: Author the fixture** with these cases (use the existing fixture's assert helpers/format):
  1. A non-member, non-admin calling `chat_rename_conversation` / `chat_archive_conversation` / `chat_add_members` / `chat_remove_member` on a private channel **raises** (`42501`).
  2. A regular member (non-owner, non-admin) calling those **raises**.
  3. An owner member **succeeds** at rename/archive/add/remove.
  4. A tenant admin (non-member) **succeeds** (admin predicate).
  5. `chat_create_group` / `chat_add_members` **silently skip** a `p_user_ids` entry from another tenant (no membership row created for them).
  6. `chat_leave_conversation` by the **last owner raises**; by a non-last owner / regular member **succeeds**.
  7. `chat_remove_member` of the **last owner raises**.
  8. `chat_delete_conversation` by a non-owner **raises**; by an owner **succeeds** and cascades (no orphan `chat_members`/`chat_messages`).
  9. Inverted control: deliberately grant the wrong role and confirm the asserts would FAIL (proving they're real).

- [ ] **Step 2: Commit**

```bash
git -C /Users/ali/scheniders-mono add packages/supabase/tests/chat_phase2a_authz.sql
git -C /Users/ali/scheniders-mono commit -m "test(chat): Phase 2A authorization RLS fixture (run when DB reconnects)"
```

---

## Task 3: Conversation-management mutation hooks

**Files:**
- Modify: `apps/platform/hooks/chat/use-conversations.ts`
- Create: `apps/platform/hooks/chat/use-conversation-members.ts`

- [ ] **Step 1: Add mutations to `use-conversations.ts`** (mirror the existing `useStartDm` shape — `supabase.rpc(...)` → invalidate `chatKeys.conversations()`). Append after `useStartOrderConversation`:

```ts
export function useCreateChannel() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (args: { name: string; isPrivate: boolean; topic?: string | null }): Promise<string> => {
            const { data, error } = await supabase.rpc("chat_create_channel", {
                p_name: args.name, p_is_private: args.isPrivate, p_topic: args.topic ?? null,
            });
            if (error) throw error;
            return data as string;
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: chatKeys.conversations() }),
    });
}

export function useCreateGroup() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (args: { name: string; userIds: string[] }): Promise<string> => {
            const { data, error } = await supabase.rpc("chat_create_group", {
                p_name: args.name, p_user_ids: args.userIds,
            });
            if (error) throw error;
            return data as string;
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: chatKeys.conversations() }),
    });
}

export function useRenameConversation() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (args: { conversationId: string; name: string; topic?: string | null }) => {
            const { error } = await supabase.rpc("chat_rename_conversation", {
                p_conversation_id: args.conversationId, p_name: args.name, p_topic: args.topic ?? null,
            });
            if (error) throw error;
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: chatKeys.conversations() }),
    });
}

export function useArchiveConversation() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (args: { conversationId: string; archived: boolean }) => {
            const { error } = await supabase.rpc("chat_archive_conversation", {
                p_conversation_id: args.conversationId, p_archived: args.archived,
            });
            if (error) throw error;
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: chatKeys.conversations() }),
    });
}

export function useLeaveConversation() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (conversationId: string) => {
            const { error } = await supabase.rpc("chat_leave_conversation", { p_conversation_id: conversationId });
            if (error) throw error;
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: chatKeys.conversations() }),
    });
}

export function useDeleteConversation() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (conversationId: string) => {
            const { error } = await supabase.rpc("chat_delete_conversation", { p_conversation_id: conversationId });
            if (error) throw error;
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: chatKeys.conversations() }),
    });
}
```

- [ ] **Step 2: Create `use-conversation-members.ts`** (member list for the settings panel + add/remove):

```ts
// apps/platform/hooks/chat/use-conversation-members.ts
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { chatKeys } from "./use-conversations";

export interface ConversationMember {
    user_id: string;
    role: "owner" | "member";
    display_name: string;
    avatar_url: string | null;
}

export function useConversationMembers(conversationId: string | null) {
    return useQuery({
        queryKey: [...chatKeys.all, "members", conversationId] as const,
        enabled: !!conversationId,
        staleTime: 15_000,
        queryFn: async (): Promise<ConversationMember[]> => {
            const { data, error } = await supabase
                .from("chat_members")
                .select("user_id, role, profile:user_profiles(display_name, avatar_url)")
                .eq("conversation_id", conversationId!);
            if (error) throw error;
            type Row = { user_id: string; role: "owner" | "member"; profile: { display_name: string | null; avatar_url: string | null } | null };
            return ((data ?? []) as unknown as Row[]).map((r) => ({
                user_id: r.user_id,
                role: r.role,
                display_name: r.profile?.display_name ?? "Teammate",
                avatar_url: r.profile?.avatar_url ?? null,
            }));
        },
    });
}

const membersKey = (conversationId: string) => [...chatKeys.all, "members", conversationId] as const;

export function useAddMembers(conversationId: string) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (userIds: string[]) => {
            const { error } = await supabase.rpc("chat_add_members", { p_conversation_id: conversationId, p_user_ids: userIds });
            if (error) throw error;
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: membersKey(conversationId) });
            qc.invalidateQueries({ queryKey: chatKeys.conversations() });
        },
    });
}

export function useRemoveMember(conversationId: string) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (userId: string) => {
            const { error } = await supabase.rpc("chat_remove_member", { p_conversation_id: conversationId, p_user_id: userId });
            if (error) throw error;
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: membersKey(conversationId) });
            qc.invalidateQueries({ queryKey: chatKeys.conversations() });
        },
    });
}
```

- [ ] **Step 3: Verify + commit**

Run: `pnpm --filter @scheniders/platform type-check` (expect clean — confirms the `user_profiles` embedded select + rpc args type-check). Run lint (0 errors).

```bash
git -C /Users/ali/scheniders-mono add apps/platform/hooks/chat/use-conversations.ts apps/platform/hooks/chat/use-conversation-members.ts
git -C /Users/ali/scheniders-mono commit -m "feat(chat): conversation-management + member hooks"
```

---

## Task 4: Realtime — handle `conversation:update` / `inbox:refresh`

**Files:**
- Modify: `apps/platform/hooks/chat/use-unread-inbox.ts`
- Modify: `apps/platform/hooks/chat/use-messages.ts`

- [ ] **Step 1: Read both files** to learn their existing channel/listener shape (the inbox hook subscribes to `chat:user:<id>` for `inbox:new`; `use-messages` subscribes to `chat:conv:<id>`). Match that exact pattern.

- [ ] **Step 2: In `use-unread-inbox.ts`**, add an `inbox:refresh` broadcast listener alongside the existing `inbox:new` one, performing the same conversation-list invalidation it already does for `inbox:new` (so add/remove/rename/archive refresh the list for the affected user). Concretely, register a second `.on("broadcast", { event: "inbox:refresh" }, () => qc.invalidateQueries({ queryKey: chatKeys.conversations() }))` on the same channel before `.subscribe(...)`.

- [ ] **Step 3: In `use-messages.ts`**, add a `conversation:update` listener on the existing conversation channel that invalidates the conversations list (so the active-conversation header + list relabel/re-sort live):
```ts
            .on("broadcast", { event: "conversation:update" }, () => {
                qc.invalidateQueries({ queryKey: chatKeys.conversations() });
            })
```
Insert it among the other `.on("broadcast", ...)` chains before `.subscribe(...)`. (`qc` and `chatKeys` are already in scope in that hook.)

- [ ] **Step 4: Verify + commit**

Run type-check + lint (0 errors).

```bash
git -C /Users/ali/scheniders-mono add apps/platform/hooks/chat/use-unread-inbox.ts apps/platform/hooks/chat/use-messages.ts
git -C /Users/ali/scheniders-mono commit -m "feat(chat): realtime conversation:update + inbox:refresh handling"
```

---

## Task 5: Create-channel + create-group dialogs + list header "+" menu

**Files:**
- Create: `apps/platform/components/chat/create-channel-dialog.tsx`
- Create: `apps/platform/components/chat/create-group-dialog.tsx`
- Modify: `apps/platform/components/chat/conversation-list.tsx`

- [ ] **Step 1: Read** `conversation-list.tsx` (current structure: `ConversationList` returns the scroll container with `Section`/`TeamDirectory`) and one existing dialog usage of `@scheniders/ui` `Dialog` in the app (grep `DialogContent`) to match the import + open/close pattern.

- [ ] **Step 2: Create `create-channel-dialog.tsx`** — controlled `open`/`onOpenChange`; fields: name (`input`), topic (optional `input`), private toggle (default on); submit calls `useCreateChannel`, on success `setActiveConversation(newId)` + close. Use `@scheniders/ui` `Dialog`/`Button`, tokens, `t()` for every label, `ChatEmptyState`-consistent styling. Disable submit while pending; surface RPC error via the app toast (grep for the existing toast util, e.g. `useToast`/`toast`). Title `t("chat.newChannel","New channel")`.

- [ ] **Step 3: Create `create-group-dialog.tsx`** — name + a teammate multi-select built from `useTenantMembers` (reuse `ChatAvatar` for rows, checkbox/selected state); submit calls `useCreateGroup({ name, userIds })`, on success activate + close.

- [ ] **Step 4: Add the list header + "+" menu in `conversation-list.tsx`** — render a header row above the sections: title `t("chat.conversations","Conversations")` + a trailing `Popover` "+" button with two items (`New channel`, `New group`) that open the two dialogs (local `useState` for which dialog is open). Wire `useChatStore().setActiveConversation` for post-create activation.

- [ ] **Step 5: Verify + commit**

Run type-check + lint (0 errors).

```bash
git -C /Users/ali/scheniders-mono add apps/platform/components/chat/create-channel-dialog.tsx apps/platform/components/chat/create-group-dialog.tsx apps/platform/components/chat/conversation-list.tsx
git -C /Users/ali/scheniders-mono commit -m "feat(chat): create channel/group dialogs + list header menu"
```

---

## Task 6: Per-conversation overflow menus (list rows + active header)

**Files:**
- Create: `apps/platform/components/chat/conversation-menu.tsx`
- Modify: `apps/platform/components/chat/conversation-list.tsx`
- Modify: `apps/platform/components/chat/chat-sheet.tsx`

- [ ] **Step 1: Create `conversation-menu.tsx`** — a `Popover`-based overflow (⋯) menu taking `{ conversation: ConversationWithMeta; isOwner: boolean; onOpenSettings: () => void }`. Items, shown conditionally:
  - `Settings` (kind `channel`/`group`) → `onOpenSettings()`.
  - `Archive` / `Unarchive` (admin-ish; all kinds) → `useArchiveConversation`.
  - `Leave` (kind `channel`/`group`) → confirm → `useLeaveConversation`; if it was active, `setActiveConversation(null)`.
  - `Delete` (owner only, kind `channel`/`group`) → destructive confirm → `useDeleteConversation`.
  Destructive items use a small inline confirm (reuse `Dialog` as alert). Every label via `t()`. Compute `isOwner` from `conversation.members` (the `ConversationWithMeta.members` already carries `role` for the current user).

- [ ] **Step 2: Wire into list rows** — in `conversation-list.tsx` `Section`, add a hover-revealed ⋯ button per row rendering `ConversationMenu`. Pass an `onOpenSettings` that lifts the selected conversation id into a `settingsForId` state in `ConversationList` (drives Task 7's dialog).

- [ ] **Step 3: Wire into the active-conversation header** — in `chat-sheet.tsx`, when a conversation is active, replace the static "Team chat" title with the conversation name/topic (look it up from `useConversations` by `activeConversationId`) and render `ConversationMenu` next to the close button. (The header already exists from Phase 1.)

- [ ] **Step 4: Verify + commit**

Run type-check + lint (0 errors).

```bash
git -C /Users/ali/scheniders-mono add apps/platform/components/chat/conversation-menu.tsx apps/platform/components/chat/conversation-list.tsx apps/platform/components/chat/chat-sheet.tsx
git -C /Users/ali/scheniders-mono commit -m "feat(chat): per-conversation overflow menu (rows + header)"
```

---

## Task 7: Conversation settings dialog (details + member management)

**Files:**
- Create: `apps/platform/components/chat/conversation-settings-dialog.tsx`
- Modify: `apps/platform/components/chat/conversation-list.tsx` (mount the dialog, driven by `settingsForId`)

- [ ] **Step 1: Create `conversation-settings-dialog.tsx`** — props `{ conversationId: string | null; onClose: () => void }`. Sections:
  - **Details** (admin only): editable name + topic inputs → `useRenameConversation` on save.
  - **Members**: `useConversationMembers(conversationId)` list — `ChatAvatar` + name + role badge (`Owner`). Admin sees a remove (×) per member → confirm → `useRemoveMember`; removing self routes to Leave. An **Add members** control (teammate multi-select from `useTenantMembers`, excluding current member ids) → `useAddMembers`.
  - Footer: **Leave** (non-owners, or owners with another owner) + **Delete** (owner, destructive). Reuse the same mutations as Task 6 (or import the menu's handlers).
  Loading → skeleton rows; empty member list → `ChatEmptyState`. All labels via `t()`. Determine admin/owner from the members list (current user's role) — no extra fetch.

- [ ] **Step 2: Mount in `conversation-list.tsx`** — render `<ConversationSettingsDialog conversationId={settingsForId} onClose={() => setSettingsForId(null)} />` once; opened by Task 6's `onOpenSettings`.

- [ ] **Step 3: Verify + commit**

Run type-check + lint (0 errors).

```bash
git -C /Users/ali/scheniders-mono add apps/platform/components/chat/conversation-settings-dialog.tsx apps/platform/components/chat/conversation-list.tsx
git -C /Users/ali/scheniders-mono commit -m "feat(chat): conversation settings dialog with member management"
```

---

## Task 8: i18n keys (EN + AR)

**Files:**
- Modify: `apps/platform/lib/i18n.ts`

- [ ] **Step 1: Add keys to BOTH the `en` and `ar` blocks** (place near the other `chat.*` keys). Add every key referenced by Tasks 5–7. Minimum set (add any others the components use):

| key | en | ar |
|-----|----|----|
| chat.conversations | Conversations | المحادثات |
| chat.newChannel | New channel | قناة جديدة |
| chat.newGroup | New group | مجموعة جديدة |
| chat.channelName | Name | الاسم |
| chat.channelTopic | Topic (optional) | الموضوع (اختياري) |
| chat.private | Private | خاصة |
| chat.public | Public | عامة |
| chat.create | Create | إنشاء |
| chat.cancel | Cancel | إلغاء |
| chat.save | Save | حفظ |
| chat.settings | Settings | الإعدادات |
| chat.rename | Rename | إعادة تسمية |
| chat.archive | Archive | أرشفة |
| chat.unarchive | Unarchive | إلغاء الأرشفة |
| chat.leave | Leave | مغادرة |
| chat.delete | Delete | حذف |
| chat.members | Members | الأعضاء |
| chat.addMembers | Add members | إضافة أعضاء |
| chat.removeMember | Remove | إزالة |
| chat.owner | Owner | المالك |
| chat.confirmDelete | Delete this conversation? This can't be undone. | حذف هذه المحادثة؟ لا يمكن التراجع. |
| chat.confirmLeave | Leave this conversation? | مغادرة هذه المحادثة؟ |
| chat.confirmRemoveMember | Remove this member? | إزالة هذا العضو؟ |
| chat.selectMembers | Select teammates | اختر زملاء الفريق |

- [ ] **Step 2: Verify key parity + commit**

Run: `pnpm --filter @scheniders/platform exec vitest run lib/i18n-completeness.test.ts` (EN/AR parity — must pass). Then type-check + lint.

```bash
git -C /Users/ali/scheniders-mono add apps/platform/lib/i18n.ts
git -C /Users/ali/scheniders-mono commit -m "i18n(chat): Phase 2A conversation-management strings (en+ar)"
```

---

## Task 9: Final gates (client)

- [ ] **Step 1: Run the full client gate set**

Run: `pnpm --filter @scheniders/platform type-check` → clean.
Run: `pnpm --filter @scheniders/platform lint` → 0 errors.
Run: `pnpm --filter @scheniders/platform exec vitest run lib/i18n-completeness.test.ts` → pass.

- [ ] **Step 2: Holistic self-review** — every new RPC name in hooks matches the migration's function name + params exactly; no `any`/`@ts-ignore`/unjustified `eslint-disable`; admin/owner gating in the UI matches the RPC gating (UI hides what the RPC would reject); all new strings have AR entries.

---

## Task 10: Deferred DB verification checklist (when Supabase MCP / DB access returns)

**Not executable this session — do NOT mark done until DB access is restored.**

- [ ] Apply `20260621110000_chat_conversation_management.sql` (via `mcp__supabase__apply_migration` or the user's pipeline).
- [ ] `pnpm generate-types` (regenerate `packages/supabase/src/database.types.ts`); re-run type-check.
- [ ] Run `packages/supabase/tests/chat_phase2a_authz.sql`; confirm all asserts pass + the inverted control fails.
- [ ] `mcp__supabase__get_advisors` (security) — confirm no new SECURITY DEFINER / exposed-function findings; confirm PUBLIC/anon have no EXECUTE on the new functions.
- [ ] 2-user live smoke: create channel → add user B → appears in B's list live; rename → both see new title; remove B → disappears for B; B leaves a group → others see member drop; owner delete → gone for all; archive → drops from lists.

---

## Self-Review (coverage map)
- **I1 create channel** → Task 1 (`chat_create_channel`), 3 (`useCreateChannel`), 5 (dialog + menu).
- **I2 create group** → Task 1 (`chat_create_group`), 3, 5.
- **I3 rename/topic** → Task 1 (`chat_rename_conversation`), 3, 7 (details section), 6 (header title).
- **I4 archive/leave/delete** → Task 1 (`chat_archive`/`leave`/`delete`), 3, 6 (menu), 7 (footer).
- **I5 add/remove members + invite** → Task 1 (`chat_add_members`/`chat_remove_member`), 3 (`use-conversation-members`), 7 (members section). "Invite" = internal add-members (no external links), per spec.
- **Realtime propagation** → Task 1 (triggers) + Task 4 (client handlers).
- **Authorization** → Task 1 (in-RPC checks) + Task 2 (fixture) + Task 10 (run + advisor).
- **i18n** → Task 8. **Gates** → Task 9. **DB apply/smoke** → Task 10 (deferred).
