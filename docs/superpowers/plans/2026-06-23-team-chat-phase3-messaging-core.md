# Team Chat — Phase 3: Messaging Core — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Enrich the timeline — quote-reply, pins, reaction-detail, forward, edit-history, draft persistence, send-failure UI.

**Architecture (revised after backend check):** Almost entirely **client-side**. `chat_pins` already has a member-gated `FOR ALL` RLS policy → pin/unpin are direct table writes (no RPC). Forward + reply reuse the existing `chat_send_message` RPC (it already accepts `p_reply_to_id` + `p_references`). Reaction-detail/draft/send-failure are pure client. **Only A6 edit-history needs a migration** (new `chat_message_edits` table + BEFORE-UPDATE trigger) — and the Supabase MCP is currently DOWN, so A6's migration is DRAFTED now and applied when MCP returns; its UI ships with it. A1–A5, A7, A8 ship fully now.

**Decision (locked):** quote-reply (not full thread panels).

**Spec:** `docs/superpowers/specs/2026-06-22-team-chat-phase3-messaging-core-design.md` (note: §2.1/§2.3 RPCs are superseded by the simpler RLS/existing-RPC reality below).

**Conventions:** `pnpm` needs `export PATH="/opt/homebrew/bin:$PATH"`. Gates: type-check + lint (0 errors) + vitest. Commit trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. `git -C /Users/ali/scheniders-mono`. `supabase.rpc`/`.from` loosely typed.

---

## Task 1: A6 edit-history migration (DRAFT — apply when MCP returns)

**Files:** Create `packages/supabase/migrations/20260623100000_chat_message_edits.sql`

- [ ] **Step 1: Write the migration**

```sql
-- =============================================
-- CHAT PHASE 3: message edit history
-- =============================================
CREATE TABLE IF NOT EXISTS public.chat_message_edits (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id uuid NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
    prev_body  text NOT NULL,
    edited_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chat_message_edits_message_idx ON public.chat_message_edits (message_id, edited_at DESC);

ALTER TABLE public.chat_message_edits ENABLE ROW LEVEL SECURITY;
-- members of the message's conversation may read its edit history; no client writes (trigger-only)
CREATE POLICY chat_message_edits_member_read ON public.chat_message_edits
    FOR SELECT USING (EXISTS (
        SELECT 1 FROM public.chat_messages m
        WHERE m.id = message_id AND public.chat_is_member(m.conversation_id)
    ));

-- capture the prior body on a real edit (not a soft-delete, not a system row)
CREATE OR REPLACE FUNCTION public.chat_capture_edit()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
    IF OLD.body IS DISTINCT FROM NEW.body
       AND OLD.deleted_at IS NULL
       AND COALESCE(OLD.is_system, false) = false THEN
        INSERT INTO public.chat_message_edits (message_id, prev_body) VALUES (OLD.id, OLD.body);
    END IF;
    RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_chat_capture_edit ON public.chat_messages;
CREATE TRIGGER trg_chat_capture_edit
    BEFORE UPDATE OF body ON public.chat_messages
    FOR EACH ROW EXECUTE FUNCTION public.chat_capture_edit();
```

- [ ] **Step 2: Commit (drafted, not applied — MCP down).**

```bash
git -C /Users/ali/scheniders-mono add packages/supabase/migrations/20260623100000_chat_message_edits.sql
git -C /Users/ali/scheniders-mono commit -m "feat(chat): message edit-history table + capture trigger (Phase 3, apply when MCP up)"
```

- [ ] **Step 3 (deferred, when MCP returns):** apply; advisor; smoke — an edit inserts one `chat_message_edits` row with the OLD body; a soft-delete does NOT; RLS lets a member read history, a non-member cannot; regenerate types.

---

## Task 2: Client data layer (pins / forward / reaction-detail / draft / send-failure)

**Files:** Create `apps/platform/hooks/chat/use-pins.ts`; Modify `apps/platform/store/use-chat-store.ts`, `apps/platform/hooks/chat/use-messages.ts`

- [ ] **Step 1: `use-pins.ts`** — direct table ops (RLS-gated; no RPC):
```ts
// query pins for a conversation, joined to the message
export function usePins(conversationId: string | null) {
    return useQuery({
        queryKey: [...chatKeys.all, "pins", conversationId] as const,
        enabled: !!conversationId,
        queryFn: async () => {
            const { data, error } = await supabase
                .from("chat_pins")
                .select("message_id, pinned_at, message:chat_messages(id, body, sender_id, created_at, is_system)")
                .eq("conversation_id", conversationId!)
                .order("pinned_at", { ascending: false });
            if (error) throw error;
            return data ?? [];
        },
    });
}
// pin: insert { conversation_id, message_id, pinned_by: auth.uid() }; unpin: delete by (conversation_id, message_id).
// each invalidates the pins query.
```
Implement `usePinMessage(conversationId)` + `useUnpinMessage(conversationId)` (get the current user id from `useAuth`). Invalidate the pins key on success.

