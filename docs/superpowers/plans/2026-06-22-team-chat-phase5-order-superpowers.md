# Team Chat — Phase 5: Order Superpowers — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Turn order threads into an ops command surface — act on the order from the thread (status/assign/note), auto-narrate its lifecycle as system events, show a live order card, a "Discuss this order" launcher, and a resolve/triage flag.

**Architecture:** One migration adds system-message support to `chat_messages` (`is_system` + `system_event` jsonb + nullable `sender_id`), a `resolved_at` flag, three RPCs, and an `AFTER UPDATE` trigger on `orders` that posts localized-payload system events into the matching order thread (no-op when no thread exists; tenant-self-guarded; never writes `orders`). Client renders system events as muted pills and adds the order-thread action bar + live card + launcher + resolve toggle.

**Decisions (locked):** mention→assign is EXPLICIT (a deliberate Assign control, not auto-on-mention); C7 bulk DEFERRED; schema change APPROVED.

**Tech Stack:** Postgres (triggers, jsonb), Next.js 16/React 19, TanStack Query, zustand, Tailwind v4 tokens, `@scheniders/ui`, Vitest. MCP up — apply + smoke live.

**Spec:** `docs/superpowers/specs/2026-06-22-team-chat-phase5-order-superpowers-design.md`.

**Conventions:** `pnpm` needs `export PATH="/opt/homebrew/bin:$PATH"`. Gates: type-check + lint (0 errors) + vitest. Commit trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. `git -C /Users/ali/scheniders-mono`. `supabase.rpc` loosely typed (compiles pre-apply).

---

## Task 1: Migration — system messages + resolve + order-event engine

**Files:** Create `packages/supabase/migrations/20260622110000_chat_order_superpowers.sql`

- [ ] **Step 1: Write the migration**

```sql
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
    -- self-guard (orders RLS is not tenant-scoped): only narrate rows with a tenant
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
    EXCEPTION WHEN OTHERS THEN NULL;  -- a chat failure must never roll back the order update
    END;
    RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_chat_orders_event ON public.orders;
CREATE TRIGGER trg_chat_orders_event
    AFTER UPDATE OF status, assigned_to, delivered_at ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.chat_orders_event();

-- ---- grants ----
REVOKE EXECUTE ON FUNCTION public.chat_post_order_event(uuid, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.chat_assign_order(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.chat_set_conversation_resolved(uuid, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.chat_orders_event() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.chat_post_order_event(uuid, jsonb) FROM authenticated;  -- internal only
GRANT  EXECUTE ON FUNCTION public.chat_assign_order(uuid, uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.chat_set_conversation_resolved(uuid, boolean) TO authenticated;
```

