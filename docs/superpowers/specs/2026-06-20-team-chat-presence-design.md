# Team Chat + Live Presence — Design Spec

**Date:** 2026-06-20
**App:** `apps/platform` (`@scheniders/platform`, Next.js 16 App Router, React 19)
**Status:** Approved design → ready for implementation plan
**Author:** brainstormed with Claude Code

---

## 1. Summary

A state-of-the-art, in-app **team chat** plus an enriched **live presence** view for the
platform (merchant ops) app. The entry point is the avatar stack in the top bar: it shows
who is online (enriched signals) and, when clicked, opens a Slack-like chat with **channels
+ direct messages** and first-class **references** to orders, customers, and products.

The platform already ships a basic presence avatar stack and a notifications dropdown. This
feature **enhances presence** (tenant-scoped, richer signals) and **builds chat from
scratch** (no chat tables exist today).

### Decisions locked during brainstorming
- **Chat shape:** channels **+** direct messages (Slack-like). Order-anchored threads are a
  `kind` of conversation, not a separate system.
- **Features in scope (all):** rich references (orders/customers/products), @mentions +
  notifications, emoji reactions, threaded replies, image/file attachments, typing
  indicators, read receipts (seen-by), edit/delete + pin, in-chat search, "Discuss" button
  on each order.
- **Surface:** right-side slide-over **drawer** that can **expand to a full `/chat` page**.
  Mobile: full-screen sheet (responsive).
- **Realtime backbone:** **Broadcast-from-Database per conversation** (Supabase's
  recommended chat architecture), plus enriched presence and a per-user inbox channel for
  unread badges. (`postgres_changes` rejected for scale; external realtime vendors rejected.)
- **Presence signals (all):** live activity ("viewing Order #7224"), auto status
  (online/idle/away), custom status (emoji + text), last-seen-when-offline, "Message" quick
  action, per-order co-presence integrated.

---

## 2. Context — what already exists

| Concern | Existing artifact | Reuse plan |
|---|---|---|
| Browser Supabase client | `apps/platform/lib/supabase.ts` (`createBrowserClient`, cookie sessions, fetch timeout) | Reuse as-is |
| Server clients | `apps/platform/lib/supabase-server.ts` (server / token / service-role) | Reuse for RPC + storage |
| Global presence | `apps/platform/hooks/use-global-presence.ts` → channel `presence:global` | **Replace** with tenant-scoped enriched presence |
| Per-order presence | `apps/platform/hooks/use-presence.ts`, `components/orders/presence-avatar-group.tsx` | Integrate into the new presence system |
| Presence UI | `components/layout/global-presence-indicator.tsx` | Replace with `LivePresenceStack` |
| Notifications | `components/layout/notifications-dropdown.tsx`, `hooks/use-order-activity-notifications.ts`, table `order_notifications` | Reuse the dropdown surface for @mention notifications |
| Realtime batching | `apps/platform/lib/realtime-batcher.ts` | Reuse for message-cache updates |
| Tenancy | `tenant_members`, `get_current_tenant_id()`, `get_user_tenant_ids()`, `is_tenant_admin()` | Foundation for all RLS |
| Auth | `useAuth()` → `{ user, profile, tenantId }` (`components/auth/auth-provider.tsx`) | Source of identity + tenant |
| Top bar | `components/layout/global-search.tsx` (`TopBar`, right actions ~L399–446) | Mount `LivePresenceStack` + chat trigger |

### Known issue this feature must fix
`presence:global` is a **single channel for all tenants** → cross-tenant presence leak.
The new presence channel is `tenant:{tenant_id}:presence`.

---

## 3. Data model

All tables live in `packages/supabase/migrations/` (timestamped), carry `tenant_id`, and
ship with **RLS enabled from creation**.

