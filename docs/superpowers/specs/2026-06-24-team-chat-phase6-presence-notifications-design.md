# Team Chat — Phase 6: Presence & Notifications — Design

**Date:** 2026-06-24
**Branch:** current (chat work co-mingled per the user's branch decision).
**Parent roadmap:** `docs/superpowers/specs/2026-06-21-team-chat-enhancements-design.md` §6 Phase 6 (categories F + G). **The last chat phase.**
**Status:** Draft — one decision pending (§8: web-push scope).

---

## 1. Context

Phases 1/2A/2B/3/5/4 shipped. Phase 6 finishes presence + notifications. Backend facts (verified): `chat_user_status` has `custom_emoji/custom_text/last_seen_at/updated_at` (+ a last-seen heartbeat already runs); `chat_members.muted boolean` exists and the **self-update RLS already allows changing `muted`** (the guard trigger only blocks role/user_id/conversation_id) → mute needs no RPC/migration. The single tenant-presence subscription (`useTenantPresence` → `usePresenceStore`) + per-resource `use-presence` already exist. No notification-prefs table, no DND/preset columns, no web-push infra.

### Scope split (so the phase ships incrementally)
**6A — buildable now, NO migration (this spec's build target):**
- **F1** "On this order/page now" — surface the existing per-resource `use-presence` (who else is viewing the same order thread) in the order-thread header.
- **F4** Last-seen on DM header — read `chat_user_status.last_seen_at` for the DM peer.
- **G2** Per-conversation mute — toggle `chat_members.muted` (direct self-update, existing RLS); muted conversations suppress unread badges + (G5) sound + (G1) push.
- **G4** Unread badge on favicon + tab title — reflect total unread.
- **G5** New-message sound — a subtle chime on incoming message (respects mute + a global on/off, persisted).
- **G6** Mark-all-read — clear all unread (client loops `chat_mark_read`, or a small RPC).

**6A-db — small migration (drafted now, applied when MCP is stable):**
- **F2** Status presets (في اجتماع / مشغول / استراحة) + auto-expire — add `preset text` + `expires_at timestamptz` to `chat_user_status`.
- **F3** Do-Not-Disturb — add `dnd boolean` to `chat_user_status`; DND suppresses sound + push + dims the presence dot.
- **G3** Notification prefs per kind — `chat_notification_prefs(user_id, kind, level)` (all/mentions/none) or columns on `chat_user_status`; gates which conversation kinds notify.

**6B — web push (G1), DEFERRED to its own spec (see §8):** service worker + `chat_push_subscriptions` table + VAPID keys (env, user-provided) + a sender (DB trigger → edge function / route). Heavy, env-dependent, browser-smoke-required.

### Non-negotiables
- Any RPC `SECURITY DEFINER` + membership/tenant-guarded + `authenticated`-only. New tables RLS from creation. LTR; `t()` EN+AR. Phase-1 visual bar. Single presence subscription invariant preserved (no second realtime channel).

---

## 2. Data model
**6A:** none (mute reuses the existing `chat_members.muted` self-update; favicon/sound/last-seen/on-order are client; mark-all-read can be a client loop or a tiny RPC).
**6A-db migration** `20260624100000_chat_presence_prefs.sql` (drafted; applied when MCP stable):
- `ALTER TABLE chat_user_status ADD COLUMN preset text, ADD COLUMN expires_at timestamptz, ADD COLUMN dnd boolean NOT NULL DEFAULT false;`
- `CREATE TABLE chat_notification_prefs (user_id uuid, tenant_id uuid, kind text, level text CHECK (level IN ('all','mentions','none')) DEFAULT 'all', PRIMARY KEY (user_id, tenant_id, kind))` + RLS self-scoped (`user_id = auth.uid()`).
- Optional RPC `chat_mark_all_read()` (loops the caller's memberships) — or do it client-side.

---

## 3. Hooks & client
- **F1** `useOrderThreadViewers(orderId)` — mount `use-presence` on the order resource when an order thread is open; show the viewer avatars in the header (NO new tenant-presence subscription — `use-presence` is its own per-resource channel, already the pattern).
- **F4** `useLastSeen(userId)` — read `chat_user_status.last_seen_at` (query, cached); render "active Nm ago" on the DM header.
- **G2** `useToggleMute(conversationId)` — update `chat_members.muted` for the caller; `ConversationWithMeta` already carries the member row → expose `muted`; muted convs are visually dimmed + excluded from the favicon/sound/push counts.
- **G4** `use-favicon-badge.ts` — set the tab title prefix `(N)` + draw a badge on the favicon canvas from the total unread (excluding muted). Mounted once in `chat-runtime`.
- **G5** `use-notification-sound.ts` — play a short chime on an incoming `inbox:new` for a non-muted, non-active conversation; gated by a persisted global toggle (+ later DND). Web Audio or a tiny bundled audio.
- **G6** `useMarkAllRead()` — client loop over unread conversations calling `chat_mark_read` (or the RPC).
- **F2/F3/G3** (after the migration): status-preset picker (extends the existing custom-status UI in `live-presence-stack`), DND toggle, per-kind prefs UI.

## 4. UI
- Order-thread header (F1): a small "also viewing" avatar cluster.
- DM header (F4): "active Nm ago".
- Conversation overflow menu (G2): a Mute/Unmute item (next to the 2A Archive/Leave) + a muted icon on the row.
- Top-bar / chat-runtime (G4): favicon + title badge.
- A small notification-settings popover (G5 sound toggle now; F3 DND + G3 per-kind prefs after the migration) — hang off the presence stack or a gear in the chat header.
- Mark-all-read (G6): a button in the conversation-list header.

## 5. i18n
EN+AR: `chat.mute`, `chat.unmute`, `chat.muted`, `chat.markAllRead`, `chat.alsoViewing`, `chat.activeAgo`, `chat.soundOn`, `chat.soundOff`, `chat.notificationSettings`, + (post-migration) preset labels, `chat.dnd`, per-kind pref labels. Verify `i18n-completeness`.

## 6. Verification
type-check + lint (0); pure-helper tests where applicable (favicon-count, mute-filtering); 6A needs no DB. The 6A-db migration: apply when MCP stable + advisor + RLS smoke (prefs self-scoped; status columns). Live: mute suppresses badge/sound; favicon reflects unread; on-order viewers show; last-seen renders; mark-all-read clears.

## 7. Risks
- **Single presence-subscription invariant** — F1 uses `use-presence` (its own per-resource channel, fine); do NOT add a second tenant-presence channel.
- **Favicon/title** — restore the original on unmount/zero-unread; don't fight other tab-title writers.
- **Sound** — must respect mute + active-conversation + the global toggle (+ DND later); never autoplay-spam; a single debounced chime.
- **Mark-all-read** as a client loop is N RPC calls — fine for typical counts; if a tenant has hundreds of unread convs, prefer the `chat_mark_all_read` RPC.

## 8. Decision needed
**Web push (G1):** (a) **DEFER to a focused 6B spec** (recommended) — it needs VAPID keys (env you provide), a service worker, a `chat_push_subscriptions` table + a sender (DB trigger → edge function), and real-browser + real-device smoke; it's a project in itself and is env-blocked without VAPID. Ship 6A (+ 6A-db) now, do 6B deliberately later. OR (b) **attempt G1 now** — I draft the table + service worker + sender, but it's incomplete/untestable until you supply VAPID keys and smoke it on a device.
Recommendation: **(a) defer G1 to 6B.** Build 6A now (real, shippable, no env blockers), draft 6A-db, and spec web-push separately when you're ready to provision VAPID.
