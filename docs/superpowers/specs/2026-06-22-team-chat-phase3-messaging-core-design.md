# Team Chat — Phase 3: Messaging Core — Design

**Date:** 2026-06-22
**Branch:** `feat/team-chat-presence`
**Parent roadmap:** `docs/superpowers/specs/2026-06-21-team-chat-enhancements-design.md` §6 Phase 3 (category A).
**Status:** Draft — one decision pending (§8).

---

## 1. Context

Phases 1/2A/2B/5 shipped + applied live. Phase 3 enriches the message timeline itself. Backend facts (verified earlier + against migrations): `chat_messages.reply_to_id` exists (FK, **unused in UI**); `chat_pins` table exists (PK `(conversation_id, message_id)`, `pinned_by`, `pinned_at`) but has **no RPC/UI**; reactions live in `chat_message_reactions` (grouped client-side, no "who reacted" detail); `chat_messages.edited_at` exists but there's **no edit-history table**; `chat_send_message` is the idempotent send path; optimistic send has `onError` rollback but **no visible failure/retry state**.

### In scope (A1–A8)
- **A1 + A4 — Quote-reply** (see §8 decision): reply to a message → the reply stores `reply_to_id` and renders an inline quoted preview of the parent; click → jump to original. (Compact "reply" model, not full Slack thread panels — §8.)
- **A2 — Pins:** pin/unpin a message (uses existing `chat_pins`); a pinned bar at the top of the conversation; jump to a pinned message.
- **A3 — Reaction detail:** hover/tap a reaction → who reacted (names), grouped by emoji.
- **A5 — Forward:** forward a message (body + references) to another conversation.
- **A6 — Edit history:** every edit is recorded; "(edited)" → view prior versions.
- **A7 — Draft persistence:** per-conversation composer draft survives close/reload (client-side).
- **A8 — Send-failure UI:** a failed optimistic send shows a clear failed state + retry/delete.

### Non-negotiables
- New RPCs `SECURITY DEFINER`, `search_path=public,pg_temp`, membership-gated (`chat_is_member`), `authenticated`-only. New tables RLS + tenant-scoped from creation.
- LTR; every string `t()` EN+AR. Built to the Phase-1 visual bar. Reuse the existing reply-jump/scroll-to-message infra from 2B (`focusMessageId`/`openMessage`).

---

## 2. Data model & migration

Migration `20260622120000_chat_messaging_core.sql`.

### 2.1 Pins (A2) — table exists; add RPCs + RLS check
- `chat_pins` already exists. Confirm/ensure RLS: SELECT gated on `chat_is_member(conversation_id)`; no direct client INSERT/DELETE (use RPCs).
- RPC `chat_pin_message(p_conversation_id uuid, p_message_id uuid)` — membership-gated; `INSERT INTO chat_pins (..., pinned_by=auth.uid()) ON CONFLICT DO NOTHING`. Broadcast `conversation:update` (or a `pins:update` event) so the pinned bar refreshes live.
- RPC `chat_unpin_message(p_conversation_id uuid, p_message_id uuid)` — membership-gated DELETE.

