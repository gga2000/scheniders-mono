# Team Chat — Phase 2B: Search & Navigation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (or executing-plans). Steps use checkbox (`- [ ]`).

**Goal:** Find anything in chat — full-text message search (membership-scoped RPC + panel), jump-to-conversation picker, conversation-list filters, scroll-to-unread + date jump, and order-thread filtering — built to the Phase-1 visual bar.

**Architecture:** One migration (GIN `'simple'` tsvector index + `chat_search_messages` SECURITY DEFINER RPC, membership-scoped). Pure tested helpers carry the filter/fuzzy logic. A debounced search hook + a search panel; the rest reuses data already in `useConversations`/`useMentionNotifications`/`OrdersContext`. Supabase MCP is UP — apply + smoke the migration live.

**Tech Stack:** Postgres FTS, Next.js 16/React 19, TanStack Query, zustand, Tailwind v4 tokens, `@scheniders/ui`, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-22-team-chat-phase2b-search-navigation-design.md`.

**Conventions:** `pnpm` needs `export PATH="/opt/homebrew/bin:$PATH"`. Gates: `pnpm --filter @scheniders/platform type-check` + `lint` (0 errors) + `pnpm --filter @scheniders/platform exec vitest run <path>`. Commit trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. `git -C /Users/ali/scheniders-mono`. `supabase.rpc` is loosely typed (client has no `<Database>` generic) so new RPC names compile pre-apply.

---

## Task 1: Migration — FTS index + `chat_search_messages` RPC

**Files:** Create `packages/supabase/migrations/20260622100000_chat_message_search.sql`

- [ ] **Step 1: Write the migration**

```sql
-- =============================================
-- CHAT PHASE 2B: full-text message search ('simple' config; AR+EN, no stemming)
-- =============================================
CREATE INDEX IF NOT EXISTS chat_messages_body_fts_idx
  ON public.chat_messages USING gin (to_tsvector('simple', body));

