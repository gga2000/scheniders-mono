# Team Chat — Phase 2A: Conversation Management — Design

**Date:** 2026-06-21
**Branch:** `feat/team-chat-presence`
**Parent roadmap:** `docs/superpowers/specs/2026-06-21-team-chat-enhancements-design.md` §6 Phase 2 (split: this is **2A**; search/navigation = **2B**, separate spec).
**Status:** Draft for approval.

---

## 1. Context & scope

Phase 1 (UI foundation) shipped. The master roadmap's Phase 2 bundled conversation management (I1–I5) with search/navigation (B1–B5) — two independent subsystems. They are split so each is a shippable, reviewable unit. **This spec = 2A, conversation management only.** 2B (search) follows in its own spec.

The chat backend today (verified against `packages/supabase/migrations/20260620100000`–`20260621100000`) has **no** RPCs or UI for: creating a channel, creating a group, renaming/setting topic, archiving, leaving, or adding/removing members. RLS has **no DELETE policy**; INSERT/UPDATE are narrowly scoped (self-insert into public channels or own-created conversations; member-only updates of name/topic/archived_at). Conversation/member state changes are **not broadcast** in realtime (only `chat_messages` and reactions are).

### In scope (2A)
- **I1** Create channel (public or private) + set topic.
- **I2** Create group DM (`kind='group'`, already a valid enum, no UI today).
- **I3** Rename / edit topic of a channel or group.
- **I4** Archive / unarchive (hide) a conversation; **leave** a conversation; **delete** (owner-only, channels/groups).
- **I5** Member management: add / remove members (private channels + groups); the private-channel "invite" reduces to add-members (no external invite links — internal teammates only).

### Out of scope (2A)
- Search, filters, jump-to-conversation → **2B**.
- Per-conversation notification preferences / mute UI → Phase 6 (G2/G3).
- DM/order-thread lifecycle changes (DMs and order threads are not renamed/left here; you can archive a DM from view in 2B's filter work if needed).

### Non-negotiables
- **Every new RPC is `SECURITY DEFINER`, `SET search_path = public`, authorization enforced INSIDE the function** (we do NOT broaden RLS with a DELETE policy or loosen INSERT — narrow RPCs are safer than wide policies). `EXECUTE` granted to `authenticated` only; PUBLIC/anon revoked (match `20260620100150`).
- **Tenant scoping:** client passes `p_tenant_id`; RPC asserts `p_tenant_id IN (SELECT get_user_tenant_ids())`. Every membership target user is verified same-tenant via `tenant_members` before insert.
- **Authorization predicate:** reuse the same "tenant admin OR conversation owner" check already used to guard `is_private` flips in `20260621100000` (the rename/archive/member-admin RPCs gate on it). The implementer must read that exact predicate and factor it into a helper `chat_is_conversation_admin(p_conversation_id)`.
- **LTR only; i18n** every string (EN + AR) in `apps/platform/lib/i18n.ts`.
- **No keyboard shortcuts** (project convention) — menus are click/tap.

---

## 2. Data model & migration

One migration: `packages/supabase/migrations/20260621110000_chat_conversation_management.sql`. **No new tables or columns** — `chat_conversations` already has `name/topic/is_private/archived_at/created_by`; `chat_members` already has `role(owner|member)`. We add functions + triggers only.

### 2.1 Authorization helper
```
chat_is_conversation_admin(p_conversation_id uuid) RETURNS boolean
  SECURITY DEFINER STABLE SET search_path = public
  -- true if auth.uid() is an 'owner' member of the conversation,
  -- OR is a tenant admin of the conversation's tenant
  -- (reuse the exact admin predicate from the 20260621100000 is_private guard).
```

### 2.2 RPCs (all `SECURITY DEFINER`, `authenticated`-only)
| RPC | Params | Authorization | Effect |
|-----|--------|---------------|--------|
| `chat_create_channel` | `p_tenant_id uuid, p_name text, p_is_private bool, p_topic text default null` | caller in tenant | INSERT conversation `kind='channel', created_by=auth.uid()`; INSERT creator as `role='owner'` member. Returns new id. Public channel → existing `chat_add_member_to_general`-style visibility (public channels are readable by all tenant members via existing RLS; they self-join on first open or are auto-joined — see §4). |
| `chat_create_group` | `p_tenant_id uuid, p_name text, p_user_ids uuid[]` | caller in tenant; every target same-tenant | INSERT conversation `kind='group'`; INSERT creator owner + each user member. Returns id. |
| `chat_rename_conversation` | `p_conversation_id uuid, p_name text, p_topic text` | `chat_is_conversation_admin` | UPDATE name/topic. Rejects for `kind in ('dm','order')`. |
| `chat_archive_conversation` | `p_conversation_id uuid, p_archived bool` | `chat_is_conversation_admin` | SET `archived_at = now()` or `null`. |
| `chat_leave_conversation` | `p_conversation_id uuid` | self | DELETE caller's `chat_members` row. Rejects for `kind='dm'` (can't "leave" a DM — archive instead) and rejects the **last owner** leaving without transfer (block; must delete or assign another owner). |
| `chat_delete_conversation` | `p_conversation_id uuid` | owner only (`role='owner'` membership) | DELETE conversation (cascades members/messages via FK). Rejects `kind in ('dm','order')`. |
| `chat_add_members` | `p_conversation_id uuid, p_user_ids uuid[]` | `chat_is_conversation_admin` | INSERT members (idempotent: `ON CONFLICT (conversation_id,user_id) DO NOTHING`); each target verified same-tenant. Only for `kind in ('channel','group')`. |
| `chat_remove_member` | `p_conversation_id uuid, p_user_id uuid` | `chat_is_conversation_admin` | DELETE target's membership. Cannot remove the last owner. |

