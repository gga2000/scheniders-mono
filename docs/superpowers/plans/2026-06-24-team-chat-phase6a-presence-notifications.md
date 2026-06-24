# Team Chat — Phase 6A: Presence & Notifications (no web-push) — Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Ship the env-unblocked presence/notification UX — on-order viewers (F1), last-seen on DM header (F4), per-conversation mute (G2), favicon/title unread badge (G4), new-message sound (G5), mark-all-read (G6) — plus a drafted migration for status-presets/DND/prefs (F2/F3/G3) to apply when MCP is stable. Web push (G1) is its own later spec.

**Architecture:** 6A is client-only (mute reuses the existing self-updatable `chat_members.muted`; favicon/sound/last-seen/on-order are client; mark-all-read loops `chat_mark_read`). The F2/F3/G3 migration is drafted but NOT applied (MCP flaky).

**Tech Stack:** React 19, TanStack Query, zustand, Web Audio/Canvas, Tailwind v4 tokens, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-24-team-chat-phase6-presence-notifications-design.md`.

**Conventions:** `pnpm` needs `export PATH="/opt/homebrew/bin:$PATH"`. Gates: type-check + lint (0) + vitest. Commit trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. `git -C /Users/ali/scheniders-mono`. Preserve the single-presence-subscription invariant (F1 uses the per-resource `use-presence`, NOT a 2nd tenant channel). LTR; `t()` EN+AR.

---

## Task 1: Draft the F2/F3/G3 migration (NOT applied — MCP flaky)

**Files:** Create `packages/supabase/migrations/20260624100000_chat_presence_prefs.sql`

- [ ] **Step 1: Write** (drafted only):
```sql
-- CHAT PHASE 6A-db: status presets / DND / notification prefs
ALTER TABLE public.chat_user_status ADD COLUMN IF NOT EXISTS preset text;
ALTER TABLE public.chat_user_status ADD COLUMN IF NOT EXISTS expires_at timestamptz;
ALTER TABLE public.chat_user_status ADD COLUMN IF NOT EXISTS dnd boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.chat_notification_prefs (
    user_id   uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    kind      text NOT NULL CHECK (kind IN ('channel','dm','group','order')),
    level     text NOT NULL DEFAULT 'all' CHECK (level IN ('all','mentions','none')),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, tenant_id, kind)
);
ALTER TABLE public.chat_notification_prefs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS chat_notification_prefs_self ON public.chat_notification_prefs;
CREATE POLICY chat_notification_prefs_self ON public.chat_notification_prefs
    FOR ALL USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid() AND tenant_id IN (SELECT get_user_tenant_ids()));