CREATE OR REPLACE FUNCTION public.chat_search_messages(p_query text, p_limit int DEFAULT 30)
RETURNS TABLE (
    message_id        uuid,
    conversation_id   uuid,
    conversation_name text,
    conversation_kind text,
    sender_id         uuid,
    body              text,
    snippet           text,
    created_at        timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public, pg_temp AS $$
DECLARE v_q tsquery;
BEGIN
    IF coalesce(btrim(p_query), '') = '' THEN RETURN; END IF;
    v_q := websearch_to_tsquery('simple', p_query);
    IF v_q IS NULL THEN RETURN; END IF;

    RETURN QUERY
    SELECT
        m.id, m.conversation_id, c.name, c.kind, m.sender_id, m.body,
        ts_headline('simple', m.body, v_q,
            'StartSel=«,StopSel=»,MaxFragments=1,MaxWords=12,MinWords=4,ShortWord=0'),
        m.created_at
    FROM public.chat_messages m
    JOIN public.chat_conversations c ON c.id = m.conversation_id
    WHERE m.deleted_at IS NULL
      AND to_tsvector('simple', m.body) @@ v_q
      AND m.conversation_id IN (
          SELECT cm.conversation_id FROM public.chat_members cm WHERE cm.user_id = auth.uid()
      )
    ORDER BY ts_rank(to_tsvector('simple', m.body), v_q) DESC, m.created_at DESC
    LIMIT least(coalesce(p_limit, 30), 50);
END; $$;

REVOKE EXECUTE ON FUNCTION public.chat_search_messages(text, int) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.chat_search_messages(text, int) TO authenticated;
```

- [ ] **Step 2: Apply live (MCP up)** via `mcp__supabase__apply_migration` (name `chat_message_search`). Then commit the file.
- [ ] **Step 3: Live smoke (membership scoping is the security gate)** via `mcp__supabase__execute_sql`, inside `BEGIN; … ROLLBACK;`: seed two users in one tenant, a private channel with only user A as member, a message "zzunique token" in it; impersonate user A (`SET LOCAL ROLE authenticated` + `set_config request.jwt.claims`) → `chat_search_messages('zzunique')` returns the row; impersonate user B (non-member) → returns **zero** rows. RESET ROLE between. (Same harness as `chat_phase2a_authz.sql`.) If B sees the row → STOP, the WHERE membership filter is wrong.
- [ ] **Step 4: Advisor** `mcp__supabase__get_advisors security` → confirm only the expected intentional SECDEF advisory for `chat_search_messages`; no `search_path` finding.

```bash
git -C /Users/ali/scheniders-mono add packages/supabase/migrations/20260622100000_chat_message_search.sql
git -C /Users/ali/scheniders-mono commit -m "feat(chat): full-text message search index + membership-scoped RPC (Phase 2B)"
```

---

## Task 2: Pure helper — `filterConversations` (TDD)

**Files:** Create `apps/platform/lib/chat/filter-conversations.ts` + `.test.ts`

- [ ] **Step 1: Failing test**

```ts
// apps/platform/lib/chat/filter-conversations.test.ts
import { describe, it, expect } from "vitest";
import { filterConversations, type ConvFilter } from "./filter-conversations";

const mk = (over: Partial<{ id: string; kind: string; unread: number; archived_at: string | null }>) => ({
    id: over.id ?? "c", kind: over.kind ?? "channel", unread: over.unread ?? 0, archived_at: over.archived_at ?? null,
} as Parameters<typeof filterConversations>[0][number]);

describe("filterConversations", () => {
    const list = [
        mk({ id: "ch", kind: "channel", unread: 0 }),
        mk({ id: "dm", kind: "dm", unread: 3 }),
        mk({ id: "or", kind: "order", unread: 0 }),
    ];
    const run = (f: ConvFilter, mention = new Set<string>()) => filterConversations(list, f, mention).map((c) => c.id);

    it("all → everything (non-archived)", () => expect(run("all")).toEqual(["ch", "dm", "or"]));
    it("unread → only unread>0", () => expect(run("unread")).toEqual(["dm"]));
    it("channels / direct / orders by kind", () => {
        expect(run("channels")).toEqual(["ch"]);
        expect(run("direct")).toEqual(["dm"]);
        expect(run("orders")).toEqual(["or"]);
    });
    it("mentions → only conversations in the mention set", () => expect(run("mentions", new Set(["or"]))).toEqual(["or"]));
});
```

- [ ] **Step 2: Run → FAIL** (`pnpm --filter @scheniders/platform exec vitest run lib/chat/filter-conversations.test.ts`).
- [ ] **Step 3: Implement**

```ts
// apps/platform/lib/chat/filter-conversations.ts
export type ConvFilter = "all" | "unread" | "mentions" | "channels" | "direct" | "orders" | "archived";

interface FilterableConv { id: string; kind: string; unread: number; archived_at: string | null }

/** Pure list filter for the conversation-list chips. "archived" is handled by a
 *  separate query upstream, so here it behaves like "all" over whatever list it's given. */
export function filterConversations<T extends FilterableConv>(
    list: T[], filter: ConvFilter, mentionConvIds: Set<string>
): T[] {
    switch (filter) {
        case "unread":   return list.filter((c) => c.unread > 0);
        case "mentions": return list.filter((c) => mentionConvIds.has(c.id));
        case "channels": return list.filter((c) => c.kind === "channel");
        case "direct":   return list.filter((c) => c.kind === "dm" || c.kind === "group");
        case "orders":   return list.filter((c) => c.kind === "order");
        case "all":
        case "archived":
        default:         return list;
    }
}
```

- [ ] **Step 4: Run → PASS. Commit.**

```bash
git -C /Users/ali/scheniders-mono add apps/platform/lib/chat/filter-conversations.ts apps/platform/lib/chat/filter-conversations.test.ts
git -C /Users/ali/scheniders-mono commit -m "feat(chat): conversation-list filter helper"
```

---

## Task 3: Pure helper — `fuzzyRank` (TDD)

**Files:** Create `apps/platform/lib/chat/fuzzy.ts` + `.test.ts`

- [ ] **Step 1: Failing test**

```ts
// apps/platform/lib/chat/fuzzy.test.ts
import { describe, it, expect } from "vitest";
import { fuzzyRank } from "./fuzzy";

const items = [{ n: "general" }, { n: "design team" }, { n: "Mohammed Ali" }, { n: "orders-iraq" }];
const run = (q: string) => fuzzyRank(items, q, (i) => i.n).map((i) => i.n);

describe("fuzzyRank", () => {
    it("empty query returns all in original order", () => expect(run("")).toEqual(items.map((i) => i.n)));
    it("substring matches rank first", () => expect(run("ali")[0]).toBe("Mohammed Ali"));
    it("is case-insensitive", () => expect(run("GENERAL")).toContain("general"));
    it("non-matches are dropped", () => expect(run("zzz")).toEqual([]));
    it("subsequence matches (gaps allowed)", () => expect(run("dsgn")).toContain("design team"));
});
```

- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement**

```ts
// apps/platform/lib/chat/fuzzy.ts
/** Rank items by how well `query` matches keyFn(item): exact-substring beats
 *  subsequence; non-matches dropped. Empty query → original order preserved. */
export function fuzzyRank<T>(items: T[], query: string, keyFn: (item: T) => string): T[] {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    const scored: { item: T; score: number }[] = [];
    for (const item of items) {
        const hay = keyFn(item).toLowerCase();
        const idx = hay.indexOf(q);
        if (idx >= 0) { scored.push({ item, score: 1000 - idx }); continue; }
        // subsequence: all chars of q appear in order
        let qi = 0;
        for (let h = 0; h < hay.length && qi < q.length; h++) if (hay[h] === q[qi]) qi++;
        if (qi === q.length) scored.push({ item, score: 100 - (hay.length - q.length) });
    }
    return scored.sort((a, b) => b.score - a.score).map((s) => s.item);
}
```

- [ ] **Step 4: Run → PASS. Commit.**

```bash
git -C /Users/ali/scheniders-mono add apps/platform/lib/chat/fuzzy.ts apps/platform/lib/chat/fuzzy.test.ts
git -C /Users/ali/scheniders-mono commit -m "feat(chat): fuzzy ranker for jump-to-conversation"
```

---

## Task 4: Search hook + result type + store `focusMessageId`

**Files:** Create `apps/platform/hooks/chat/use-message-search.ts`; Modify `apps/platform/types/chat.ts`, `apps/platform/store/use-chat-store.ts`

- [ ] **Step 1: Add the result type** to `types/chat.ts`:

```ts
export interface ChatSearchResult {
    message_id: string;
    conversation_id: string;
    conversation_name: string | null;
    conversation_kind: string;
    sender_id: string;
    body: string;
    snippet: string;
    created_at: string;
}
```

- [ ] **Step 2: Create the hook** `use-message-search.ts` (debounce the query in the caller; here keep it simple — `enabled` on length ≥ 2):

```ts
// apps/platform/hooks/chat/use-message-search.ts
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { chatKeys } from "./use-conversations";
import type { ChatSearchResult } from "@/types/chat";

export function useMessageSearch(query: string) {
    const q = query.trim();
    return useQuery({
        queryKey: [...chatKeys.all, "search", q] as const,
        enabled: q.length >= 2,
        staleTime: 10_000,
        queryFn: async (): Promise<ChatSearchResult[]> => {
            const { data, error } = await supabase.rpc("chat_search_messages", { p_query: q, p_limit: 30 });
            if (error) throw error;
            return (data ?? []) as ChatSearchResult[];
        },
    });
}
```

- [ ] **Step 3: Add `focusMessageId` to the store** `use-chat-store.ts` (read current file; add to the interface + initial state + actions):

```ts
    focusMessageId: string | null;
    openMessage: (conversationId: string, messageId: string) => void;  // set active conv + focus msg
    clearFocusMessage: () => void;
```
Implement `openMessage` to set `isOpen: true, activeConversationId: conversationId, focusMessageId: messageId`; `clearFocusMessage` sets `focusMessageId: null`. Keep the existing fields.

- [ ] **Step 4: Verify + commit** (`type-check` + `lint`).

```bash
git -C /Users/ali/scheniders-mono add apps/platform/hooks/chat/use-message-search.ts apps/platform/types/chat.ts apps/platform/store/use-chat-store.ts
git -C /Users/ali/scheniders-mono commit -m "feat(chat): message-search hook + focusMessageId store wiring"
```

---

## Task 5: Search panel + scroll-to-message

**Files:** Create `apps/platform/components/chat/search-panel.tsx`; Modify `apps/platform/components/chat/message-list.tsx`, `apps/platform/components/chat/chat-sheet.tsx`

- [ ] **Step 1: `search-panel.tsx`** — props `{ onClose: () => void }`. Local input state (debounced ~250ms via a small `useEffect`+`setTimeout` or inline) feeding `useMessageSearch`. States: empty input → `ChatEmptyState` ("Search messages"); loading → skeleton rows; no results → `ChatEmptyState`; results → rows. Row: `ChatAvatar` (sender via `useTenantMembers` map) + sender name + conversation label (`# name` for channel, peer/name for dm/group, `name` for order) + snippet with «»→`<mark>`-style highlight (split on «/» and wrap) + relative time (`date-fns`). Click → `useChatStore().openMessage(conversation_id, message_id)` + `onClose()`. All strings via `t()`.

- [ ] **Step 2: Search affordance in `chat-sheet.tsx` header** — add a search icon button (lucide `Search`) next to the conversation menu/title; toggles a local `searchOpen` that renders `<SearchPanel onClose={…}/>` over the conversation-list column (desktop) / full panel (mobile). Don't regress Phase-1 dialog a11y.

- [ ] **Step 3: Scroll-to-message in `message-list.tsx`** — accept `focusMessageId?: string | null` + `onFocused?: () => void`. On change, if a message with that id is rendered, `scrollIntoView({ block: "center" })` + briefly add a highlight class (pastel ring, ~1.2s, respects reduced-motion), then call `onFocused`. Wire from `chat-sheet.tsx`: pass `focusMessageId={useChatStore().focusMessageId}` and `onFocused={clearFocusMessage}`. If not found in the loaded window, call `onFocused` anyway (no-op scroll) — deep paging is out of scope (log once).

- [ ] **Step 4: Verify + commit.**

```bash
git -C /Users/ali/scheniders-mono add apps/platform/components/chat/search-panel.tsx apps/platform/components/chat/message-list.tsx apps/platform/components/chat/chat-sheet.tsx
git -C /Users/ali/scheniders-mono commit -m "feat(chat): message search panel + scroll-to-message"
```

---

## Task 6: Jump-to-conversation picker + filter chips (B2 + B3)

**Files:** Create `apps/platform/components/chat/conversation-jump.tsx`; Modify `apps/platform/components/chat/conversation-list.tsx`

- [ ] **Step 1: `conversation-jump.tsx`** — a launcher button (in the list header next to "+") opening a `Dialog`/`Popover` with a text input; builds candidates from `useConversations()` (names via the existing `nameFor` logic) + teammates from `useTenantMembers()`; ranks with `fuzzyRank`; row click → `setActiveConversation(id)` (or start a DM for a teammate via `useStartDm`) + close. Button only, no hotkey.

- [ ] **Step 2: Filter chips in `conversation-list.tsx`** — add a chip row under the header: All / Unread / Mentions / Channels / Direct / Orders / Archived (labels via `t("chat.filter.*")`). Local `filter` state. Apply `filterConversations(conversations, filter, mentionConvIds)` before grouping into Sections; `mentionConvIds` from `useMentionNotifications()` (`new Set(notifs.map(n => n.conversation_id).filter(Boolean))`). "archived" hides the live sections and shows the archived list (reuse the 2A archived disclosure content / `useArchivedConversations()`). Active chip uses a pastel token. Mount the jump launcher here too.

- [ ] **Step 3: Verify + commit.**

```bash
git -C /Users/ali/scheniders-mono add apps/platform/components/chat/conversation-jump.tsx apps/platform/components/chat/conversation-list.tsx
git -C /Users/ali/scheniders-mono commit -m "feat(chat): jump-to-conversation picker + list filters"
```

---

## Task 7: Scroll-to-unread pill + date jump (B4)

**Files:** Modify `apps/platform/components/chat/message-list.tsx`

- [ ] **Step 1:** When `firstUnreadId` (already a prop from Phase 1) is set and is scrolled out of view above, show a small floating pill ("↑ {t('chat.jumpToUnread','New messages above')}") that scrolls the unread divider into view. Complements the existing jump-to-latest pill (don't show both for the same direction). Reduced-motion respected.
- [ ] **Step 2 (date jump):** make each existing sticky day separator clickable to scroll its day's first message to the top (cheap: the separator already marks the boundary — `scrollIntoView`). Add an `aria-label`.
- [ ] **Step 3: Verify + commit.**

```bash
git -C /Users/ali/scheniders-mono add apps/platform/components/chat/message-list.tsx
git -C /Users/ali/scheniders-mono commit -m "feat(chat): jump-to-unread pill + clickable date separators"
```

---

## Task 8: Order-thread filter (B5)

**Files:** Modify `apps/platform/components/chat/conversation-list.tsx` (Orders section)

- [ ] **Step 1:** For `kind='order'` rows, look up the linked order from `OrdersContext` (by `conversation.order_id`) — reuse however `use-reference-search`/the orders context exposes orders. Render the order's status chip + total (IQD, existing currency formatter) on the row. When the "Orders" filter is active, show a small status filter (all / a chosen status) + an optional min-value input; filter the order rows client-side. If an order isn't loaded in context, render the thread by name only (no crash).
- [ ] **Step 2: Verify + commit.**

```bash
git -C /Users/ali/scheniders-mono add apps/platform/components/chat/conversation-list.tsx
git -C /Users/ali/scheniders-mono commit -m "feat(chat): order-thread status/value filter"
```

---

## Task 9: i18n + final gates + types

**Files:** Modify `apps/platform/lib/i18n.ts`

- [ ] **Step 1:** Add EN+AR keys (both blocks): `chat.search`, `chat.searchPlaceholder`, `chat.searchEmpty`, `chat.searchNoResults`, `chat.jumpTo`, `chat.jumpToUnread`, `chat.filter.all`, `chat.filter.unread`, `chat.filter.mentions`, `chat.filter.channels`, `chat.filter.direct`, `chat.filter.orders`, `chat.filter.archived`, `chat.orderStatus`, plus any others the components reference.
- [ ] **Step 2:** `pnpm --filter @scheniders/platform exec vitest run lib/chat/filter-conversations.test.ts lib/chat/fuzzy.test.ts lib/i18n-completeness.test.ts` → all pass. `type-check` + `lint` → 0 errors.
- [ ] **Step 3 (MCP up):** `pnpm generate-types` equivalent — regenerate `database.types.ts` via `mcp__supabase__generate_typescript_types`, write the `types` field to `packages/supabase/src/database.types.ts`, confirm the diff is only `chat_search_messages` (+ no unrelated drift), type-check, commit.
- [ ] **Step 4: Commit i18n.**

```bash
git -C /Users/ali/scheniders-mono add apps/platform/lib/i18n.ts
git -C /Users/ali/scheniders-mono commit -m "i18n(chat): Phase 2B search + navigation strings (en+ar)"
```

---

## Task 10: Holistic review + live smoke
- [ ] Final reviewer over the 2B client diff: membership-scoping intact (RPC), no `any`/`@ts-ignore`/unjustified disable, search highlight can't inject HTML (« » are literal, rendered as text/marks), filters/jump correct, no Phase-1/2A regression, i18n EN+AR complete.
- [ ] Live: search a known term → highlighted result opens + scrolls to the message; filters/jump/order-filter behave; 2-user check that search is membership-scoped (user B can't find user A's private-channel message).

---

## Self-Review (coverage map)
- **B1 search** → Task 1 (index + RPC) · 4 (hook + type + store) · 5 (panel + scroll-to-message).
- **B2 jump** → Task 3 (`fuzzyRank`) · 6 (picker).
- **B3 filters** → Task 2 (`filterConversations`) · 6 (chips).
- **B4 scroll-to-unread + date jump** → Task 7.
- **B5 order-thread filter** → Task 8.
- **i18n / gates / types / review** → Tasks 9–10.
