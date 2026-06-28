# Team Chat — Phase 4: Composer & Rich Content — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Enrich the composer + message rendering — emoji picker, hand-rolled markdown, slash commands, voice notes, paste-image, multi-file+progress+dimensions, link unfurl.

**Architecture:** Entirely client-side + one Next route handler (no DB, no migration). Two pure tested utils (`markdown`, `slash-commands`) carry the logic. Attachments (voice, paste, multi-file) reuse the existing `chat-attachments` upload path + the dormant `width/height` columns. Link-unfurl = a platform `GET /api/chat/unfurl` route (SSRF-guarded) + a preview card.

**Decision (locked):** markdown = hand-rolled tokenizer (no library).

**Tech Stack:** Next.js 16 / React 19, TanStack Query, zustand, MediaRecorder, Tailwind v4 tokens, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-24-team-chat-phase4-composer-design.md`.

**Conventions:** `pnpm` needs `export PATH="/opt/homebrew/bin:$PATH"`. Gates: type-check + lint (0 errors) + vitest. Commit trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. `git -C /Users/ali/scheniders-mono`. Branch is whatever's checked out (chat co-mingles per the user's decision). LTR; injection-safe markdown (no `dangerouslySetInnerHTML`).

---

## Task 1: Markdown tokenizer (H2) — TDD

**Files:** Create `apps/platform/lib/chat/markdown.tsx` + `apps/platform/lib/chat/markdown.test.tsx`

- [ ] **Step 1: Failing test**

```tsx
// apps/platform/lib/chat/markdown.test.tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { renderMarkdown } from "./markdown";

const html = (s: string) => renderToStaticMarkup(<>{renderMarkdown(s)}</>);

describe("renderMarkdown", () => {
    it("renders bold + italic + inline code", () => {
        expect(html("**b** *i* `c`")).toContain("<strong>b</strong>");
        expect(html("**b** *i* `c`")).toContain("<em>i</em>");
        expect(html("**b** *i* `c`")).toContain("<code");
    });
    it("renders strikethrough", () => {
        expect(html("~~x~~")).toMatch(/<(del|s)[ >]/);
    });
    it("linkifies bare URLs + [text](url), and escapes the href scheme to http/https only", () => {
        expect(html("see https://a.test")).toContain('href="https://a.test"');
        expect(html("[t](https://b.test)")).toContain('href="https://b.test"');
        // javascript: scheme must NOT become an href
        expect(html("[x](javascript:alert(1))")).not.toContain("javascript:");
    });
    it("does NOT emit raw HTML from the input (injection-safe)", () => {
        const out = html("<img src=x onerror=alert(1)>");
        expect(out).not.toContain("<img");
        expect(out).toContain("&lt;img"); // rendered as text
    });
    it("renders unordered list items", () => {
        expect(html("- a\n- b")).toContain("<li>a</li>");
    });
    it("renders blockquote", () => {
        expect(html("> q")).toContain("<blockquote");
    });
});
```

- [ ] **Step 2: Run → FAIL** (`pnpm --filter @scheniders/platform exec vitest run lib/chat/markdown.test.tsx`).
- [ ] **Step 3: Implement** `renderMarkdown(src: string): React.ReactNode` — a pure tokenizer. Split into block lines (lists `- `/`* `, blockquote `> `, paragraphs), then inline-parse each: handle escaped text first (the renderer ONLY emits React elements + text — never raw HTML, so `<` in input becomes literal text), then `**bold**`, `*italic*`/`_italic_`, `` `code` ``, `~~strike~~`, `[text](url)`, and bare `http(s)://…` autolinks. Links: validate the URL is `http:`/`https:` (via `new URL` try/catch); non-http schemes render as plain text (no href). Emit `<strong>/<em>/<code>/<del>/<a target=_blank rel="noopener noreferrer">/<ul><li>/<blockquote>`. Keys on array children. NO `dangerouslySetInnerHTML`.
- [ ] **Step 4: Run → PASS. Commit.**

