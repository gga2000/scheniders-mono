# Team Chat Enhancements — Master Design

**Date:** 2026-06-21
**Branch:** `feat/team-chat-presence`
**Status:** Approved roadmap; Phase 0 shipped; Phase 1 detailed below.
**Scope owner:** platform app (`apps/platform`)

---

## 1. Context

The team chat (Slack-like channels + DMs + order threads + presence) is a production-grade MVP already shipped on this branch. This document specifies a set of approved enhancements that elevate it to a state-of-the-art, order-ops-centric messaging surface.

This is a **master spec**: it captures the full vision, the data-model/architecture deltas, and a phased roadmap. The total approved scope (47 sub-features across 8 categories) is too large for a single implementation plan, so it is decomposed into sequential phases. **Each phase gets its own detailed implementation plan and verification cycle.** Phase 1 is detailed here because it is next and is the user's explicit priority.

### Existing baseline (do NOT rebuild)
Channels, private channels, 1:1 DMs, order threads, @mentions (auto-join), #order/customer/product references with snapshots, emoji reactions, file attachments, typing indicators, read receipts/unread counts, message edit + soft-delete, presence with idle detection, custom status, last-seen heartbeat, idempotent sends, tenant isolation + RLS on `realtime.messages`. Realtime = broadcast-from-DB triggers (conversation topic + user inbox topic) + presence channel + postgres_changes for notifications. No `/api/chat` routes — everything is RPC + realtime.

### Non-goals (explicitly declined)
- **D — WhatsApp customer bridge** (declined)
- **E — AI summarization / draft replies / translate** (declined)
- **J — moderation/governance/retention** (declined for now)
- **K — analytics/insight** (declined)
- **L — virtualization/pagination/offline/reconnect** (declined for now — revisit if long threads cause perf issues)

---

## 2. Design conventions (apply to ALL phases)

- **Design language:** "Elevated Light Glass" / pastel system. Tokens live in `packages/ui/src/styles/tokens.css` + `apps/platform/app/globals.css`. Use `--card-bg`, `--card-border`, `--background`, `--foreground`, `--muted-foreground`, `--ink`, `--pastel-*`, `--card-radius*`, `--card-shadow*`. Never hardcode hex when a token exists.
- **LTR only** in every locale (incl. Arabic) — set `<html lang>`, never `dir`.
- **i18n:** every user-facing string goes through `t(key, fallback)` (`useLanguage`). Arabic copy required for new strings.
- **No new keyboard shortcuts** unless explicitly requested. Command palette (B2) ships as a clickable button, not a hotkey, unless the user opts in later.
- **Reuse primitives** from `@scheniders/ui`: `Avatar`, `Skeleton`, `Dialog`, `Popover`, `Button`, `Textarea`, `AnimatedList`; `Tooltip` + `EmptyState` from `apps/platform/components/ui`. framer-motion is already in the chat tree.
- **Tenant + RLS from day one** on every new table/column/RPC. New RPCs are `SECURITY DEFINER` and gate on `chat_is_member()` / `get_user_tenant_ids()`; guard service-role checks with `auth.role()` (not `current_user`).
- **Verification gate per phase:** `pnpm --filter @scheniders/platform type-check` + `lint` pass; relevant vitest run; RLS/tenant scoping confirmed for any DB change. CI does not run tests — run them locally.

---

## 3. Phase roadmap

| Phase | Theme | IDs | Status |
|-------|-------|-----|--------|
| 0 | Centered dialog shell | — | ✅ Shipped |
| 1 | **UI foundation** (heavy focus) | M1–M5 | Detailed below |
| 2 | Conversation mgmt + navigation | I1–I5, B1–B5 | Roadmap |
| 3 | Messaging core | A1–A8 | Roadmap |
| 4 | Composer + rich content | H1–H7 | Roadmap |
| 5 | Order superpowers (the moat) | C1–C7 | Roadmap |
| 6 | Presence + notifications | F1–F4, G1–G6 | Roadmap |

Ordering rationale: the UI foundation (1) sets the visual bar every later surface is built to; conversation mgmt + nav (2) reshapes the list/shell before features pile on; messaging core (3) and composer (4) enrich the timeline; order superpowers (5) need those surfaces in place; presence + notifications (6) layer on last.

---

## 4. Phase 0 — Centered dialog shell ✅ (shipped)

`chat-sheet.tsx`: desktop right-drawer → **centered modal** (`w-[min(960px,94vw)] h-[min(680px,86vh)]`, rounded + bordered all sides, scale+fade pop animation, backdrop-click-to-close preserved via non-interactive centering wrapper). Mobile remains full-screen with safe-area padding. Type-check clean.

---

## 5. Phase 1 — UI foundation (DETAILED)

**Goal:** Establish the chat surface's visual system so every later feature is built to one bar. No new business features — this is craft: avatars, loading/empty states, motion, the unread divider, and accessibility. Heavy emphasis per user direction.

### 5.1 New shared util — `avatar-identity` (M2)
**Problem:** No centralized initials/color-hash. `Avatar` (`@scheniders/ui`) falls back to a generic User icon; the only initials fallback is an ad-hoc hardcoded-indigo block in `composer.tsx:393`.