```
conversations
  id              uuid pk
  tenant_id       uuid not null  -> tenants(id)
  kind            text check in ('channel','dm','group','order')
  name            text            -- null for dm
  topic           text
  order_id        uuid            -- set when kind='order'
  is_private      boolean default true   -- channels can be public-to-tenant
  created_by      uuid -> user_profiles(id)
  last_message_at timestamptz
  archived_at     timestamptz
  created_at/updated_at

conversation_members
  id              uuid pk
  conversation_id uuid -> conversations(id) on delete cascade
  user_id         uuid -> user_profiles(id)
  role            text check in ('owner','member') default 'member'
  last_read_at    timestamptz default now()   -- unread + read receipts
  muted           boolean default false
  joined_at       timestamptz default now()
  unique(conversation_id, user_id)

messages
  id              uuid pk
  conversation_id uuid -> conversations(id) on delete cascade
  tenant_id       uuid not null            -- denormalized for RLS + index
  sender_id       uuid -> user_profiles(id)
  body            text
  reply_to_id     uuid -> messages(id)     -- threads (Phase 2)
  client_msg_id   text                     -- optimistic dedup
  edited_at       timestamptz
  deleted_at      timestamptz              -- soft delete
  created_at      timestamptz default now()
  -- full-text index on body (search, Phase 2)

message_references
  id              uuid pk
  message_id      uuid -> messages(id) on delete cascade
  ref_type        text check in ('order','customer','product')
  ref_id          uuid
  snapshot        jsonb     -- denormalized render payload at send time

message_reactions
  id, message_id -> messages(id) on delete cascade, user_id, emoji text
  unique(message_id, user_id, emoji)

message_attachments
  id, message_id -> messages(id) on delete cascade
  storage_path text, file_name text, mime text, size_bytes int, width int, height int

message_mentions
  id, message_id -> messages(id) on delete cascade, mentioned_user_id uuid

chat_pins
  conversation_id, message_id, pinned_by, pinned_at
  unique(conversation_id, message_id)

user_status
  user_id pk -> user_profiles(id)
  tenant_id uuid
  custom_emoji text, custom_text text
  last_seen_at timestamptz
  updated_at timestamptz
```

### Modeling notes
- **DMs / group DMs** are `conversations` with `kind in ('dm','group')` and no `name`. A DM
  is deduplicated on its exact member set (find-or-create).
- **Order threads** are `kind='order'` + `order_id`. The "Discuss" button find-or-creates.
- **Unread** = `messages.created_at > conversation_members.last_read_at`.
- **Read receipts** ("seen by") = other members whose `last_read_at >= message.created_at`.
- **References snapshot** lets the card render instantly and survive later data changes;
  clicking always resolves the live entity.

---

## 4. Security / RLS

- **Read:** a row in `conversations` / `messages` / children is visible only to a
  **member** of that conversation; membership already implies same tenant. Canonical predicate:
  `tenant_id IN (SELECT get_user_tenant_ids())` **AND** an `EXISTS` membership check.
- **Write (messages):** insert forces `sender_id = auth.uid()`; `tenant_id` derived
  server-side from `get_current_tenant_id()` — never client-supplied. Edits/deletes limited
  to the author (or tenant admin for delete).
- **Channel creation / membership management:** tenant members can create channels; private
  channel membership managed by owner/admin.
- **Realtime channel authorization:** RLS on `realtime.messages` so a client may only
  `subscribe` to `tenant:{tid}:conversation:{cid}` (and its inbox/presence channels) when it
  is a member / belongs to the tenant. Prevents eavesdropping on private channels.
- **Attachments:** private Storage bucket `chat-attachments`; object path
  `{tenant_id}/{conversation_id}/{uuid}`; `storage.objects` RLS by membership.
- **Explicit RLS tests:** a member of tenant A must not read any conversation, message, or
  presence of tenant B; a non-member must not read or subscribe to a private channel.

---

## 5. Realtime delivery + data flow

**Channels**
- `tenant:{tid}:conversation:{cid}` — message create/update/reaction events + ephemeral typing.
- `tenant:{tid}:user:{uid}` — per-user **inbox**: lightweight "new message in a conversation
  you're in" events → global unread badge + toast without subscribing to every conversation.
- `tenant:{tid}:presence` — enriched presence (replaces `presence:global`).

**Send a message**
1. Client optimistic-appends with a generated `client_msg_id`.
2. `send_message` RPC atomically inserts the message plus its references, mentions, and
   attachment rows. If `SECURITY DEFINER` (for the broadcast side-effect), it must first
   assert `auth.uid()` is a member of the target conversation before writing — it does not
   inherit RLS. Otherwise a plain `SECURITY INVOKER` RPC relies on the messages-insert RLS policy.
3. A DB trigger calls `realtime.broadcast_changes` to the conversation channel (open viewers)
   **and** to each member's inbox channel (badges/toasts).