-- mark-all-read RPC (caller's own memberships only)
CREATE OR REPLACE FUNCTION public.chat_mark_all_read()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
    UPDATE public.chat_members SET last_read_at = now() WHERE user_id = auth.uid();
$$;
REVOKE EXECUTE ON FUNCTION public.chat_mark_all_read() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.chat_mark_all_read() TO authenticated;
```
- [ ] **Step 2: Commit (drafted, not applied).** Note in the message it awaits MCP.
```bash
git -C /Users/ali/scheniders-mono add packages/supabase/migrations/20260624100000_chat_presence_prefs.sql
git -C /Users/ali/scheniders-mono commit -m "feat(chat): Phase 6A-db migration — status presets/DND/prefs + mark_all_read (drafted, apply when MCP stable)"
```

---

## Task 2: Mute hook + ConversationWithMeta `muted` (G2 data)

**Files:** Modify `apps/platform/hooks/chat/use-conversations.ts`

- [ ] **Step 1:** `ConversationWithMeta` already selects `members(user_id,last_read_at,role)`. Add `muted` to that select + expose `my_muted: boolean` on the mapped row (from the caller's member row, like `my_last_read_at`). Add `useToggleMute()` mutation: `supabase.from("chat_members").update({ muted }).eq("conversation_id", id).eq("user_id", user.id)` (the self-update RLS allows `muted`); invalidate `chatKeys.conversations()`.
- [ ] **Step 2: type-check + lint + commit** (`feat(chat): muted on conversations + toggle-mute hook`).

---

## Task 3: Favicon + title unread badge (G4)

**Files:** Create `apps/platform/hooks/chat/use-favicon-badge.ts`; Modify `apps/platform/components/chat/chat-runtime.tsx`

- [ ] **Step 1:** `useFaviconBadge(totalUnread)` — when `totalUnread > 0`, prefix `document.title` with `(N) ` and draw a small red badge on a canvas-derived favicon (clone the existing `<link rel=icon>`, draw the count, swap href); restore the original title + favicon when it returns to 0 / on unmount. Guard SSR. Pure count→display is testable; the DOM side is best-effort.
- [ ] **Step 2:** In `chat-runtime.tsx`, compute total unread from `useConversations()` **excluding muted** (`c.unread` where `!c.my_muted`) and pass to `useFaviconBadge`.
- [ ] **Step 3: type-check + lint + commit** (`feat(chat): favicon + title unread badge`).

---

## Task 4: New-message sound (G5)

**Files:** Create `apps/platform/hooks/chat/use-notification-sound.ts`; Modify `apps/platform/store/use-chat-store.ts` (a persisted `soundEnabled`), `apps/platform/hooks/chat/use-unread-inbox.ts`

- [ ] **Step 1:** Add `soundEnabled: boolean` (default true) + `setSoundEnabled` to the chat store, persisted (localStorage). `use-notification-sound.ts` — exposes `playChime()` using a short Web Audio beep (no asset dep) or a tiny bundled sound; debounced (≤1/sec).
- [ ] **Step 2:** In `use-unread-inbox.ts` (the `inbox:new` handler), call `playChime()` when: `soundEnabled` AND the message's conversation is NOT muted AND NOT the currently-active+open conversation. (The handler already knows the conversation; resolve muted from the conversations cache; active from the chat store.)
- [ ] **Step 3: type-check + lint + commit** (`feat(chat): new-message sound (mute + active aware, toggle)`).

---

## Task 5: Mute UI + muted styling (G2 UI)

**Files:** Modify `apps/platform/components/chat/conversation-menu.tsx`, `apps/platform/components/chat/conversation-list.tsx`

- [ ] **Step 1:** Add a **Mute/Unmute** item to `ConversationMenu` (next to Archive/Leave) → `useToggleMute`. Label by `conversation.my_muted`.
- [ ] **Step 2:** In `conversation-list.tsx` rows, when `my_muted`: dim the row + show a small muted (bell-off) icon, and suppress the unread badge (muted convs shouldn't shout). Keep the conversation reachable.
- [ ] **Step 3: type-check + lint + commit** (`feat(chat): per-conversation mute UI`).

---

## Task 6: Mark-all-read (G6)

**Files:** Modify `apps/platform/components/chat/conversation-list.tsx`; Create `apps/platform/hooks/chat/use-mark-all-read.ts`

- [ ] **Step 1:** `useMarkAllRead()` — loops the unread conversations from `useConversations()` and calls `supabase.rpc("chat_mark_read", { p_conversation_id })` for each (the `chat_mark_all_read` RPC from Task 1 is preferred but unapplied; use the client loop now, swap to the RPC once the migration lands). Invalidate conversations.
- [ ] **Step 2:** A "Mark all read" button in the conversation-list header (shown when total unread > 0). Localized.
- [ ] **Step 3: type-check + lint + commit** (`feat(chat): mark-all-read`).

---

## Task 7: On-order viewers (F1) + last-seen DM header (F4)

**Files:** Modify `apps/platform/components/chat/order-thread-card.tsx` (or order header), `apps/platform/components/chat/chat-sheet.tsx`; Create `apps/platform/hooks/chat/use-last-seen.ts`

- [ ] **Step 1 (F1):** In the order-thread surface, mount `use-presence` on the order resource (resourceId = the order id; reuse the existing `use-presence` hook EXACTLY — it's a per-resource channel, NOT the tenant presence one) and render an "also viewing" avatar cluster (ChatAvatar) of the other viewers in the order-thread card/header. Only when an order thread is active.
- [ ] **Step 2 (F4):** `useLastSeen(userId)` — query `chat_user_status.last_seen_at` for the DM peer (cached, staleTime). In `chat-sheet.tsx`, when the active conversation is a DM, render "active {relative} ago" in the header (resolve the peer = the other member). Use the live presence-store status first (online → "active now"), else last-seen.
- [ ] **Step 3: type-check + lint + commit** (`feat(chat): on-order viewers + last-seen on DM header`).

---

## Task 8: i18n + gates + review

**Files:** Modify `apps/platform/lib/i18n.ts`

- [ ] **Step 1:** EN+AR for `chat.mute`/`chat.unmute`/`chat.muted`/`chat.markAllRead`/`chat.alsoViewing`/`chat.activeAgo`/`chat.activeNow`/`chat.soundOn`/`chat.soundOff`/`chat.notificationSettings` + any others used. Verify `i18n-completeness`.
- [ ] **Step 2:** type-check + lint (0) + vitest (i18n + any pure tests). Holistic review: single-presence-subscription invariant intact (F1 uses per-resource channel); favicon restores; sound respects mute+active+toggle; mute reuses the self-update RLS (no privilege change); mark-all-read loop bounded; no Phase-1..5 regression; no `any`/disable/`!`; i18n EN+AR.

## Self-Review (coverage map)
- F1 → Task 7. F4 → Task 7. G2 → Tasks 2 (data) + 5 (UI). G4 → Task 3. G5 → Task 4. G6 → Task 6. F2/F3/G3 migration → Task 1 (drafted). G1 web-push → deferred (6B).
