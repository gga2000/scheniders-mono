# Team Chat — Phase 5: Order Superpowers — Design

**Date:** 2026-06-22
**Branch:** `feat/team-chat-presence`
**Parent roadmap:** `docs/superpowers/specs/2026-06-21-team-chat-enhancements-design.md` §6 Phase 5 (the moat).
**Status:** Draft — pending decisions (§8).

---

## 1. Context & why this is the moat

Phases 1/2A/2B made the chat a solid Slack-clone. Phase 5 fuses it with the order pipeline so order threads become an **ops command surface**: act on the order without leaving the thread, auto-narrate its lifecycle, assign work by mention, and triage by resolution state. This is the differentiator no generic chat has.

Backend facts (verified): `orders.status` (14-value enum) + `assigned_to`/`assigned_at` columns (no assign RPC; set via direct update) + `last_status_changed_by_name`/`_avatar` (client sets attribution on status change) + `order_status_history` audit table. Order↔thread link = `chat_conversations.order_id` (unique) + `chat_find_or_create_order_conversation`. `useUpdateStatusMutation` + `use-order-crud` drive client status changes. `OrdersProvider`/`useOrdersContext` is app-wide. **`chat_messages.sender_id` is `NOT NULL`, no system column.** **`orders` RLS = blanket `auth.role()='authenticated'` (not tenant-scoped).**

### In scope (C1–C6)
- **C1** Act-on-order from the thread — change status / assign / add internal note from the order-thread header.
- **C2** @mention-in-order-thread → assign (see §8 decision on auto vs explicit).
- **C3** Order auto-events — system messages posted into the order thread on status change, assignment change, delivery. **The headline feature.**
- **C4** Live order card — the order-thread shows a live (not snapshot) card: status, total IQD, customer + quick call (`tel:`) / WhatsApp (`wa.me`).
- **C5** "Discuss this order" button — on the order-details modal + order rows → open/create the thread.
- **C6** Resolve / unresolve flag on order threads + a triage filter.

### Deferred
- **C7 bulk (open threads / broadcast to assignees)** — proposed deferred (vague scope; C1–C6 are the moat). Confirm in §8.