```bash
git -C /Users/ali/scheniders-mono add apps/platform/lib/chat/markdown.tsx apps/platform/lib/chat/markdown.test.tsx
git -C /Users/ali/scheniders-mono commit -m "feat(chat): injection-safe markdown tokenizer"
```

---

## Task 2: Slash-commands registry (H3) — TDD

**Files:** Create `apps/platform/lib/chat/slash-commands.ts` + `.test.ts`

- [ ] **Step 1: Failing test**

```ts
// apps/platform/lib/chat/slash-commands.test.ts
import { describe, it, expect } from "vitest";
import { parseSlash, slashCommandsFor } from "./slash-commands";

describe("slash commands", () => {
    it("parses /cmd arg from the start of input only", () => {
        expect(parseSlash("/order 1234")).toEqual({ name: "order", arg: "1234" });
        expect(parseSlash("hello /order")).toBeNull();
        expect(parseSlash("/")).toEqual({ name: "", arg: "" });
    });
    it("order commands are only available in order threads", () => {
        const channel = slashCommandsFor("channel").map((c) => c.name);
        const order = slashCommandsFor("order").map((c) => c.name);
        expect(order).toContain("assign");
        expect(order).toContain("status");
        expect(channel).not.toContain("assign");
        expect(channel).not.toContain("status");
    });
    it("shrug is available everywhere", () => {
        expect(slashCommandsFor("channel").map((c) => c.name)).toContain("shrug");
    });
});
```

- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** — `parseSlash(input): { name; arg } | null` (only when input starts with `/`), and `slashCommandsFor(kind): SlashCommand[]` where `SlashCommand = { name; descriptionKey; kinds?: ConversationKind[]; run?: ... }`. Commands: `shrug` (insert `¯\_(ツ)_/¯`, all kinds), `order` (insert an order reference, all kinds), `assign`/`status` (order kind only — they call Phase-5 paths via the UI layer, the registry just declares them + a filter predicate). The actual side-effects are wired in the composer (Task 5), the registry is pure (names/labels/availability + a discriminated `action` tag).
- [ ] **Step 4: Run → PASS. Commit.**

```bash
git -C /Users/ali/scheniders-mono add apps/platform/lib/chat/slash-commands.ts apps/platform/lib/chat/slash-commands.test.ts
git -C /Users/ali/scheniders-mono commit -m "feat(chat): slash-command registry"
```

---

## Task 3: Emoji picker (H1)

**Files:** Create `apps/platform/components/chat/emoji-picker.tsx`; Modify `apps/platform/components/chat/composer.tsx`

- [ ] **Step 1:** `emoji-picker.tsx` — a searchable grid over a bundled emoji dataset. First check if a small emoji dataset is already a transitive dep (grep `node_modules/@emoji-mart/data` / `emojibase-data`); if present, use it; else bundle a curated `lib/chat/emoji-data.ts` (a few hundred common emojis grouped by category with keywords — enough for chat, no heavy dep). Search filters by keyword; a "Frequent" row persists the last ~16 used in `localStorage` (key `chat-emoji-frequent`). Props `{ onPick: (emoji: string) => void; onClose: () => void }`.
- [ ] **Step 2:** Replace the composer's 8-hardcoded-emoji quick popover with a button that opens `<EmojiPicker>`; on pick, insert at the caret (reuse the composer's existing insert-at-caret logic for emojis) + record frequent. Keep a quick-row of the frequent emojis for one-tap.
- [ ] **Step 3: type-check + lint + commit.**

```bash
git -C /Users/ali/scheniders-mono add apps/platform/components/chat/emoji-picker.tsx apps/platform/components/chat/composer.tsx apps/platform/lib/chat/emoji-data.ts
git -C /Users/ali/scheniders-mono commit -m "feat(chat): searchable emoji picker with frequent row"
```

---

## Task 4: Markdown rendering + composer format buttons (H2)

**Files:** Modify `apps/platform/components/chat/message-item.tsx`, `apps/platform/components/chat/composer.tsx`