**Build:** `apps/platform/lib/avatar-identity.ts`
- `initials(name: string): string` — 1–2 letters, first letter of first + last token, uppercased, Arabic-safe (handles RTL chars without mangling).
- `colorFromId(id: string): { bg: string; fg: string }` — deterministic hash of stable id → one of the 6 pastel tokens (`--pastel-*`) for `bg`, with `--ink` for `fg`. Same user → same color everywhere. No `Math.random`.
- Pure, unit-tested (`avatar-identity.test.ts`): determinism, Arabic names, empty/single-token, collision spread across the 6 palette buckets.

**Then:** a thin `ChatAvatar` wrapper (`apps/platform/components/chat/chat-avatar.tsx`) composing `@scheniders/ui` `Avatar` + the initials/color fallback + an optional presence ring + status dot. Props: `{ userId, name, avatarUrl?, size?, status?: 'online'|'idle'|'away'|'dnd'|'offline', showStatus? }`. Replaces ad-hoc avatar usage in `message-item`, `conversation-list`, `composer` mention dropdown, `live-presence-stack` (consolidates the status-dot logic that currently lives only in the presence stack).

### 5.2 Online ring + status dot (M2)
Status color mapping (existing convention, centralized in `ChatAvatar`): online `bg-green-500`, idle `bg-amber-500`, away `bg-gray-300`, dnd `--pastel-pink`/red, offline = no dot. Ring = `ring-2 ring-[var(--background)]` so it reads on any surface. Presence source = `useTenantPresence` (already tenant-wide). Avatars in the message list and conversation list opt into `showStatus` where a live presence signal exists; static historical contexts don't.

### 5.3 Skeletons + empty + loading polish (M1)
- Conversation list loading → `Skeleton` rows (reuse `@scheniders/ui` `Skeleton`, already used at `conversation-list.tsx:174`), shaped like real rows (avatar circle + 2 text lines).
- Message list initial load → skeleton message rows (avatar + staggered bubble widths), not a spinner.
- Empty states unified via `EmptyState` (`apps/platform/components/ui/empty-states.tsx`) — distinct copy for: no conversation selected, empty channel, empty DM, empty order thread, no search results (Phase 2 reuses this). Arabic + English copy.
- Composer + send: disabled/loading affordances consistent with `Button` variants.

### 5.4 Restrained motion (M3)
- Message enter: keep existing `opacity 0→1, y 4→0` 180ms; ensure it does NOT replay on realtime re-render of existing messages (only new ones animate — key on `client_msg_id`/`id`).
- Reaction pop: scale `0.8→1` spring on add; count tick.
- Typing dots: keep existing bounce.
- Avatar presence ring: subtle, no infinite ping in the timeline (reserve `animate-ping` for the presence stack only — too noisy per-row).
- Respect `prefers-reduced-motion`: gate non-essential animation.