### Non-negotiables
- New RPCs `SECURITY DEFINER`, `search_path=public,pg_temp`, tenant+membership-guarded, `authenticated`-only. The orders trigger is SECDEF and **must self-check tenant** (orders RLS won't protect it).
- LTR; system-event text localized (EN+AR) — so events store a structured payload the client localizes, NOT a baked English string.
- Built to the Phase-1 visual bar. IQD currency, no tax.

---

## 2. Data model & migration

Migration `packages/supabase/migrations/20260622110000_chat_order_superpowers.sql`.

### 2.1 System messages (for C3) — schema change to `chat_messages`
- `ALTER TABLE chat_messages ALTER COLUMN sender_id DROP NOT NULL;` (system events have no human sender).
- `ADD COLUMN is_system boolean NOT NULL DEFAULT false;`
- `ADD COLUMN system_event jsonb;` — structured: `{ "type": "status_changed"|"assigned"|"delivered", "from": ..., "to": ..., "actor_name": ..., "order_id": ... }`. Client renders localized text from this; `body` stays `''` for system rows.
- Update the existing `chat_messages_guard_update` trigger: keep identity columns immutable, but it currently compares `NEW.sender_id <> OLD.sender_id` — make it null-safe (`IS DISTINCT FROM`) so system rows (sender_id NULL) don't trip it. System rows are never client-updated anyway (author-update RLS keys on `sender_id = auth.uid()`, which is false for NULL → uneditable, correct).
- Update `chat_broadcast_message` payload to include `is_system` + `system_event` so the client renders incoming system events without a refetch.

### 2.2 Resolve flag (C6)
- `ALTER TABLE chat_conversations ADD COLUMN resolved_at timestamptz;`

### 2.3 RPCs
- `chat_post_order_event(p_order_id uuid, p_event jsonb)` — INTERNAL helper (SECDEF): find the order's conversation (by `order_id`); if none, **no-op** (don't force-create threads for undiscussed orders — avoids noise). Insert a system `chat_messages` row (`is_system=true, sender_id=NULL, body='', system_event=p_event, tenant_id` from the conversation). Returns void. Granted to `authenticated` (also callable by the trigger which runs as definer).
- `chat_assign_order(p_order_id uuid, p_user_id uuid)` (C1/C2) — SECDEF: assert caller + target are active members of the order's tenant (`get_user_tenant_ids()` + `tenant_members`); `UPDATE orders SET assigned_to=p_user_id, assigned_at=now()`; post an `assigned` order-event. (The orders trigger §2.4 also catches direct assignment changes, so the event isn't double-posted — the RPC relies on the trigger for the event, OR posts directly and the trigger de-dupes on no-op. Decision: the **trigger** is the single source of order-events; `chat_assign_order` just does the UPDATE and lets the trigger post. Simpler + consistent with status changes.)
- `chat_set_conversation_resolved(p_conversation_id uuid, p_resolved boolean)` (C6) — SECDEF: `chat_is_member` required; set `resolved_at = now()/null`; broadcast `conversation:update` (reuse the 2A trigger — it fires `AFTER UPDATE OF ...`; add `resolved_at` to that trigger's column list).

### 2.4 Orders auto-event trigger (C3) — the engine
- `chat_orders_event()` — `AFTER UPDATE ON orders FOR EACH ROW`, SECDEF, `search_path=public,pg_temp`. Self-tenant-guarded (reads NEW.tenant_id). Detects:
  - `OLD.status IS DISTINCT FROM NEW.status` → `chat_post_order_event(NEW.id, {type:'status_changed', from:OLD.status, to:NEW.status, actor_name:NEW.last_status_changed_by_name})`.
  - `OLD.assigned_to IS DISTINCT FROM NEW.assigned_to` → `{type:'assigned', to:NEW.assigned_to, actor_name:...}`.
  - `OLD.delivered_at IS NULL AND NEW.delivered_at IS NOT NULL` → `{type:'delivered'}` (if not already implied by status).
  - All `chat_post_order_event` calls wrapped so a chat failure never rolls back the order update (EXCEPTION-swallow, like the existing broadcast triggers). **No-op when no order thread exists.**
- Trigger name `trg_chat_orders_event`; created on `public.orders`. (Coexists with the existing BEFORE UPDATE triggers — this is AFTER UPDATE, no conflict.)

### 2.5 Grants + advisor
Revoke PUBLIC/anon, grant `authenticated` on the new RPCs. Run `get_advisors security` after apply. Apply live (MCP up); membership/tenant smoke for `chat_assign_order` + an end-to-end "status change posts a system event into the thread" smoke.

---

## 3. Types & hooks
- `types/order.ts`: add `assigned_to?: string; assigned_at?: string;` (currently missing despite existing in DB).
- `types/chat.ts`: extend `ChatMessage` with `is_system?: boolean; system_event?: ChatSystemEvent | null;` + a `ChatSystemEvent` union type.
- Hooks:
  - `useAssignOrder()` → `chat_assign_order`.
  - `useSetConversationResolved()` → `chat_set_conversation_resolved`.
  - Reuse `useUpdateStatusMutation` (existing) for C1 status changes from the thread.
  - `useOrderForConversation(conversationId)` — derive the linked order from `useOrdersContext` via the conversation's `order_id` (for C4 live card + C1 header).

## 4. UI
Built to the Phase-1 bar.
- **C1 order-thread action bar** (`chat-sheet.tsx` header when `kind='order'`, or a sticky bar atop the message list): status dropdown (reuse the app's status registry + colors), assign control (teammate picker → `useAssignOrder`), and an internal-note shortcut (posts to the thread / `orders.internal_notes`).
- **C3 system-event rendering** (`message-item.tsx`): when `message.is_system`, render a centered, muted pill (no avatar/bubble) with localized text built from `system_event` (e.g. `t('chat.event.statusChanged', '{actor} moved this to {to}', {...})` with the status label localized). Restrained.
- **C4 live order card** — a new `order-thread-card.tsx` pinned at the top of an order thread: live status chip + total IQD + customer name + `tel:`/`wa.me` buttons. Reads live from `useOrderForConversation`.
- **C2** — in the order-thread composer, mentioning a teammate triggers assignment per §8 decision (auto, or an explicit "Assign @X?" affordance). The resulting `assigned` system event makes it visible either way.
- **C5 "Discuss this order"** — button on `order-details-modal.tsx` + order row actions → `useStartOrderConversation` (existing) → `useChatStore().open(convId)`.
- **C6 resolve** — a resolve/unresolve toggle in the order-thread header (`useSetConversationResolved`); a "Unresolved orders" triage filter in the conversation-list Orders section (extends the 2B order filter).

## 5. i18n
EN+AR keys for: order-event templates (`chat.event.statusChanged`/`assigned`/`delivered`), action-bar labels (`chat.changeStatus`, `chat.assign`, `chat.assignTo`, `chat.addNote`, `chat.discussOrder`, `chat.resolve`, `chat.unresolve`, `chat.resolved`, `chat.unresolvedOnly`), card labels (`chat.call`, `chat.whatsapp`). Verify `i18n-completeness`.

## 6. Verification
1. type-check + lint (0 errors) + new pure-helper/i18n tests.
2. **DB live:** apply; advisor; smoke — (a) `chat_assign_order` rejects cross-tenant target + non-member caller; (b) a status change on an order **with a thread** inserts exactly one system event into that thread, **with no thread** is a silent no-op; (c) the order update still succeeds even if the chat post fails (EXCEPTION-swallow). Regenerate types.
3. Live 2-user: change status from the thread → both see the system event + the live card updates; assign by mention → assignee gets it; resolve → triage filter reflects it.

## 7. Risks
- **System-message schema change** touches the hottest table (`chat_messages`) + its guard/broadcast — must not regress normal messaging (the guard's `IS DISTINCT FROM` null-safety + broadcast payload additions are the careful bits). Regression-test normal send/edit/delete after.
- **Orders trigger fan-out / loops** — `chat_post_order_event` inserts a `chat_messages` row → fires `chat_broadcast_message` (fine), but must NOT update `orders` (would re-fire `trg_chat_orders_event` → loop). It only touches chat tables. Verify no orders write in the chat path.
- **Orders RLS not tenant-scoped** (pre-existing) — the trigger/RPCs self-guard tenant; flag the broader gap separately (out of scope to fix here, but note it).
- **@mention=assign surprise** — see §8; the visible system event mitigates, but the auto-behavior is the risk.
- **Event spam** — only post on *real* transitions (`IS DISTINCT FROM`), and only when a thread already exists. No back-fill of historical changes.

## 8. Decisions needed before build
1. **C2 mention→assign:** auto-assign on any teammate @mention in an order thread (fast, but surprising), OR an explicit "Assign to @X" action in the thread (mention stays a notification only)?
2. **C7 bulk:** defer (recommended) or include now?
3. **System-event schema:** OK to add `is_system` + `system_event jsonb` + make `sender_id` nullable on `chat_messages` (the cleanest way to support auto-events)?