- [ ] **Step 1:** In `message-item.tsx`, render `message.body` via `renderMarkdown(message.body)` (Task 1) instead of the raw text node — for NON-system, non-deleted messages. Keep the `whitespace-pre-wrap break-words` wrapper. System/reply/reaction/failed rendering unchanged.
- [ ] **Step 2:** In `composer.tsx`, add bold/italic/link format buttons that wrap the current textarea selection (`**…**`, `*…*`, `[…](url)`), preserving caret. Small toolbar; localized tooltips.
- [ ] **Step 3: type-check + lint + commit.**

```bash
git -C /Users/ali/scheniders-mono add apps/platform/components/chat/message-item.tsx apps/platform/components/chat/composer.tsx
git -C /Users/ali/scheniders-mono commit -m "feat(chat): markdown message rendering + composer format buttons"
```

---

## Task 5: Slash menu in composer (H3)

**Files:** Modify `apps/platform/components/chat/composer.tsx`

- [ ] **Step 1:** When the input starts with `/`, show a slash menu (like the existing mention/reference menus) listing `slashCommandsFor(conversationKind)` filtered by the typed prefix. Selecting a command:
  - `shrug` → insert the shrug text, clear the slash.
  - `order` → open the reference search (reuse the existing `#` order-reference flow) to attach an order ref.
  - `assign` (order thread) → open a teammate picker → `useAssignOrder` (Phase 5, via the order's id from the thread's conversation→order_id).
  - `status` (order thread) → open a status picker → `useUpdateStatusMutation`.
  The composer needs the active conversation's `kind` + (for order commands) its `order_id` — resolve from `useConversations()` by `conversationId`.
- [ ] **Step 2: type-check + lint + commit.**

```bash
git -C /Users/ali/scheniders-mono add apps/platform/components/chat/composer.tsx
git -C /Users/ali/scheniders-mono commit -m "feat(chat): slash-command menu in composer"
```

---

## Task 6: Voice notes (H4)

**Files:** Create `apps/platform/components/chat/voice-recorder.tsx`, `apps/platform/components/chat/voice-message.tsx`; Modify `apps/platform/components/chat/composer.tsx`, `apps/platform/components/chat/message-item.tsx`

- [ ] **Step 1:** `voice-recorder.tsx` — a mic button → `navigator.mediaDevices.getUserMedia({audio})` + `MediaRecorder`; shows elapsed time + a max-duration cap (e.g. 2 min); stop → produces a `Blob` (audio/webm or audio/mp4). Handle permission-denied gracefully (toast). On stop, hand the blob to the composer's existing attachment-upload path (upload to `chat-attachments`, mime `audio/*`, into the pending attachments) — it sends as an attachment.
- [ ] **Step 2:** `voice-message.tsx` — playback for an audio attachment: play/pause + a simple progress bar + duration. `message-item` renders it when an attachment mime is `audio/*` (instead of the generic file chip).
- [ ] **Step 3:** Wire the recorder button into the composer toolbar.
- [ ] **Step 4: type-check + lint + commit.**

```bash
git -C /Users/ali/scheniders-mono add apps/platform/components/chat/voice-recorder.tsx apps/platform/components/chat/voice-message.tsx apps/platform/components/chat/composer.tsx apps/platform/components/chat/message-item.tsx
git -C /Users/ali/scheniders-mono commit -m "feat(chat): voice notes (record + playback)"
```

---

## Task 7: Paste image + multi-file progress + dimensions (H5 + H6)

**Files:** Modify `apps/platform/components/chat/composer.tsx`, `apps/platform/components/chat/message-item.tsx`

- [ ] **Step 1 (H5):** Add an `onPaste` handler to the composer textarea — if the clipboard has image items, route them into the existing attachment-upload flow (same as a file pick).
- [ ] **Step 2 (H6):** Make the attach flow accept MULTIPLE files; show a per-file upload progress indicator on the pending-attachment chips; for image files, read `width`/`height` client-side (`createImageBitmap`/`Image()`) and include them in the attachment metadata sent to `chat_send_message` (populating the columns). `message-item` renders image attachments at their natural aspect ratio (using width/height) with a max size, instead of the generic chip.
- [ ] **Step 3: type-check + lint + commit.**