- [ ] **Step 2: Apply live** via `mcp__supabase__apply_migration` (name `chat_order_superpowers`). Commit the file.
- [ ] **Step 3: Live smoke** (BEGIN…ROLLBACK via `execute_sql`, harness like `chat_phase2a_authz.sql`):
  1. **Normal messaging regression:** as a member, `chat_send_message` a normal text msg → row has `is_system=false`, `sender_id=<me>`; edit it (update body) → no guard exception; soft-delete → ok. (Confirms the schema change didn't break the hot path.)
  2. **Status event:** seed an order + its thread (`chat_find_or_create_order_conversation`); `UPDATE orders SET status='confirmed', last_status_changed_by_name='Ali'` → exactly ONE `is_system` row in the thread with `system_event->>'type'='status_changed'`, `to='confirmed'`, `actor_name='Ali'`.
  3. **No-thread no-op:** an order with NO thread; `UPDATE orders SET status=...` → zero system rows created, order update succeeds.
  4. **Assign guard:** `chat_assign_order` rejects a cross-tenant `p_user_id` (42501) and a cross-tenant `p_order_id`; succeeds for a same-tenant assignee and the orders trigger posts an `assigned` event.
  5. **No loop:** confirm the order-event path inserts only `chat_messages` (never updates `orders`).
- [ ] **Step 4: Advisor** `get_advisors security` — only the expected intentional SECDEF advisory for the new functions; confirm `chat_post_order_event` has NO `authenticated`/anon EXECUTE (internal). Commit.

```bash
git -C /Users/ali/scheniders-mono add packages/supabase/migrations/20260622110000_chat_order_superpowers.sql
git -C /Users/ali/scheniders-mono commit -m "feat(chat): order-superpowers schema + RPCs + orders→thread event engine (Phase 5)"
```

---

## Task 2: Types + hooks

**Files:** Modify `apps/platform/types/order.ts`, `apps/platform/types/chat.ts`; Create `apps/platform/hooks/chat/use-order-actions.ts`

- [ ] **Step 1: `types/order.ts`** — add `assigned_to?: string;` and `assigned_at?: string;` to the `Order` interface.
- [ ] **Step 2: `types/chat.ts`** — add:
```ts
export type ChatSystemEvent =
    | { type: "status_changed"; from: string | null; to: string; actor_name?: string | null }
    | { type: "assigned"; to: string | null; actor_name?: string | null }
    | { type: "delivered" };
```
and extend `ChatMessage` with `is_system?: boolean;` and `system_event?: ChatSystemEvent | null;`. Make `sender_id` `string | null` on `ChatMessage` (it's now nullable for system rows) — then fix any non-null assumption at call sites the type-checker flags (sender resolution should fall back when `sender_id` is null).
- [ ] **Step 3: `use-order-actions.ts`** — `useAssignOrder()` → `chat_assign_order`; `useSetConversationResolved()` → `chat_set_conversation_resolved`; `useOrderForConversation(conversationId)` → finds the conversation's `order_id` (via `useConversations`) then the live `Order` from `useOrdersContext`. Invalidate orders + conversations queries on the mutations.
- [ ] **Step 4: Verify (type-check surfaces every nullable-sender call site) + commit.**

```bash
git -C /Users/ali/scheniders-mono add apps/platform/types/order.ts apps/platform/types/chat.ts apps/platform/hooks/chat/use-order-actions.ts
git -C /Users/ali/scheniders-mono commit -m "feat(chat): order-action hooks + system-event/nullable-sender types"
```

---

## Task 3: Render system events (C3)

**Files:** Modify `apps/platform/components/chat/message-item.tsx`, `apps/platform/hooks/chat/use-messages.ts`, `apps/platform/components/chat/message-list.tsx`

- [ ] **Step 1: `message-item.tsx`** — when `message.is_system`, render a centered muted pill (no `ChatAvatar`/bubble) with localized text from `message.system_event`:
  - `status_changed` → `t("chat.event.statusChanged", "{actor} changed status to {to}", { actor: actorName, to: statusLabel(to) })` where `statusLabel` reuses the app's order-status registry (`PIPELINE_STAGE_REGISTRY`/status label util) for a localized label.
  - `assigned` → `t("chat.event.assigned", "{actor} assigned this to {who}", { actor, who: memberName(to) })` (resolve `to` via the tenant-members map; null `to` → unassigned → `t("chat.event.unassigned", ...)`).
  - `delivered` → `t("chat.event.delivered", "Order delivered")`.
  Restrained styling (pastel chip, small, centered); respects reduced-motion.
- [ ] **Step 2: `use-messages.ts`** — ensure the realtime `message:new` path carries `is_system`/`system_event` (the broadcast now includes them; the hydrate-from-DB branch already `select('*')` so it's covered — just confirm the optimistic/echo paths don't strip them; system rows are never optimistic so no special-case needed).
- [ ] **Step 3: `message-list.tsx`** — system rows have `sender_id = null`; the sender lookup (`memberMap.get(m.sender_id)`) must not crash on null. `MessageItem` handles its own system rendering, so the list just passes the message through; the `aria-live` announcement should skip system rows (or announce them plainly). Day-separator + key logic unaffected (`client_msg_id ?? id` — system rows have null client_msg_id → key = id).
- [ ] **Step 4: Verify + commit.**

```bash
git -C /Users/ali/scheniders-mono add apps/platform/components/chat/message-item.tsx apps/platform/hooks/chat/use-messages.ts apps/platform/components/chat/message-list.tsx
git -C /Users/ali/scheniders-mono commit -m "feat(chat): render order system events as localized pills"
```

---

## Task 4: Live order card (C4)

**Files:** Create `apps/platform/components/chat/order-thread-card.tsx`; Modify `apps/platform/components/chat/chat-sheet.tsx`

- [ ] **Step 1: `order-thread-card.tsx`** — props `{ conversationId: string }`. Uses `useOrderForConversation`. Renders a pinned card at the top of an order thread: order display id, live status chip (registry colors), total IQD (`formatIQD`), customer name, and `tel:`/`wa.me` quick buttons (build `wa.me` from `phone`). If the order isn't loaded, render a minimal header (name only). All labels via `t()`.
- [ ] **Step 2: `chat-sheet.tsx`** — when the active conversation `kind === 'order'`, render `<OrderThreadCard conversationId={activeConversationId} />` between the header and the `MessageList`.
- [ ] **Step 3: Verify + commit.**

```bash
git -C /Users/ali/scheniders-mono add apps/platform/components/chat/order-thread-card.tsx apps/platform/components/chat/chat-sheet.tsx
git -C /Users/ali/scheniders-mono commit -m "feat(chat): live order card pinned in order threads"
```

---

## Task 5: Order-thread action bar (C1 + C2-explicit + C6 toggle)

**Files:** Create `apps/platform/components/chat/order-action-bar.tsx`; Modify `apps/platform/components/chat/order-thread-card.tsx` (mount it) or `chat-sheet.tsx`

- [ ] **Step 1: `order-action-bar.tsx`** — for an order thread: a **status dropdown** (reuse the app's status options + `useUpdateStatusMutation`; pass `last_status_changed_by_name`/`_avatar` from the current user so the auto-event has an actor), an **Assign** control (teammate picker via `useTenantMembers` → `useAssignOrder`), and a **resolve/unresolve** toggle (`useSetConversationResolved`, reads `conversation.resolved_at`). Optional internal-note shortcut writes to `orders.internal_notes` (or posts a normal thread message) — keep minimal. All actions optimistic where safe + toast on error; localized.
- [ ] **Step 2:** Mount the action bar in the order card (Task 4) or the order-thread header. Keep it compact.
- [ ] **Step 3: Verify + commit.**

```bash
git -C /Users/ali/scheniders-mono add apps/platform/components/chat/order-action-bar.tsx apps/platform/components/chat/order-thread-card.tsx apps/platform/components/chat/chat-sheet.tsx
git -C /Users/ali/scheniders-mono commit -m "feat(chat): order-thread action bar (status/assign/resolve)"
```

---

## Task 6: "Discuss this order" launcher (C5)

**Files:** Modify `apps/platform/components/orders/order-details-modal.tsx` (+ order row actions if straightforward)

- [ ] **Step 1:** Add a "Discuss" button to the order-details modal header/actions → `useStartOrderConversation().mutateAsync(order.id)` then `useChatStore().open(convId)` (opens the chat dialog to that thread). Localized label `t("chat.discussOrder","Discuss")`. If wiring into the order *row* actions is clean, add it there too; otherwise modal-only for v1 (note it).
- [ ] **Step 2: Verify + commit.**

```bash
git -C /Users/ali/scheniders-mono add apps/platform/components/orders/order-details-modal.tsx
git -C /Users/ali/scheniders-mono commit -m "feat(chat): Discuss-this-order launcher from order details"
```

---

## Task 7: Unresolved triage filter (C6)

**Files:** Modify `apps/platform/components/chat/conversation-list.tsx`

- [ ] **Step 1:** In the Orders section (the 2B `OrderSection`), add an "Unresolved only" toggle that filters order threads to those with `resolved_at == null`. Resolved threads get a subtle ✓ marker on the row. `resolved_at` comes from `ConversationWithMeta` (add it to the `useConversations` select if not already returned — check + extend the select to include `resolved_at`).
- [ ] **Step 2: Verify + commit.**

```bash
git -C /Users/ali/scheniders-mono add apps/platform/components/chat/conversation-list.tsx apps/platform/hooks/chat/use-conversations.ts
git -C /Users/ali/scheniders-mono commit -m "feat(chat): unresolved order-thread triage filter"
```

---

## Task 8: i18n + gates + types

**Files:** Modify `apps/platform/lib/i18n.ts`

- [ ] **Step 1:** Add EN+AR keys: `chat.event.statusChanged`, `chat.event.assigned`, `chat.event.unassigned`, `chat.event.delivered`, `chat.changeStatus`, `chat.assign`, `chat.assignTo`, `chat.assigned`, `chat.addNote`, `chat.discussOrder`, `chat.resolve`, `chat.unresolve`, `chat.resolved`, `chat.unresolvedOnly`, `chat.call`, `chat.whatsapp`, plus any others the components reference. Use single-brace `{param}` interpolation.
- [ ] **Step 2:** `i18n-completeness` + type-check + lint (0 errors). Regenerate types via `mcp__supabase__generate_typescript_types` → write `packages/supabase/src/database.types.ts` → confirm diff is only the new functions + `chat_messages` columns + `resolved_at` → type-check → commit.
- [ ] **Step 3: Commit i18n.**

```bash
git -C /Users/ali/scheniders-mono add apps/platform/lib/i18n.ts
git -C /Users/ali/scheniders-mono commit -m "i18n(chat): Phase 5 order-superpowers strings (en+ar)"
```

---

## Task 9: Holistic review + live smoke
- [ ] Final reviewer over the diff: schema change didn't regress normal messaging; system events render localized + don't crash on null sender; the orders trigger never writes `orders` (no loop); `chat_post_order_event` is internal (no authenticated grant); `chat_assign_order` tenant-guards; resolve gating; no `any`/`@ts-ignore`/unjustified disable; i18n EN+AR complete.
- [ ] Live 2-user: open an order thread; change status from the action bar → both see the system pill + the live card updates; assign → assignee event posts; resolve → triage filter reflects it; "Discuss" opens the thread.

---

## Self-Review (coverage map)
- **C1 act-on-order** → Task 5 (action bar) + existing `useUpdateStatusMutation`.
- **C2 assign (explicit)** → Task 1 (`chat_assign_order`) + 2 (hook) + 5 (Assign control).
- **C3 auto-events** → Task 1 (orders trigger + `chat_post_order_event` + broadcast) + 3 (render).
- **C4 live card** → Task 4.
- **C5 Discuss launcher** → Task 6.
- **C6 resolve + triage** → Task 1 (`resolved_at` + RPC) + 5 (toggle) + 7 (filter).
- **C7** → deferred. **schema/i18n/types/review** → Tasks 1, 8, 9.