Notes:
- Leaving/removing is done in `SECURITY DEFINER` RPCs precisely because there is **no** DELETE RLS policy — we keep it that way (no broad client DELETE).
- All mutating RPCs `RAISE EXCEPTION` with a clear message on auth failure (surfaced to the client as a toast).

### 2.3 Broadcast triggers (realtime)
Reuse the existing `realtime.send` + EXCEPTION-wrapped pattern from `chat_broadcast_message`:
- **`chat_conversations` AFTER UPDATE** (name/topic/archived_at changed) → `conversation:update` to `chat:conv:<id>` (members refresh title/state) **and** `inbox:refresh` to each member's `chat:user:<id>` (conversation list re-sorts/relabels; archived ones drop out).
- **`chat_members` AFTER INSERT** → `inbox:refresh` to the **added** user's `chat:user:<id>` (their list shows the new conversation) + `conversation:update` to the conversation (member list/count refresh).
- **`chat_members` AFTER DELETE** → `inbox:refresh` to the **removed** user (conversation disappears from their list) + `conversation:update` to remaining members.

Client wires a `conversation:update` listener (invalidates the conversations query + active-conversation header) and extends the existing `inbox:new`/`use-unread-inbox` handler to also handle `inbox:refresh` (it already invalidates the conversations query on inbox events — fold `inbox:refresh` into that).

### 2.4 Advisor check
After applying, run the security advisor (when the Supabase MCP is reconnected) and confirm no new `SECURITY DEFINER` lint or exposed-function findings; confirm PUBLIC/anon have no EXECUTE on the new functions.

---

## 3. Hooks (client data layer)

Extend `apps/platform/hooks/chat/use-conversations.ts` (mirror the existing `useStartDm` mutation shape: `supabase.rpc(...)` → invalidate `chatKeys.conversations()`):
- `useCreateChannel()` → `chat_create_channel`. On success: invalidate conversations, set active to the new id.
- `useCreateGroup()` → `chat_create_group`.
- `useRenameConversation()` → `chat_rename_conversation`.
- `useArchiveConversation()` → `chat_archive_conversation`.
- `useLeaveConversation()` → `chat_leave_conversation` (on success, clear active if it was the left conversation).
- `useDeleteConversation()` → `chat_delete_conversation`.
- `useConversationMembers(conversationId)` → query `chat_members` joined to `tenant_members` (display_name/avatar/role) for the settings panel.
- `useAddMembers()` / `useRemoveMember()` → the member RPCs.

New realtime listener (small hook or fold into `use-unread-inbox`): subscribe nothing new for the conversation topic beyond what `useMessages` already does — instead handle `conversation:update` by invalidating `chatKeys.conversations()` and, if it's the active conversation, refetching its row for the header. `inbox:refresh` → same invalidation already performed for `inbox:new`.

`ConversationWithMeta` already carries `members` (user_id/role/last_read_at) — enough to compute "am I owner?" for showing admin controls without an extra fetch.

---

## 4. UI surfaces

Built to the Phase-1 visual bar (ChatAvatar, tokens, ChatEmptyState, restrained motion, dialog a11y). Reuse `@scheniders/ui` `Dialog`, `Popover`, `Button`, `Textarea`; `Tooltip` from `apps/platform/components/ui`.

