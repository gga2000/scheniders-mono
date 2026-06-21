# Team Chat — Phase 2B: Search & Navigation — Design

**Date:** 2026-06-22
**Branch:** `feat/team-chat-presence`
**Parent roadmap:** `docs/superpowers/specs/2026-06-21-team-chat-enhancements-design.md` §6 Phase 2 (2A = conversation management, shipped + live; this is **2B**).
**Status:** Draft for approval.

---

## 1. Context & scope

2A (conversation management) is built, applied, and authz-verified live. 2B adds the ability to **find** things across the now-richer conversation set.

Backend today (verified): `chat_messages.body` has **no** full-text index; no search RPC exists; no search/filter UI anywhere in chat. `useConversations()` already returns the full conversation list with `unread` + `members`; `useMentionNotifications()` returns mention rows; the unread divider (Phase 1) + day separators (Phase 1) already exist in the timeline. The reference-search hook (`use-reference-search`) searches *orders* from `OrdersContext` for the composer — unrelated to message search.

### In scope (2B)
- **B1** Full-text **message search** — `'simple'` tsvector (decided), GIN index + membership-scoped search RPC + a search panel in the chat dialog; result → open conversation + scroll to the message.
- **B2** **Jump-to-conversation** picker — a clickable launcher (no hotkey, per project convention) that fuzzy-filters conversation + teammate names client-side.
- **B3** Conversation-list **filters** — chips: All / Unread / Mentions / Channels / Direct / Orders / Archived. Client-side over already-loaded data.
- **B4** **Scroll-to-unread + date jump** — a "jump to first unread" affordance (reuses the Phase-1 frozen unread boundary) and a date-jump control over the existing day separators.
- **B5** **Order-thread search/filter** — find order threads by the linked order's status/value, client-side over order-kind conversations joined to `OrdersContext`.

### Out of scope
- Search over attachments/file contents, references, or customer/product entities (B1 is message **body** only; finding order threads is B5).
- Saved searches, search history, relevance tuning beyond `ts_rank` default ordering.
- Arabic stemming (`'simple'` only — decided; revisit if recall is poor).

### Non-negotiables
- Search RPC is `SECURITY DEFINER`, `SET search_path = public, pg_temp`, **membership-scoped** (only messages in conversations the caller is a member of), tenant implied by membership; `EXECUTE` to `authenticated` only (PUBLIC/anon revoked). No raw client query over `chat_messages` for search (RLS would allow it but the RPC gives ranking + snippet + conversation context in one trip).
- LTR; every string via `t()` (EN+AR); no keyboard shortcuts (launchers are buttons).
- Built to the Phase-1 visual bar (ChatAvatar, ChatEmptyState, skeletons, tokens, restrained motion, dialog a11y).

---

## 2. Data model & migration (B1 only)

One migration: `packages/supabase/migrations/20260622100000_chat_message_search.sql`. No new tables/columns.