- [ ] **Step 2: Draft persistence in `use-chat-store.ts`** — add `drafts: Record<string, string>` + `setDraft(conversationId, text)` + `clearDraft(conversationId)`. Wrap the store with `persist` (from `zustand/middleware`) persisting ONLY `drafts` (use `partialize`) to localStorage key `chat-drafts`. Keep all existing fields/actions (transient ones excluded from persistence).

- [ ] **Step 3: Send-failure in `use-messages.ts`** — the `sendMessage` mutation's `onError` currently rolls the optimistic row back silently. Change it to MARK the optimistic row `failed: true` (keep it visible) instead of removing it, and expose a `retrySend(clientMsgId)` that re-runs the mutation for that row. Add `failed?: boolean` to `ChatMessage` (client-only flag, already has `pending?`).

- [ ] **Step 4: Verify (type-check + lint) + commit.**

```bash
git -C /Users/ali/scheniders-mono add apps/platform/hooks/chat/use-pins.ts apps/platform/store/use-chat-store.ts apps/platform/hooks/chat/use-messages.ts apps/platform/types/chat.ts
git -C /Users/ali/scheniders-mono commit -m "feat(chat): pins/draft/send-failure client data layer"
```

---

## Task 3: Per-message action menu + quote-reply + reaction detail

**Files:** Modify `apps/platform/components/chat/message-item.tsx`; Create `apps/platform/components/chat/message-actions.tsx`