### 4.1 Conversation-list header + create affordances (`conversation-list.tsx`)
- Add a compact **list header row** above the sections: title ("Conversations") + a **"+" menu** (Popover) with: *New channel*, *New group*. Each opens a small creation dialog.
- New components:
  - `components/chat/create-channel-dialog.tsx` — name, optional topic, public/private toggle; calls `useCreateChannel`.
  - `components/chat/create-group-dialog.tsx` — name + multi-select teammate picker (reuse `useTenantMembers`); calls `useCreateGroup`.
- Section rows gain a hover **overflow (⋯) button** opening a per-conversation menu (Popover): *Settings* (channels/groups), *Mute* (placeholder → Phase 6, hidden for now), *Archive*, *Leave*, *Delete* (owner only). Items shown conditionally by `kind` + ownership. Order threads/DMs show only *Archive*.

### 4.2 Active-conversation header (`chat-sheet.tsx`)
- Replace the static "Team chat" title (when a conversation is active) with the **conversation name + topic** (channels/groups) or the DM peer name. Add an **overflow (⋯) menu** next to the close button mirroring the row menu (Settings/Archive/Leave/Delete), gated by kind + ownership.

### 4.3 Conversation settings panel
- `components/chat/conversation-settings-dialog.tsx` — opened from either overflow menu. Sections:
  - **Details** (admin): editable name + topic (`useRenameConversation`), public/private indicator (read-only here; privacy flip stays admin-gated, optional toggle if owner).
  - **Members**: list via `useConversationMembers` (ChatAvatar + name + role badge). Admin sees a **+ Add members** control (teammate multi-select, excludes current members) → `useAddMembers`, and a remove (×) per member → `useRemoveMember` (cannot remove last owner; self-remove routes through Leave).
  - Footer: **Leave** (non-owners / owners with another owner present) and **Delete** (owner, destructive, confirm).

### 4.4 States & feedback
- Optimistic where safe; otherwise pending spinners on buttons (match Phase-1 `Button` patterns).
- Destructive actions (Delete, Remove member, Leave) use a confirm step (reuse `Dialog` as an alert; concise AR/EN copy).
- Empty members / created-but-empty channel → `ChatEmptyState` variants.
- Errors from RPC `RAISE EXCEPTION` surfaced as a toast (use the app's existing toast).

---

## 5. i18n
Add EN+AR keys in `apps/platform/lib/i18n.ts` (both blocks): `chat.newChannel`, `chat.newGroup`, `chat.channelName`, `chat.channelTopic`, `chat.private`, `chat.public`, `chat.create`, `chat.settings`, `chat.rename`, `chat.archive`, `chat.unarchive`, `chat.leave`, `chat.delete`, `chat.addMembers`, `chat.removeMember`, `chat.members`, `chat.owner`, `chat.confirmDelete`, `chat.confirmLeave`, `chat.confirmRemoveMember`, `chat.lastOwnerBlocked`, plus toast messages. Verify with the existing `lib/i18n-completeness.test.ts` (it checks EN/AR key parity).

---

## 6. Verification
1. `pnpm --filter @scheniders/platform type-check` + `lint` (0 errors).
2. `pnpm --filter @scheniders/platform exec vitest run lib/i18n-completeness.test.ts` (key parity) + any new pure-helper tests.
3. **RLS/security:** an SQL fixture (extend `packages/supabase/tests/chat_rls.sql` pattern) proving: a non-admin/non-member CANNOT rename/archive/add/remove via the RPCs (they `RAISE EXCEPTION`); cross-tenant `p_tenant_id` / target users are rejected; last-owner leave/remove is blocked. Meta-test with an inverted control.
4. **Realtime:** 2-user smoke — create channel, add the other user → it appears in their list live; rename → both see new title; remove → it disappears for the removed user; leave/delete propagate.
5. Advisor check after migration (when MCP reconnected).

---

## 7. Risks
- **Authorization is the whole ballgame.** Every mutating RPC must fail closed; the SQL fixture is mandatory, not optional. Reuse the audited admin predicate rather than inventing one.
- **`#general` leave:** the `chat_add_member_to_general` trigger re-adds members only on `tenant_members` upsert, so leaving `#general` sticks until then — acceptable; optionally block leaving `#general` (name/seed-flagged). Decision: **allow leave; do not special-case #general** (re-add only on tenant change is fine).
- **Public-channel membership model:** public channels are RLS-readable by all tenant members even without a `chat_members` row. Adding members explicitly (for unread counts/inbox) vs. lazy self-join on open — keep the existing lazy model; `chat_add_members` is for **private** channels/groups. Document so the UI only shows "Add members" for private/group.
- **Migration application:** Supabase MCP disconnected mid-session; the migration is drafted as a file and applied when MCP reconnects (or by the user). Do not claim "applied" until verified.