### 5.5 Unread divider (M4)
A single **"New messages"** divider line rendered in the timeline at the boundary between read and unread, computed from `chat_members.last_read_at` captured at conversation-open time (so it doesn't jump as you read). Sticky-ish label with a pastel rule. Complements the existing jump-to-latest pill and "new messages" prompt in `message-list.tsx`.

### 5.6 Accessibility (M5)
- `aria-live="polite"` region announcing incoming messages (sender + preview) for screen readers.
- Proper roles/labels: dialog has `role="dialog"` + `aria-label`; message list is a labelled log; composer textarea labelled; reaction/close/attach buttons have `aria-label` (some exist).
- Focus management: on open, focus composer (when a conversation is active) or conversation list; on close, return focus to the chat trigger. Esc closes (this is dialog-standard dismissal, not a new app shortcut).
- Color-contrast check on pastel-on-white text per WCAG AA.
- **No** broader keyboard-navigation sweep (out of scope per project convention).

### 5.7 Phase 1 data model
**None.** Phase 1 is purely client/presentation. No migrations.

### 5.8 Phase 1 acceptance
- `avatar-identity` util unit tests pass; same id → same pastel everywhere; Arabic names render sane initials.
- Every chat avatar uses `ChatAvatar` (no ad-hoc initials/User-icon fallbacks remain).
- Loading states are skeletons (no bare spinners); all five empty states have AR+EN copy.
- New messages animate once; existing messages don't replay on realtime updates; reduced-motion respected.
- Unread divider appears at the correct boundary and is stable while reading.
- `aria-live` announces incoming messages; dialog focus trap + restore works; type-check + lint clean.

---

## 6. Phases 2–6 — roadmap (own specs later)

Each phase below lists features + the data-model/architecture delta it will require. Detailed design + acceptance come in that phase's own spec.

### Phase 2 — Conversation mgmt + navigation (I1–I5, B1–B5)
- **I1** create channel / rename / set topic — RPC `chat_create_channel`, `chat_update_conversation`; owner-gated.
- **I2** group DM creation (`kind='group'` exists) — RPC + member-picker UI.
- **I3** archive / leave / delete (`archived_at` exists) — leave = delete own `chat_members` row; archive/delete owner-gated.
- **I4** channel member management (add/remove, roles) — UI over `chat_members`; tighten RLS for add/remove.
- **I5** private channel invite flow.
- **B1** full-text message search — add `tsvector` generated column + GIN index on `chat_messages`; RPC `chat_search_messages` (tenant + membership scoped). Arabic FTS config decision.
- **B2** jump-to-conversation picker (button, not hotkey).
- **B3** conversation-list filters (unread / mentions / kind).
- **B4** scroll-to-unread + date jump (builds on Phase 1 unread divider).
- **B5** search/filter order threads by order status/value (join `orders`).

### Phase 3 — Messaging core (A1–A8)
- **A1** threaded replies (`reply_to_id` exists) — thread panel; add `reply_count` denormalized or computed.
- **A2** pinning (`chat_pins` exists) — fetch/create/delete + pinned bar UI.
- **A3** reaction detail (who reacted) — group `chat_message_reactions` + join members; no schema change.
- **A4** quote-reply inline + jump-to-original.
- **A5** forward message — RPC `chat_forward_message` (re-inserts body + references into target conversation).
- **A6** edit history — new table `chat_message_edits(message_id, prev_body, edited_at)` + trigger on update.
- **A7** draft persistence per conversation — client (zustand-persist/localStorage), no schema.
- **A8** optimistic-send failure UI — surface RPC failure with retry/delete on the optimistic row.

### Phase 4 — Composer + rich content (H1–H7)
- **H1** full emoji picker w/ search — evaluate a lightweight lib vs. bundled dataset; no heavy dep without justification.
- **H2** markdown formatting (bold/italic/lists/code/links) — render in `message-item` with a sanitized minimal renderer.
- **H3** slash commands (`/order`, `/assign`, `/status`) — client registry; order commands call Phase 5 RPCs.
- **H4** voice notes — `MediaRecorder` → upload to `chat-attachments` → audio attachment + waveform/playback; `mime` audio.
- **H5** paste image from clipboard.
- **H6** multi-file attach + upload progress + image dimension extraction (`width/height` columns currently unused).
- **H7** link unfurl — detect URLs, fetch OG metadata server-side (route or edge fn), store + render preview card.

### Phase 5 — Order superpowers (C1–C7) — the moat
- **C1** act-on-order from thread (status / assign / note) — thread header calls existing order mutations.
- **C2** @mention teammate in order thread = auto-assign that order — extend mention handling for `kind='order'`.
- **C3** order thread auto-events — system messages on status/payment/delivery change. Requires a system sender concept: `chat_messages.sender_id` nullable + `is_system boolean` (or `kind`), broadcast unchanged; triggered from order-status changes.
- **C4** rich live order card — `reference-card` reads live order data (query) layered over the immutable snapshot; quick-call (`tel:`) + WhatsApp (`wa.me`) links.
- **C5** "Discuss this order" button on order rows/modal → `find_or_create_order` convo + open chat.
- **C6** resolve/unresolve flag on order threads — `chat_conversations.resolved_at` column + triage filter.
- **C7** bulk: open threads / broadcast to assignees for a filtered order set.

### Phase 6 — Presence + notifications (F1–F4, G1–G6)
- **F1** "on this order/page now" presence — surface existing per-resource `use-presence` in the order thread/header.
- **F2** status presets (في اجتماع / مشغول / استراحة) + auto-expire — extend `chat_user_status` with `preset` + `expires_at`.
- **F3** Do-Not-Disturb — `chat_user_status` dnd flag; suppress notifications, dim presence dot.
- **F4** last-seen on DM header — read `chat_user_status.last_seen_at`.
- **G1** Web Push for mentions + DMs — service worker + push-subscription table + trigger/edge-fn sender. (Heaviest item; may sub-split.)
- **G2** per-conversation mute (`muted` column exists) — expose in conversation menu.
- **G3** notification preferences per kind (all / mentions-only / none) — new prefs columns/table.
- **G4** unread badge on favicon + sidebar order count.
- **G5** new-message sound (toggle).
- **G6** mark-all-read / per-section read — RPC.

---

## 7. Cross-cutting risks

- **Realtime fan-out:** new system messages (C3) and broadcasts must reuse existing triggers, not add per-message client subscriptions.
- **RLS on new RPCs/tables:** every Phase 2–6 DB object ships tenant-scoped + membership-gated from creation; verify with `get_advisors` after each migration.
- **Bundle size:** emoji picker (H1) and markdown (H2) must not bloat the client — prefer light/bundled approaches.
- **Performance tail:** L (virtualization/pagination) was declined. If Phase 3 threads or busy channels degrade, revisit L1/L2 before shipping more timeline features.
- **Arabic FTS:** Phase 2 B1 needs a deliberate text-search config choice for Arabic.

---

## 8. Verification (every phase)
1. `pnpm --filter @scheniders/platform type-check`
2. `pnpm --filter @scheniders/platform lint`
3. `pnpm exec vitest run <touched paths>`
4. DB changes: `get_advisors` + manual RLS/tenant check
5. Live smoke in-app for UI-visible changes (2-user where realtime/presence is involved)
