# Team Chat — Phase 4: Composer & Rich Content — Design

**Date:** 2026-06-24
**Branch:** current (`feat/store-builder-preview-iframe` — chat work co-mingled per the user's branch decision).
**Parent roadmap:** `docs/superpowers/specs/2026-06-21-team-chat-enhancements-design.md` §6 Phase 4 (category H).
**Status:** Draft — one decision pending (§7).

---

## 1. Context

Phases 1/2A/2B/5/3 shipped. Phase 4 enriches the composer + how message content renders. Backend facts (verified): the composer (`composer.tsx`) has 8 hardcoded quick-emojis, `#`/`@` reference+mention autocomplete, drag-drop + button file upload to the `chat-attachments` storage bucket, and (Phase 3) a reply chip + per-conversation drafts. `chat_message_attachments` already stores `mime/size_bytes/width/height` (width/height **unused**). Messages render `body` as plain `whitespace-pre-wrap` text. `chat_send_message` already accepts attachments + references + mentions.

**Key finding — ZERO migrations.** Every H-feature is client-side and reuses existing infrastructure (the attachments bucket + the `width/height` columns + existing RPCs). Voice notes, paste-image, multi-file all flow through the existing attachment-upload path. Link-unfurl uses a Next route handler (no DB). So Phase 4 builds entirely without the Supabase MCP.

### In scope (H1–H7)
- **H1 Emoji picker** — a full searchable picker replacing the 8 hardcoded quick-emojis (kept as a "frequent" row).
- **H2 Markdown** — render a safe minimal markdown subset in `message-item` (bold, italic, `code`, ~~strike~~, lists, links, blockquote) + a tiny formatting affordance in the composer.
- **H3 Slash commands** — `/` at the start opens a command menu: `/order <id>` (insert order reference), `/assign @user` (assign the order — order threads), `/status <status>` (change order status — order threads), `/giphy`? (skip — no external dep), `/shrug`. Order commands reuse Phase-5 RPCs.
- **H4 Voice notes** — record via `MediaRecorder` → upload to `chat-attachments` (audio mime) → playback bubble with a waveform/scrubber.
- **H5 Paste image** — paste from clipboard into the composer → enters the existing attachment-upload flow.
- **H6 Multi-file + progress + dimensions** — multiple files at once, per-file upload progress, and extract image `width/height` client-side (populating the unused columns) so images render at the right aspect ratio.
- **H7 Link unfurl** — detect URLs in a sent message → fetch OG metadata via a platform route handler → render a preview card under the message.

### Non-negotiables
- LTR; every string `t()` EN+AR. Built to the Phase-1 visual bar. No new keyboard shortcuts (the slash menu is `/`-triggered text, which is content not a shortcut — acceptable; the picker/format affordances are buttons).
- Markdown rendering MUST be injection-safe (no `dangerouslySetInnerHTML` with raw input; use a sanitizing renderer or a hand-rolled tokenizer that emits React nodes).
- Attachment uploads stay tenant+conversation-scoped via the existing bucket RLS (path `{tenant}/{conversation}/...`).
- No heavy dependencies without justification — prefer a small/bundled approach for the emoji dataset + markdown.

---

## 2. No data model changes
Reuses `chat_message_attachments` (incl. the dormant `width/height`), the `chat-attachments` bucket, and existing RPCs (`chat_send_message`, Phase-5 `chat_assign_order`, `useUpdateStatusMutation`). The H7 route handler persists nothing (fetch-on-render; optional in-memory LRU cache).

---

## 3. Components & hooks
- **H1** `emoji-picker.tsx` — a searchable grid over a bundled emoji dataset (evaluate `@emoji-mart/data` + a tiny custom grid, vs a fully hand-rolled small set; §7 is about the markdown lib, emoji approach defaults to a lightweight bundled dataset + custom grid to avoid a heavy picker dep). Recent/frequent row persisted in localStorage. Replaces the composer's quick-pick popover.
- **H2** `lib/chat/markdown.tsx` — a small tokenizer → React nodes (bold/italic/code/strike/link/list/blockquote/inline-code). Unit-tested. `message-item` uses it for `body`. Composer gets bold/italic/link buttons that wrap the selection.
- **H3** `lib/chat/slash-commands.ts` (registry, tested) + a slash menu in the composer; order commands gated to `kind='order'` threads.
- **H4** `voice-recorder.tsx` (MediaRecorder, permission handling, max-duration cap) + `voice-message.tsx` (playback + waveform) + reuse the upload path; `audio/*` mime.
- **H5** paste handler in `composer.tsx` → existing attachment flow.
- **H6** extend the upload to accept multiple files, show per-file progress, and read image `width/height` (via an `Image()`/`createImageBitmap`) before/after upload to populate the columns; `message-item` renders images at their aspect ratio.
- **H7** `app/api/chat/unfurl/route.ts` (GET `?url=` → OG title/description/image, SSRF-guarded: only http(s), block private IPs/localhost, timeout, size cap) + `link-preview.tsx` card + a `use-unfurl` hook (lazy, cached).

## 4. UI integration
- Composer toolbar: emoji button (→ picker), format buttons (bold/italic/link), attach (multi), voice (record). Slash menu overlays like the existing mention/reference menus.
- `message-item`: markdown body; image attachments at aspect ratio; voice bubble; link-preview card(s) under the body. Keep system-event + reply + reaction + failed-state rendering intact.

## 5. i18n
EN+AR for: emoji search/recent, format labels, slash-command names/descriptions, voice (record/stop/permission-denied/duration), upload progress/errors, link-preview, paste. Verify `i18n-completeness`.

## 6. Verification
type-check + lint (0); unit tests for `markdown` + `slash-commands` (pure); manual: emoji insert, markdown render (incl. injection attempt renders as text), slash `/order`/`/assign`/`/status`, voice record→play, paste image, multi-file progress + aspect ratio, link unfurl card + SSRF guard (private URL rejected). The unfurl route's SSRF guard is the security-sensitive bit — test it.

## 7. Decision needed
**Markdown renderer:** (a) a tiny **hand-rolled tokenizer** (~150 lines, zero deps, emits React nodes, only the subset we want — fully controlled + injection-safe by construction), or (b) a **library** (`react-markdown` + `remark-gfm` + a sanitizer) — more complete (tables, nested), but adds deps + a sanitization surface, and can over-render?
Recommendation: **(a) hand-rolled tokenizer** — the subset is small, zero new deps, injection-safe by construction (we only ever emit known React elements), and matches the "no heavy deps" rule. A library is overkill for chat-message formatting.