```bash
git -C /Users/ali/scheniders-mono add apps/platform/components/chat/composer.tsx apps/platform/components/chat/message-item.tsx
git -C /Users/ali/scheniders-mono commit -m "feat(chat): paste-image + multi-file upload progress + image dimensions"
```

---

## Task 8: Link unfurl (H7)

**Files:** Create `apps/platform/app/api/chat/unfurl/route.ts`, `apps/platform/components/chat/link-preview.tsx`, `apps/platform/hooks/chat/use-unfurl.ts`; Modify `apps/platform/components/chat/message-item.tsx`

- [ ] **Step 1 (SSRF-guarded route):** `app/api/chat/unfurl/route.ts` — `GET ?url=`. **Security:** require an authenticated session (reuse the app's server auth helper); validate the URL is `http:`/`https:`; **reject private/loopback/link-local hosts** (resolve + block `127.0.0.0/8`, `10/8`, `172.16/12`, `192.168/16`, `169.254/16`, `::1`, `fc00::/7`, and `localhost`); set a fetch timeout (~4s), a max response size (~512KB), and `redirect: "manual"` (don't follow redirects into private space — re-validate any redirect target). Parse OG/twitter meta (`og:title`/`og:description`/`og:image`, fallback `<title>`). Return `{ title, description, image, url }`. Cache in an in-memory LRU (best-effort).
- [ ] **Step 2:** `use-unfurl.ts` — lazy `useQuery` per URL hitting the route; `link-preview.tsx` — a compact card (image thumb + title + description + host). `message-item` extracts the first 1–2 bare URLs from `body` and renders a `<LinkPreview>` under the message (deduped; skip for system/deleted).
- [ ] **Step 3: type-check + lint + commit.**

```bash
git -C /Users/ali/scheniders-mono add apps/platform/app/api/chat/unfurl/route.ts apps/platform/components/chat/link-preview.tsx apps/platform/hooks/chat/use-unfurl.ts apps/platform/components/chat/message-item.tsx
git -C /Users/ali/scheniders-mono commit -m "feat(chat): SSRF-guarded link unfurl + preview card"
```

---

## Task 9: i18n + gates

**Files:** Modify `apps/platform/lib/i18n.ts`

- [ ] **Step 1:** Add EN+AR keys for all Phase-4 strings (emoji search/recent/frequent, format tooltips bold/italic/link, slash-command names+descriptions, voice record/stop/permission/duration, upload progress/error, paste, link-preview/host). Verify `i18n-completeness`.
- [ ] **Step 2:** `type-check` + `lint` (0 errors) + `vitest run lib/chat/markdown.test.tsx lib/chat/slash-commands.test.ts lib/i18n-completeness.test.ts`.

```bash
git -C /Users/ali/scheniders-mono add apps/platform/lib/i18n.ts
git -C /Users/ali/scheniders-mono commit -m "i18n(chat): Phase 4 composer strings (en+ar)"
```

---

## Task 10: Holistic review
- [ ] Final reviewer over the Phase-4 diff: markdown injection-safe (no `dangerouslySetInnerHTML`; `<script>`/`javascript:` render as text); the unfurl route's SSRF guard actually blocks private hosts + non-http schemes + redirects + has auth/timeout/size caps; emoji/voice/paste reuse the tenant-scoped attachment path; slash order-commands gated to order threads; multi-file progress + dimensions correct; no `any`/`@ts-ignore`/non-null `!`/unjustified `eslint-disable`; i18n EN+AR; no Phase-1/2A/2B/3/5 regression (message-item gained markdown + voice + link-preview alongside system-events/reply/reactions/failed — confirm all still render).

## Self-Review (coverage map)
- **H1 emoji** → Task 3. **H2 markdown** → Task 1 (tokenizer) + 4 (render+buttons). **H3 slash** → Task 2 (registry) + 5 (menu). **H4 voice** → Task 6. **H5 paste** → Task 7. **H6 multi-file/dimensions** → Task 7. **H7 unfurl** → Task 8. **i18n/gates/review** → 9, 10. **Zero migrations.**