- [ ] **Step 1: `message-actions.tsx`** — a hover/overflow action menu for a message: Reply, Pin/Unpin, Forward, (Edit/Delete for own messages), Copy. Props receive the message + callbacks. Reuse `@scheniders/ui` Popover/Tooltip. (Edit/Delete may already exist in `message-item` — consolidate them here; don't regress.)
- [ ] **Step 2: Quote-reply rendering in `message-item.tsx`** — when `message.reply_to_id` is set, render an inline quoted preview of the parent above the body: resolve the parent from the loaded messages (passed down or via a lookup map from `message-list`), show sender + truncated body; click → `useChatStore().openMessage(conversation_id, reply_to_id)` (jump). If the parent isn't loaded, show `t("chat.originalMessage","Original message")` and still jump (opens conversation).
- [ ] **Step 3: Reaction detail** — on a reaction chip in `reaction-bar.tsx` (or message-item), add a `Tooltip`/`Popover` listing reactor display names (resolve `reaction.user_id` → tenant-members map), grouped by emoji. No new fetch (reactions already on the message).
- [ ] **Step 4: Reply target wiring** — "Reply" sets a `replyTo` message in the composer (lift state to chat-sheet or a store field `replyToId`); the composer shows the quoted target chip and passes `replyToId` into `sendMessage` (the RPC already takes `p_reply_to_id`); clear on send.
- [ ] **Step 5: Verify + commit.**

```bash
git -C /Users/ali/scheniders-mono add apps/platform/components/chat/message-item.tsx apps/platform/components/chat/message-actions.tsx apps/platform/components/chat/reaction-bar.tsx
git -C /Users/ali/scheniders-mono commit -m "feat(chat): message action menu, quote-reply, reaction detail"
```

---

## Task 4: Composer — reply chip + draft + send-failure retry

**Files:** Modify `apps/platform/components/chat/composer.tsx`, `apps/platform/components/chat/chat-sheet.tsx`

- [ ] **Step 1:** Composer seeds its text from `useChatStore` draft for the active conversation; writes to the draft on change (debounced); clears the draft on successful send. Add a "replying to" chip when `replyToId` is set (with the quoted parent + an ✕ to cancel); pass `replyToId` to `onSend`; clear after send.
- [ ] **Step 2:** Wire `replyToId` through `chat-sheet.tsx` (store field) so the message "Reply" action sets it and the composer reads it.
- [ ] **Step 3: Verify + commit.**

```bash
git -C /Users/ali/scheniders-mono add apps/platform/components/chat/composer.tsx apps/platform/components/chat/chat-sheet.tsx apps/platform/store/use-chat-store.ts
git -C /Users/ali/scheniders-mono commit -m "feat(chat): composer reply chip + per-conversation drafts"
```

---

## Task 5: Pinned bar

**Files:** Create `apps/platform/components/chat/pinned-bar.tsx`; Modify `apps/platform/components/chat/chat-sheet.tsx`

- [ ] **Step 1: `pinned-bar.tsx`** — a collapsible bar at the top of the message area showing pinned-message count + previews (from `usePins`); click a pin → `openMessage` (jump); unpin from the bar. Hidden when no pins. Built to the visual bar.
- [ ] **Step 2:** Mount it in `chat-sheet.tsx` above `MessageList` (below the order card for order threads).
- [ ] **Step 3: Verify + commit.**

```bash
git -C /Users/ali/scheniders-mono add apps/platform/components/chat/pinned-bar.tsx apps/platform/components/chat/chat-sheet.tsx
git -C /Users/ali/scheniders-mono commit -m "feat(chat): pinned-messages bar"
```

---

## Task 6: Forward picker + send-failure UI

**Files:** Create `apps/platform/components/chat/forward-dialog.tsx`; Modify `apps/platform/components/chat/message-item.tsx`

- [ ] **Step 1: `forward-dialog.tsx`** — opened from a message's "Forward" action. A conversation picker (reuse the 2B fuzzy list / `conversation-jump` pattern) → on pick, call `sendMessage` for the TARGET conversation with the source message's `body` + copied `references` + a fresh `clientMsgId` (membership of the target is enforced server-side by `chat_send_message`). Toast on success/error. (Forward = reuse of the existing send RPC; no new RPC.)
- [ ] **Step 2: Send-failure UI in `message-item.tsx`** — when `message.failed`, render a red "Failed to send — Retry / Delete" affordance (Retry → `retrySend(client_msg_id)`; Delete → drop the optimistic row). Replaces the silent rollback.
- [ ] **Step 3: Verify + commit.**

```bash
git -C /Users/ali/scheniders-mono add apps/platform/components/chat/forward-dialog.tsx apps/platform/components/chat/message-item.tsx
git -C /Users/ali/scheniders-mono commit -m "feat(chat): forward-to-conversation + send-failure retry UI"
```

---

## Task 7: Edit-history viewer (ships with A6 when MCP is up) + i18n + gates

**Files:** Create `apps/platform/components/chat/edit-history-dialog.tsx` + `apps/platform/hooks/chat/use-message-edits.ts`; Modify `apps/platform/components/chat/message-item.tsx`, `apps/platform/lib/i18n.ts`

- [ ] **Step 1: `use-message-edits.ts`** — lazy `useQuery` over `chat_message_edits` for a message id (enabled only when the viewer opens). The table is created by Task 1's migration; the hook compiles regardless (loose typing) and returns [] until the table exists.
- [ ] **Step 2: `edit-history-dialog.tsx`** — the "(edited)" badge in `message-item` becomes a button opening a dialog listing prior versions (prev_body + edited_at) newest-first. Until A6 is applied live, it shows an empty state — acceptable; note it.
- [ ] **Step 3: i18n** — add EN+AR keys: `chat.reply`, `chat.replyingTo`, `chat.cancelReply`, `chat.pin`, `chat.unpin`, `chat.pinned`, `chat.pinnedMessages`, `chat.forward`, `chat.forwardTo`, `chat.forwarded`, `chat.editHistory`, `chat.reactedBy`, `chat.sendFailed`, `chat.retry`, `chat.deleteFailed`, `chat.originalMessage`, `chat.copy`, `chat.copied`, plus action-menu labels. Verify `i18n-completeness`.
- [ ] **Step 4: Gates + commit.** type-check + lint (0) + i18n test.

```bash
git -C /Users/ali/scheniders-mono add apps/platform/components/chat/edit-history-dialog.tsx apps/platform/hooks/chat/use-message-edits.ts apps/platform/components/chat/message-item.tsx apps/platform/lib/i18n.ts
git -C /Users/ali/scheniders-mono commit -m "feat(chat): edit-history viewer + Phase 3 i18n (en+ar)"
```

---

## Task 8: Holistic review + smoke
- [ ] Final reviewer over the Phase-3 diff: pins RLS-gated (members only); forward re-checks target membership (it does — via `chat_send_message`); reply jump uses `openMessage`; reaction-detail no extra fetch; draft persist doesn't leak across conversations + clears on send; send-failure retry idempotent (reuses `client_msg_id`); edit-history RLS; no `any`/`@ts-ignore`/non-null `!`/unjustified disable; i18n EN+AR; no Phase-1/2A/2B/5 regression.
- [ ] When MCP returns: apply Task 1, smoke edit-history, regenerate types, then live 2-user (reply jumps, pin syncs, reaction names, forward lands, edit history shows, draft persists, failed send retries).

## Self-Review (coverage map)
- **A1+A4 quote-reply** → Task 3 (render + wire) + 4 (composer chip). **A2 pins** → Task 2 (hooks via RLS) + 5 (bar). **A3 reaction detail** → Task 3. **A5 forward** → Task 6 (reuse send RPC). **A6 edit-history** → Task 1 (migration, deferred apply) + 7 (viewer). **A7 draft** → Task 2 + 4. **A8 send-failure** → Task 2 + 6.