### 2.2 Edit history (A6) — new table + trigger
- `chat_message_edits (id uuid pk, message_id uuid fk→chat_messages on delete cascade, prev_body text, edited_at timestamptz default now())`. RLS: SELECT gated on membership of the message's conversation (`chat_is_member` via join). No client writes — populated by trigger.
- `BEFORE UPDATE` trigger on `chat_messages`: when `OLD.body IS DISTINCT FROM NEW.body` AND `OLD.deleted_at IS NULL` (a real edit, not a delete), insert a `chat_message_edits` row capturing `OLD.body`. (Skips system rows — they're never edited.)

### 2.3 Forward (A5) — RPC
- RPC `chat_forward_message(p_message_id uuid, p_target_conversation_id uuid, p_client_msg_id text)` — assert membership of BOTH source (read) and target (write); copy the source `body` + its `chat_message_references` snapshots into a new message in the target (via the existing insert path / mirror `chat_send_message`'s reference handling); prepend a "forwarded" marker in `system_event` or a `forwarded_from` note. Idempotent on `p_client_msg_id`.

### 2.4 No schema change for A1/A4 (reply), A3 (reaction detail), A7 (draft), A8 (failure)
Reply uses the existing `reply_to_id`. Reaction detail reads existing `chat_message_reactions` + members. Draft + failure are client-only.

### 2.5 Verification
Apply live (MCP up); advisor; smoke — pin/unpin membership-gated; edit-history captures prior body on edit (and NOT on soft-delete); forward copies into target only for members of both; RLS on the new table.

---

## 3. Hooks
- `usePins(conversationId)` — query `chat_pins` joined to messages; `usePinMessage`/`useUnpinMessage`.
- `useMessageEdits(messageId)` — lazy query `chat_message_edits` (only when the history viewer opens).
- `useForwardMessage()` — `chat_forward_message`.
- `useReactionDetail` — derive from the already-loaded `message.reactions` + tenant-members map (no new fetch).
- Draft (A7): extend `use-chat-store` with `drafts: Record<conversationId, string>` persisted via `zustand/middleware persist` (localStorage) — composer reads/writes its conversation's draft.
- Send-failure (A8): `useMessages` `sendMessage` already has optimistic + `onError`; add a `failed` flag to the optimistic row on error (instead of silent rollback) + a `retrySend`.

## 4. UI
- **Reply (A1/A4):** a "Reply" action on each message → composer shows a quoted target chip; the sent message renders the quoted parent inline (truncated, clickable → `openMessage`). `message-item.tsx` renders the reply preview from `reply_to_id` (resolve the parent from the loaded set; if not loaded, show "original message").
- **Pins (A2):** a "Pin" action; a collapsible **pinned bar** at the top of the message list (count + previews); click a pin → jump.
- **Reaction detail (A3):** `Tooltip`/`Popover` on a reaction chip listing reactor names.
- **Forward (A5):** a "Forward" action → a conversation picker (reuse the 2B jump/fuzzy list) → `useForwardMessage`.
- **Edit history (A6):** the "(edited)" badge becomes a button → a small dialog listing prior versions (from `useMessageEdits`) with timestamps.
- **Draft (A7):** composer seeds from + writes to the store draft per conversation; clears on successful send.
- **Send-failure (A8):** a failed optimistic row shows a red "Failed — Retry / Delete" affordance.
- Message **action menu**: consolidate per-message actions (Reply, React, Pin, Forward, Edit, Delete, Copy) into a hover/overflow menu on `message-item` (today edit/delete/react are scattered) — keeps the row clean.

## 5. i18n
EN+AR for: `chat.reply`, `chat.replyingTo`, `chat.pin`, `chat.unpin`, `chat.pinned`, `chat.pinnedMessages`, `chat.forward`, `chat.forwardTo`, `chat.forwarded`, `chat.editHistory`, `chat.edited`, `chat.reactedBy`, `chat.draft`, `chat.sendFailed`, `chat.retry`, `chat.originalMessage`, plus action-menu labels. Verify `i18n-completeness`.

## 6. Verification
type-check + lint (0); new pure-helper tests; DB smoke (pins/edit-history/forward membership + RLS); regen types; live 2-user (reply jumps, pins sync, reaction names, forward lands, edit history shows, draft persists, failed send retries).

## 7. Risks
- **Edit-history trigger** runs on the hot `chat_messages` UPDATE path — must be cheap + must NOT fire on soft-delete (guard `OLD.body IS DISTINCT FROM NEW.body AND OLD.deleted_at IS NULL`) or on system rows.
- **Reply/pin resolution when the parent isn't in the loaded 50-message window** — degrade to "original message"/jump-opens-conversation (deep paging is Phase-L, out of scope).
- **Action-menu consolidation** must not regress existing edit/delete/react wiring.
- **Forward** must re-check membership of BOTH conversations server-side (don't trust the client target).

## 8. Decision (LOCKED 2026-06-23)
**Threading model → QUOTE-REPLY.** A reply references one parent (`reply_to_id`), rendered inline as a quoted preview with jump-to-original (reuses the 2B scroll-to-message infra). Covers A1+A4. Full thread panels are NOT built (deferred to a later phase if message volume ever demands it).