4. Mentions additionally write a notification row → existing notifications dropdown (offline recall).
5. Receiving clients reconcile the broadcast against the optimistic entry by `client_msg_id`.

**Typing** = ephemeral broadcast on the conversation channel (no DB write).
**Presence** = `channel.track(...)` on the tenant presence channel with payload
`{ id, display_name, avatar_url, role, activity, status, online_at }`; per-conversation
presence used for "who's viewing / typing".

---

## 6. References + mentions (the signature feature)

- Composer detects `#` → live, tenant-scoped search across orders / customers / products →
  selecting inserts a token into the draft. On send, each token persists a
  `message_references` row with a `snapshot`.
- `ReferenceCard` renders the snapshot (id, customer, total, status for orders; analogous for
  customer/product). Click → opens the order modal / customer / product view.
- Composer detects `@` → teammate picker (tenant members) → persists `message_mentions` +
  triggers a notification to the mentioned user.

---

## 7. Presence enhancements

- Replace `presence:global` with `tenant:{tid}:presence`.
- Enrich payload: `activity` (derived from current route / active order context, e.g.
  "viewing Order #7224"), auto `status` (online → idle ≈5 min → away/offline via Realtime +
  visibility events), `custom_status` (emoji + text, persisted in `user_status`),
  `last_seen_at` (persisted; powers "last seen 14m ago" when offline).
- `LivePresenceStack` (top bar) → `PresencePopover` listing teammates with status + activity
  and a **Message** quick action that opens a DM in the drawer.
- Per-order co-presence (existing `presence-avatar-group.tsx`) integrated into the same system,
  plus a **Discuss** button on the order that opens the order conversation.

---

## 8. UI / surface + components

- **Top bar:** `GlobalPresenceIndicator` → `LivePresenceStack` (`components/layout/`).
- **`ChatDrawer`** (right slide-over): conversation list (Channels / Direct / Order threads)
  + virtualized `MessageList` + `Composer`. A ⤢ control expands to the full `/chat` route,
  which reuses the same components. Mobile = full-screen sheet.
- **Message rendering:** `MessageList`, `MessageItem` (body, `ReferenceCard`, reactions,
  attachments, thread indicator, seen-by, edited tag), `Composer` (with `#`/`@` autocomplete,
  attachment upload, emoji).
- **Presence:** `LivePresenceStack`, `PresencePopover`.
- **Hooks:** `useConversations`, `useMessages(convId)`, `useChatRealtime`,
  `useTypingIndicator`, `useUnreadInbox`, `useUserStatus`, `useTenantPresence`.
- Reuse `packages/ui`. Build with the `ui-ux-pro-max` skill for the visual finish. App stays
  **LTR** in all locales (set `lang`, never `dir`). Currency **IQD**, no tax.

---

## 9. Phasing

- **P0 — foundation:** migrations (all tables, RLS, realtime channel authorization, storage
  bucket + policies, `send_message` RPC, broadcast trigger) and the tenant-scoped presence fix.
- **P1 — core chat:** channels + DMs; send/receive via broadcast; references; @mentions +
  notifications; reactions; attachments; typing; edit/delete/pin; presence enrichment +
  Message quick action; the drawer surface; the Discuss button.
- **P2 — depth:** threaded replies (`reply_to_id`), read receipts (seen-by), in-chat search
  (full-text), expand-to-`/chat` full page, custom-status UI polish.

---

## 10. Testing (CLAUDE.md: tests are not in CI — run locally)

- **Vitest:** reference parser, unread math, DM dedup, `send_message` RPC behavior.
- **RLS:** cross-tenant isolation (tenant A cannot read tenant B conversations / messages /
  presence); non-member cannot read or subscribe to a private channel.
- **Realtime:** channel authorization rejects non-members.
- **Playwright (two users):** send/receive, mention notification, reference card render +
  click-through, attachment upload, typing indicator.
- Gate before "done": `pnpm type-check` and `pnpm lint` pass; relevant tests run; tenant
  scoping verified live.

---

## 11. Out of scope (YAGNI)

- Voice / video calls.
- Cross-tenant or customer-facing chat (employees of one store only).
- External chat integrations (Slack/WhatsApp bridging) beyond the existing WhatsApp order flow.
- AI summarization of conversations (possible future phase).
```