### 2.1 Index
```
CREATE INDEX IF NOT EXISTS chat_messages_body_fts_idx
  ON public.chat_messages USING gin (to_tsvector('simple', body));
```
(`'simple'` config: lowercases + tokenizes, no stemming — predictable for AR+EN, matches the app's existing `lead_prospecting` pattern.)

### 2.2 Search RPC
```
chat_search_messages(p_query text, p_limit int DEFAULT 30)
  RETURNS TABLE(
    message_id uuid, conversation_id uuid, conversation_name text,
    conversation_kind text, sender_id uuid, body text, snippet text, created_at timestamptz
  )
  SECURITY DEFINER, STABLE, search_path = public, pg_temp
```
Body (membership-scoped, newest-first within rank):
- Guard: `IF coalesce(btrim(p_query),'') = '' THEN RETURN; END IF;` (empty query → no rows).
- `q := websearch_to_tsquery('simple', p_query)`.
- Select messages where `m.deleted_at IS NULL`, `to_tsvector('simple', m.body) @@ q`, and `m.conversation_id IN (SELECT conversation_id FROM chat_members WHERE user_id = auth.uid())`.
- `snippet := ts_headline('simple', m.body, q, 'StartSel=«,StopSel=»,MaxFragments=1,MaxWords=12,MinWords=4')` (delimiters the client renders as highlight; «» avoid HTML-injection concerns).
- Join `chat_conversations` for `name`/`kind`; order by `ts_rank(to_tsvector('simple', m.body), q) DESC, m.created_at DESC`; `LIMIT least(p_limit, 50)`.
- Grants: `REVOKE ... FROM PUBLIC, anon; GRANT EXECUTE ... TO authenticated`.

### 2.3 Verification
- Advisor (security) after apply — confirm only the expected intentional SECDEF advisory; no `search_path` finding.
- A live `execute_sql` smoke: as a member, search a known token → returns only their-conversation messages; as a non-member of a conversation, the same token in that conversation does **not** appear (membership scoping). Snippet + ranking sane.

---

## 3. Hooks

- `apps/platform/hooks/chat/use-message-search.ts` — `useMessageSearch(query: string)`: debounced (~250ms) `useQuery` calling `chat_search_messages`; `enabled` only when query length ≥ 2; returns typed `ChatSearchResult[]`. Query key `[...chatKeys.all, "search", query]`.
- No new hooks for B2/B3/B4/B5 — they operate on data already in `useConversations()`, `useMentionNotifications()`, and `OrdersContext`. Small pure helpers (tested) where filtering logic is non-trivial:
  - `apps/platform/lib/chat/filter-conversations.ts` — `filterConversations(list, filter, mentionConvIds)` pure fn (unit-tested): maps a filter key → predicate (unread>0, kind, archived, has-mention).
  - `apps/platform/lib/chat/fuzzy.ts` — `fuzzyRank(items, query, keyFn)` simple subsequence/substring scorer for the jump picker (unit-tested).

---

## 4. UI

### 4.1 Search panel (B1)
- A **search affordance** in the chat dialog header (a search icon button next to the conversation menu / title). Opens a **search mode** overlaying the conversation list column (or a dedicated panel on mobile): a text input + results list.
- New `apps/platform/components/chat/search-panel.tsx`: input (debounced via the hook), `ChatEmptyState` for no-query / no-results, skeleton while loading. Each result row: ChatAvatar(sender) + sender name + conversation label (`# name` / DM peer / `Order …`) + highlighted snippet (render «»→highlighted span) + relative time. Click → `setActiveConversation(conversation_id)` + request scroll-to-message.
- **Scroll-to-message:** extend `MessageList` to accept an optional `focusMessageId`; on change, scroll that message into view + briefly highlight it (restrained pulse). The store carries `focusMessageId` (set by a search-result click, cleared after focus). If the message isn't in the loaded page (older than the 50-message window), fall back to scrolling to top + a toast "Opening conversation" (full deep-paging is a Phase-L concern, out of scope).

### 4.2 Jump-to-conversation picker (B2)
- A launcher button (in the list header next to "+") opening a `Popover`/`Dialog` with a text input that `fuzzyRank`s conversation names + teammate display-names (start-a-DM entries included). Enter/click → open. Button only; no global hotkey.

### 4.3 Conversation-list filters (B3)
- A compact filter chip row under the list header: All / Unread / Mentions / Channels / Direct / Orders / Archived. Selecting filters the rendered sections via `filterConversations`. "Mentions" uses `useMentionNotifications()` conversation ids; "Archived" swaps to `useArchivedConversations()` (already built in 2A). Active chip styled with a pastel token. Counts shown where cheap (unread).

### 4.4 Scroll-to-unread + date jump (B4)
- In `MessageList`: when a frozen unread boundary exists, show a small floating "↑ N new" / "Jump to unread" pill that scrolls to the divider (complements the existing jump-to-latest pill). A lightweight date-jump: clicking a day separator (or a small calendar affordance) scrolls to that day's first message. Keep restrained.

### 4.5 Order-thread filter (B5)
- Within the Orders section (or its own filter facet), allow filtering order threads by the linked order's **status** and a value threshold, reading order data from `OrdersContext` joined on `conversation.order_id`. Render the order's status chip + total (IQD) on the order-thread row for at-a-glance triage. If `OrdersContext` lacks an order (not loaded), the thread still shows by name (no crash).

---

## 5. i18n
New EN+AR keys: `chat.search`, `chat.searchPlaceholder`, `chat.searchEmpty`, `chat.searchNoResults`, `chat.jumpTo`, `chat.jumpToUnread`, `chat.filter.all`, `chat.filter.unread`, `chat.filter.mentions`, `chat.filter.channels`, `chat.filter.direct`, `chat.filter.orders`, `chat.filter.archived`, `chat.orderStatus`, plus any labels the components add. Verify with `lib/i18n-completeness.test.ts`.

---

## 6. Verification
1. `pnpm --filter @scheniders/platform type-check` + `lint` (0 errors).
2. `pnpm --filter @scheniders/platform exec vitest run` on the new pure-helper tests (`filter-conversations`, `fuzzy`, and the message-search hook's result shape if unit-testable) + `i18n-completeness`.
3. **DB (MCP up):** apply the migration; advisor; live `execute_sql` membership-scoping smoke for `chat_search_messages`; regenerate types.
4. Live: search returns highlighted snippets and opens + scrolls to the message; filters/jump/order-filter behave; no Phase-1/2A regression.

---

## 7. Risks
- **Membership scoping is the security surface** — the RPC must filter to the caller's `chat_members`; the live smoke must prove a non-member can't surface another conversation's messages. (RLS on the base table is a backstop, but the SECDEF RPC bypasses RLS, so the WHERE is the gate.)
- **`ts_headline` cost** on large bodies — bounded by `LIMIT` + the GIN-filtered candidate set; acceptable at this scale.
- **Scroll-to-message for older messages** beyond the loaded 50-message window degrades to "open + toast" — full deep-link paging is deferred (Phase L). Log the limitation, don't pretend it scrolled.
- **Arabic `'simple'`** does whole-word match (no prefix/stemming) — adequate for v1; revisit with `pg_trgm` if users expect partial matching.
