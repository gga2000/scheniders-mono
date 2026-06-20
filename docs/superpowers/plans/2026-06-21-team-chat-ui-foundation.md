# Team Chat UI Foundation (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the chat surface's visual + accessibility foundation — deterministic initials/color avatars with live status, skeletons/empty-states, animate-once + reduced-motion, an unread divider, and a dialog a11y pass — so every later phase is built to one bar.

**Architecture:** Two pure, unit-tested utilities (`avatar-identity`, `unread`) carry all the logic. A single `ChatAvatar` component consumes the avatar util and supersedes the bare `@scheniders/ui` `Avatar` for chat (it adds initials, deterministic pastel color, `xs` sizing, and an onError→initials fallback the shared one lacks). Live presence status reaches list avatars through a tiny zustand store written by the **one existing** tenant-presence subscription (no second realtime channel). Presentation changes (empty states, skeletons, unread divider, motion, a11y) layer onto the existing components.

**Tech Stack:** Next.js 16 / React 19, TypeScript (strict), zustand, framer-motion, Tailwind v4 (CSS custom-property tokens), TanStack Query, Vitest.

**Conventions (apply throughout):**
- Spec: `docs/superpowers/specs/2026-06-21-team-chat-enhancements-design.md` §5.
- Design tokens only — `--pastel-*`, `--ink`, `--background`, `--card-bg`, `--card-border`, `--foreground`, `--muted-foreground`. No raw hex.
- Every user-facing string via `t(key, fallback)`. LTR only.
- Verification commands assume pnpm on PATH. If `pnpm` is "command not found", prefix once: `export PATH="/opt/homebrew/bin:$PATH"` (Corepack-managed pnpm; Node 24 is fine for type-check/test, only `install` must use Node 20).
- Type-check: `pnpm --filter @scheniders/platform type-check`. Lint: `pnpm --filter @scheniders/platform lint`. Unit test a file: `pnpm --filter @scheniders/platform exec vitest run <relative/path.test.ts>`.

---

## Task 1: `avatar-identity` util — initials + deterministic pastel color (M2)

**Files:**
- Create: `apps/platform/lib/chat/avatar-identity.ts`
- Test: `apps/platform/lib/chat/avatar-identity.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/platform/lib/chat/avatar-identity.test.ts
import { describe, it, expect } from "vitest";
import { initials, colorFromId, AVATAR_PALETTE } from "./avatar-identity";

describe("initials", () => {
    it("uses first + last token", () => {
        expect(initials("Mohammed Ali")).toBe("MA");
    });
    it("handles a single token (up to 2 chars)", () => {
        expect(initials("noor")).toBe("NO");
    });
    it("handles Arabic names", () => {
        expect(initials("نور محمد")).toBe("نم");
    });
    it("falls back to ? for empty/whitespace", () => {
        expect(initials("   ")).toBe("?");
        expect(initials("")).toBe("?");
    });
    it("collapses extra whitespace", () => {
        expect(initials("  Ali   Hassan  ")).toBe("AH");
    });
});

describe("colorFromId", () => {
    it("is deterministic for the same id", () => {
        expect(colorFromId("user-123")).toEqual(colorFromId("user-123"));
    });
    it("returns a palette entry (pastel bg + ink fg)", () => {
        const c = colorFromId("user-123");
        expect(AVATAR_PALETTE).toContainEqual(c);
        expect(c.fg).toBe("var(--ink)");
    });
    it("spreads ids across more than one bucket", () => {
        const ids = Array.from({ length: 50 }, (_, i) => `id-${i}`);
        const buckets = new Set(ids.map((id) => colorFromId(id).bg));
        expect(buckets.size).toBeGreaterThan(1);
    });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `pnpm --filter @scheniders/platform exec vitest run lib/chat/avatar-identity.test.ts`
Expected: FAIL — `Failed to resolve import "./avatar-identity"`.

- [ ] **Step 3: Write the implementation**

```ts
// apps/platform/lib/chat/avatar-identity.ts
// Deterministic, dependency-free avatar identity for the chat surface.
// Same user id → same pastel everywhere; no Math.random (would break SSR + stability).

export interface AvatarColor {
    bg: string;
    fg: string;
}

/** The six pastel accent tokens, paired with ink text for AA contrast on light fills. */
export const AVATAR_PALETTE: AvatarColor[] = [
    { bg: "var(--pastel-yellow)", fg: "var(--ink)" },
    { bg: "var(--pastel-pink)", fg: "var(--ink)" },
    { bg: "var(--pastel-green)", fg: "var(--ink)" },
    { bg: "var(--pastel-mint)", fg: "var(--ink)" },
    { bg: "var(--pastel-purple)", fg: "var(--ink)" },
    { bg: "var(--pastel-blue)", fg: "var(--ink)" },
];

/** 1–2 letters from a display name. Spread-aware so multi-byte glyphs aren't split. */
export function initials(name: string): string {
    const tokens = name.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return "?";
    if (tokens.length === 1) return [...tokens[0]].slice(0, 2).join("").toUpperCase();
    const first = [...tokens[0]][0] ?? "";
    const last = [...tokens[tokens.length - 1]][0] ?? "";
    return (first + last).toUpperCase();
}

/** Stable string hash → palette bucket. FNV-ish, unsigned. */
export function colorFromId(id: string): AvatarColor {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `pnpm --filter @scheniders/platform exec vitest run lib/chat/avatar-identity.test.ts`
Expected: PASS (8 assertions).

- [ ] **Step 5: Commit**

```bash
git add apps/platform/lib/chat/avatar-identity.ts apps/platform/lib/chat/avatar-identity.test.ts
git commit -m "feat(chat): deterministic avatar initials + pastel color util"
```

---

## Task 2: `unread` boundary helper (M4)

**Files:**
- Create: `apps/platform/lib/chat/unread.ts`
- Test: `apps/platform/lib/chat/unread.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/platform/lib/chat/unread.test.ts
import { describe, it, expect } from "vitest";
import { firstUnreadMessageId } from "./unread";

const me = "me";
const msgs = [
    { id: "a", created_at: "2026-06-21T10:00:00Z", sender_id: "other" },
    { id: "b", created_at: "2026-06-21T10:05:00Z", sender_id: "me" },
    { id: "c", created_at: "2026-06-21T10:10:00Z", sender_id: "other" },
    { id: "d", created_at: "2026-06-21T10:15:00Z", sender_id: "other" },
];

describe("firstUnreadMessageId", () => {
    it("returns the first message from others after lastReadAt", () => {
        expect(firstUnreadMessageId(msgs, "2026-06-21T10:06:00Z", me)).toBe("c");
    });
    it("skips my own messages when finding the boundary", () => {
        // lastRead just before b (mine) and c (other) → boundary is c, not b
        expect(firstUnreadMessageId(msgs, "2026-06-21T10:04:00Z", me)).toBe("c");
    });
    it("returns null when everything is read", () => {
        expect(firstUnreadMessageId(msgs, "2026-06-21T11:00:00Z", me)).toBeNull();
    });
    it("returns the earliest unread when all are unread", () => {
        expect(firstUnreadMessageId(msgs, "2026-06-21T09:00:00Z", me)).toBe("a");
    });
    it("returns null when lastReadAt is null", () => {
        expect(firstUnreadMessageId(msgs, null, me)).toBeNull();
    });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `pnpm --filter @scheniders/platform exec vitest run lib/chat/unread.test.ts`
Expected: FAIL — `Failed to resolve import "./unread"`.

- [ ] **Step 3: Write the implementation**

```ts
// apps/platform/lib/chat/unread.ts
// Pure helper: where does the "New messages" divider go? The first message from
// someone else whose created_at is strictly after the reader's frozen last_read_at.
// Messages are expected ascending by created_at. ISO timestamptz strings compare
// lexically in chronological order.

interface UnreadMsg {
    id: string;
    created_at: string;
    sender_id: string;
}

export function firstUnreadMessageId(
    messages: UnreadMsg[],
    lastReadAt: string | null,
    myUserId: string
): string | null {
    if (!lastReadAt) return null;
    for (const m of messages) {
        if (m.sender_id === myUserId) continue;
        if (m.created_at > lastReadAt) return m.id;
    }
    return null;
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `pnpm --filter @scheniders/platform exec vitest run lib/chat/unread.test.ts`
Expected: PASS (5 assertions).

- [ ] **Step 5: Commit**

```bash
git add apps/platform/lib/chat/unread.ts apps/platform/lib/chat/unread.test.ts
git commit -m "feat(chat): unread-divider boundary helper"
```

---

## Task 3: presence store + read-only selector + single-writer wiring (M2)

Live status must reach list avatars **without** opening a second presence channel — the message list explicitly avoids that (see `message-list.tsx:43-46`). Solution: the one existing subscription (`useTenantPresence`, owned by `LivePresenceStack`) writes a `{ userId: status }` map into a zustand store; everyone else reads it.

**Files:**
- Create: `apps/platform/store/use-presence-store.ts`
- Modify: `apps/platform/hooks/chat/use-tenant-presence.ts` (write to store on each presence sync)

- [ ] **Step 1: Create the store + selector**

```ts
// apps/platform/store/use-presence-store.ts
import { create } from "zustand";
import type { PresenceStatus } from "@/hooks/chat/use-tenant-presence";

interface PresenceState {
    statuses: Record<string, PresenceStatus>;
    setStatuses: (next: Record<string, PresenceStatus>) => void;
}

/** Live online status by user id. WRITTEN by the single tenant-presence subscription
 *  (LivePresenceStack via useTenantPresence) and READ by avatar consumers — no consumer
 *  here opens a realtime channel, so the single-subscription invariant holds. */
export const usePresenceStore = create<PresenceState>((set) => ({
    statuses: {},
    setStatuses: (next) => set({ statuses: next }),
}));

/** Read one user's live status without subscribing to realtime. Absent → "offline". */
export function usePresenceStatus(userId: string | null | undefined): PresenceStatus | "offline" {
    return usePresenceStore((s) => (userId ? s.statuses[userId] : undefined) ?? "offline");
}
```

- [ ] **Step 2: Wire the writer in `useTenantPresence`**

In `apps/platform/hooks/chat/use-tenant-presence.ts`, add the import near the top (after the existing imports):

```ts
import { usePresenceStore } from "@/store/use-presence-store";
```

Then, inside the `.on("presence", { event: "sync" }, ...)` handler, after `setOnlineUsers(unique);` (currently `use-tenant-presence.ts:67`), push the status map to the store:

```ts
                setOnlineUsers(unique);
                usePresenceStore.getState().setStatuses(
                    Object.fromEntries(unique.map((u) => [u.id, u.status]))
                );
```

(`getState()` is used so the writer never subscribes the hook to store changes.)

- [ ] **Step 3: Verify type-check + lint**

Run: `pnpm --filter @scheniders/platform type-check`
Expected: PASS (no output / exit 0).
Run: `pnpm --filter @scheniders/platform lint`
Expected: PASS (0 errors; warnings tolerated).

- [ ] **Step 4: Commit**

```bash
git add apps/platform/store/use-presence-store.ts apps/platform/hooks/chat/use-tenant-presence.ts
git commit -m "feat(chat): presence status store fed by the single presence subscription"
```

---

## Task 4: `ChatAvatar` component (M2)

Supersedes the bare `@scheniders/ui` `Avatar` for chat: deterministic initials + pastel color, `xs`–`lg` sizes, onError→initials fallback, optional live status dot + ring.

**Files:**
- Create: `apps/platform/components/chat/chat-avatar.tsx`

- [ ] **Step 1: Create the component**

```tsx
// apps/platform/components/chat/chat-avatar.tsx
"use client";
import { useState } from "react";
import { initials, colorFromId } from "@/lib/chat/avatar-identity";
import type { PresenceStatus } from "@/hooks/chat/use-tenant-presence";

const BOX = {
    xs: "h-6 w-6 text-[10px]",
    sm: "h-8 w-8 text-[11px]",
    md: "h-10 w-10 text-sm",
    lg: "h-12 w-12 text-base",
} as const;

const DOT = {
    xs: "h-2 w-2",
    sm: "h-2.5 w-2.5",
    md: "h-3 w-3",
    lg: "h-3.5 w-3.5",
} as const;

const STATUS_COLOR: Record<PresenceStatus | "offline", string> = {
    online: "bg-green-500",
    idle: "bg-amber-500",
    away: "bg-gray-300",
    offline: "",
};

export type ChatAvatarSize = keyof typeof BOX;

export function ChatAvatar({
    userId,
    name,
    avatarUrl,
    size = "sm",
    status = "offline",
    showStatus = false,
    ringClassName,
    dotBorderClassName = "border-[var(--background)]",
    className,
}: {
    userId: string;
    name: string;
    avatarUrl?: string | null;
    size?: ChatAvatarSize;
    status?: PresenceStatus | "offline";
    showStatus?: boolean;
    ringClassName?: string;
    dotBorderClassName?: string;
    className?: string;
}) {
    const [errored, setErrored] = useState(false);
    const color = colorFromId(userId);
    const showImg = !!avatarUrl && !errored;
    const dotColor = STATUS_COLOR[status];

    return (
        <span className={`relative inline-flex shrink-0 ${className ?? ""}`}>
            {showImg ? (
                // eslint-disable-next-line @next/next/no-img-element -- chat avatar needs an onError→initials fallback and xs sizing that the shared next/image Avatar cannot provide (same pattern already used in composer.tsx)
                <img
                    src={avatarUrl ?? undefined}
                    alt={name}
                    onError={() => setErrored(true)}
                    className={`rounded-full object-cover ${BOX[size]} ${ringClassName ?? ""}`}
                />
            ) : (
                <span
                    aria-hidden="true"
                    className={`flex items-center justify-center rounded-full font-semibold ${BOX[size]} ${ringClassName ?? ""}`}
                    style={{ backgroundColor: color.bg, color: color.fg }}
                >
                    {initials(name)}
                </span>
            )}
            {showStatus && dotColor && (
                <span
                    className={`absolute -bottom-0.5 -right-0.5 rounded-full border-2 ${dotBorderClassName} ${DOT[size]} ${dotColor}`}
                />
            )}
        </span>
    );
}
```

- [ ] **Step 2: Verify type-check**

Run: `pnpm --filter @scheniders/platform type-check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/platform/components/chat/chat-avatar.tsx
git commit -m "feat(chat): ChatAvatar with initials, pastel color, status dot"
```

---

## Task 5: Adopt `ChatAvatar` at all chat call sites (M2)

Replace ad-hoc avatars so every chat surface uses the deterministic identity. Status dots only where a live signal exists (directory + presence stack); the message timeline stays dot-free to avoid per-row noise (spec §5.4).

**Files:**
- Modify: `apps/platform/components/chat/message-item.tsx`
- Modify: `apps/platform/components/chat/conversation-list.tsx`
- Modify: `apps/platform/components/chat/live-presence-stack.tsx`
- Modify: `apps/platform/components/chat/composer.tsx`

- [ ] **Step 1: `message-item.tsx` — swap the avatar**

Change the import on line 4 from:
```tsx
import { Avatar } from "@scheniders/ui";
```
to:
```tsx
import { ChatAvatar } from "./chat-avatar";
```

Replace line 49:
```tsx
            <Avatar src={senderAvatar ?? undefined} alt={senderName} size="sm" />
```
with:
```tsx
            <ChatAvatar userId={message.sender_id} name={senderName} avatarUrl={senderAvatar} size="sm" />
```

- [ ] **Step 2: `conversation-list.tsx` — directory rows get identity + live status**

Add imports (after the existing `Avatar` import on line 5 — and remove the now-unused `Avatar` import):
```tsx
import { ChatAvatar } from "./chat-avatar";
import { usePresenceStore } from "@/store/use-presence-store";
```
Delete line 5 `import { Avatar } from "@scheniders/ui";` (no longer used).

In the `TeamDirectory` component, read the status map at the top of the function body (just inside `TeamDirectory`, before `if (members.length === 0)`):
```tsx
    const statuses = usePresenceStore((s) => s.statuses);
```
Replace the avatar on line 101:
```tsx
                        <Avatar src={m.avatar_url ?? undefined} alt={m.display_name} size="sm" />
```
with:
```tsx
                        <ChatAvatar
                            userId={m.user_id}
                            name={m.display_name}
                            avatarUrl={m.avatar_url}
                            size="sm"
                            status={statuses[m.user_id] ?? "offline"}
                            showStatus
                        />
```

- [ ] **Step 3: `live-presence-stack.tsx` — replace Avatar + hand-rolled dot**

Remove line 4 `import { Avatar } from "@scheniders/ui";` and the `dot` const on line 11. Add:
```tsx
import { ChatAvatar } from "./chat-avatar";
```

Replace the stacked-avatar block (lines 41-45):
```tsx
                            {otherUsers.slice(0, 3).map((u) => (
                                <span key={u.id} className="relative inline-block rounded-full ring-2 ring-[var(--background)] transition-transform hover:z-10 hover:-translate-y-0.5">
                                    <Avatar src={u.avatar_url} alt={u.display_name} size="sm" />
                                    <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[var(--background)] ${dot[u.status]}`} />
                                </span>
                            ))}
```
with:
```tsx
                            {otherUsers.slice(0, 3).map((u) => (
                                <span key={u.id} className="relative inline-block transition-transform hover:z-10 hover:-translate-y-0.5">
                                    <ChatAvatar
                                        userId={u.id}
                                        name={u.display_name}
                                        avatarUrl={u.avatar_url}
                                        size="sm"
                                        status={u.status}
                                        showStatus
                                        ringClassName="ring-2 ring-[var(--background)]"
                                    />
                                </span>
                            ))}
```

Replace the popover-list avatar block (lines 80-83):
```tsx
                                <span className="relative shrink-0">
                                    <Avatar src={u.avatar_url} alt={u.display_name} size="sm" />
                                    <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--card-bg)] ${dot[u.status]}`} />
                                </span>
```
with:
```tsx
                                <ChatAvatar
                                    userId={u.id}
                                    name={u.display_name}
                                    avatarUrl={u.avatar_url}
                                    size="sm"
                                    status={u.status}
                                    showStatus
                                    dotBorderClassName="border-[var(--card-bg)]"
                                />
```

- [ ] **Step 4: `composer.tsx` — mention dropdown uses ChatAvatar**

Add the import near the other component imports at the top of `composer.tsx`:
```tsx
import { ChatAvatar } from "./chat-avatar";
```
Replace the avatar conditional (lines 385-396):
```tsx
                                        {m.avatar_url ? (
                                            // eslint-disable-next-line @next/next/no-img-element -- small avatar inside a popover; next/image overhead unwarranted
                                            <img
                                                src={m.avatar_url}
                                                alt=""
                                                className="h-6 w-6 rounded-full object-cover"
                                            />
                                        ) : (
                                            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-[10px] font-bold text-indigo-700">
                                                {m.display_name.slice(0, 1).toUpperCase()}
                                            </span>
                                        )}
```
with:
```tsx
                                        <ChatAvatar userId={m.user_id} name={m.display_name} avatarUrl={m.avatar_url} size="xs" />
```

- [ ] **Step 5: Verify type-check + lint**

Run: `pnpm --filter @scheniders/platform type-check`
Expected: PASS (no unused-import errors — confirms every `Avatar` import was removed where swapped).
Run: `pnpm --filter @scheniders/platform lint`
Expected: PASS (0 errors).

- [ ] **Step 6: Commit**

```bash
git add apps/platform/components/chat/message-item.tsx apps/platform/components/chat/conversation-list.tsx apps/platform/components/chat/live-presence-stack.tsx apps/platform/components/chat/composer.tsx
git commit -m "feat(chat): adopt ChatAvatar across message/list/presence/composer"
```

---

## Task 6: `ChatEmptyState` + message-list loading skeleton (M1)

The orders `EmptyState` is order-domain (`type: "no-orders" | ...`) and the wrong fit; build a small chat-specific one and DRY the two inline empties. Also fix a real gap: while messages are loading, `MessageList` currently shows the "No messages yet" empty state (because `messages` is `[]` during fetch) — replace with skeletons.

**Files:**
- Create: `apps/platform/components/chat/chat-empty-state.tsx`
- Modify: `apps/platform/components/chat/message-list.tsx`
- Modify: `apps/platform/components/chat/chat-sheet.tsx` (pass `loading`)

- [ ] **Step 1: Create `ChatEmptyState`**

```tsx
// apps/platform/components/chat/chat-empty-state.tsx
"use client";
import type { LucideIcon } from "lucide-react";

/** Calm, centered empty state for chat surfaces (no order-domain coupling). */
export function ChatEmptyState({
    icon: Icon,
    title,
    description,
}: {
    icon: LucideIcon;
    title: string;
    description: string;
}) {
    return (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-10 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--card-bg)] text-muted-foreground shadow-sm ring-1 ring-[var(--card-border)]">
                <Icon className="h-6 w-6" />
            </span>
            <div>
                <p className="text-sm font-semibold text-foreground">{title}</p>
                <p className="mt-1 text-xs text-muted-foreground">{description}</p>
            </div>
        </div>
    );
}
```

- [ ] **Step 2: Use it + add skeletons in `message-list.tsx`**

Add a `loading` prop and a message skeleton. Update the signature on line 23:
```tsx
export function MessageList({ messages, loading }: { messages: ChatMessage[]; loading?: boolean }) {
```
Add the import (with the existing imports at the top):
```tsx
import { ChatEmptyState } from "./chat-empty-state";
```
Replace the empty-state block (lines 64-80) with a loading branch + the shared empty state:
```tsx
    if (loading && messages.length === 0) {
        return (
            <div className="flex-1 space-y-4 overflow-hidden px-4 py-3">
                {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="flex gap-2.5" style={{ opacity: 1 - i * 0.12 }}>
                        <div className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-foreground/10" />
                        <div className="flex-1 space-y-1.5">
                            <div className="h-3 w-24 animate-pulse rounded bg-foreground/10" />
                            <div className="h-3 animate-pulse rounded bg-foreground/5" style={{ width: `${60 + ((i * 13) % 35)}%` }} />
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    if (messages.length === 0) {
        return (
            <ChatEmptyState
                icon={MessageSquareDashed}
                title={t("chat.emptyMessages", "No messages yet")}
                description={t("chat.emptyMessagesDesc", "Say hi 👋 — be the first to post here.")}
            />
        );
    }
```

- [ ] **Step 3: Pass `loading` from `chat-sheet.tsx`**

In `apps/platform/components/chat/chat-sheet.tsx`, destructure `isLoading` from `useMessages` (line 19):
```tsx
    const { data: messages = [], sendMessage, markRead, isLoading } = useMessages(activeConversationId);
```
Update the `<MessageList ... />` usage (line 98) to pass it:
```tsx
                                        <MessageList messages={messages} loading={isLoading} />
```

- [ ] **Step 4: (Optional DRY) route the conversation-list empty through `ChatEmptyState`**

In `conversation-list.tsx`, replace the inline empty block (lines 215-227) body with:
```tsx
                    {conversations.length === 0 && directoryMembers.length === 0 && (
                        <ChatEmptyState
                            icon={MessagesSquare}
                            title={t("chat.emptyConversations", "No conversations yet")}
                            description={t("chat.emptyTeam", "You're the only member of this workspace so far.")}
                        />
                    )}
```
Add `import { ChatEmptyState } from "./chat-empty-state";` to the imports. Keep `MessagesSquare` in the existing lucide import.

- [ ] **Step 5: Verify**

Run: `pnpm --filter @scheniders/platform type-check`
Expected: PASS.
Run: `pnpm --filter @scheniders/platform lint`
Expected: PASS (0 errors).

- [ ] **Step 6: Commit**

```bash
git add apps/platform/components/chat/chat-empty-state.tsx apps/platform/components/chat/message-list.tsx apps/platform/components/chat/chat-sheet.tsx apps/platform/components/chat/conversation-list.tsx
git commit -m "feat(chat): shared empty state + message-list loading skeleton"
```

---

## Task 7: Unread divider (M4)

Freeze each conversation's `my_last_read_at` at open (before `markRead` advances it), compute the boundary with the Task-2 helper, and render a "New messages" divider in the timeline.

**Files:**
- Modify: `apps/platform/components/chat/chat-sheet.tsx`
- Modify: `apps/platform/components/chat/message-list.tsx`

- [ ] **Step 1: Freeze last-read + compute boundary in `chat-sheet.tsx`**

Add imports:
```tsx
import { useConversations } from "@/hooks/chat/use-conversations";
import { useAuth } from "@/hooks/use-auth";
import { firstUnreadMessageId } from "@/lib/chat/unread";
import { useMemo, useRef } from "react";
```
(Merge `useMemo`/`useRef` into the existing `react` import — the file already imports `useEffect`.)

Inside `ChatSheet`, after the existing hooks, add:
```tsx
    const { user } = useAuth();
    const { data: conversations = [] } = useConversations();

    // Freeze my_last_read_at per conversation at open, BEFORE markRead advances it,
    // so the divider boundary doesn't jump while you read. Cleared when the sheet closes.
    const frozenLastRead = useRef<Record<string, string | null>>({});
    useEffect(() => {
        if (!isOpen) {
            frozenLastRead.current = {};
            return;
        }
        if (!activeConversationId || activeConversationId in frozenLastRead.current) return;
        const conv = conversations.find((c) => c.id === activeConversationId);
        if (conv) frozenLastRead.current[activeConversationId] = conv.my_last_read_at;
    }, [isOpen, activeConversationId, conversations]);

    const firstUnreadId = useMemo(
        () =>
            activeConversationId && user
                ? firstUnreadMessageId(messages, frozenLastRead.current[activeConversationId] ?? null, user.id)
                : null,
        [messages, activeConversationId, user]
    );
```
Pass it to the list (extending the Task-6 usage):
```tsx
                                        <MessageList messages={messages} loading={isLoading} firstUnreadId={firstUnreadId} />
```

- [ ] **Step 2: Render the divider in `message-list.tsx`**

Extend the signature:
```tsx
export function MessageList({
    messages,
    loading,
    firstUnreadId,
}: {
    messages: ChatMessage[];
    loading?: boolean;
    firstUnreadId?: string | null;
}) {
```
Add the import:
```tsx
import { Sparkles } from "lucide-react";
```
(Append `Sparkles` to the existing `lucide-react` import line instead of a second import.)

Inside the `messages.map(...)` return, render the divider immediately before the matching `<MessageItem>`. Replace the mapped block body (lines 102-119) with:
```tsx
                return (
                    <div key={m.client_msg_id ?? m.id}>
                        {showSeparator && (
                            <div className="sticky top-0 z-[1] flex items-center gap-3 px-4 py-2">
                                <span className="h-px flex-1 bg-[var(--card-border)]" />
                                <span className="rounded-full bg-[var(--card-bg)] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground shadow-sm ring-1 ring-[var(--card-border)]">
                                    {dayLabel(m.created_at, language)}
                                </span>
                                <span className="h-px flex-1 bg-[var(--card-border)]" />
                            </div>
                        )}
                        {firstUnreadId === m.id && (
                            <div className="flex items-center gap-2 px-4 py-1.5">
                                <span className="h-px flex-1 bg-[var(--pastel-pink)]" />
                                <span className="inline-flex items-center gap-1 rounded-full bg-[var(--pastel-pink)] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--ink)]">
                                    <Sparkles className="h-3 w-3" />
                                    {t("chat.newMessages", "New messages")}
                                </span>
                                <span className="h-px flex-1 bg-[var(--pastel-pink)]" />
                            </div>
                        )}
                        <MessageItem
                            message={m}
                            senderName={u?.display_name ?? "Teammate"}
                            senderAvatar={u?.avatar_url}
                        />
                    </div>
                );
```
(Note the key change to `m.client_msg_id ?? m.id` — this is also required by Task 8 for animate-once.)

- [ ] **Step 3: Verify**

Run: `pnpm --filter @scheniders/platform type-check`
Expected: PASS.
Run: `pnpm --filter @scheniders/platform lint`
Expected: PASS (0 errors).

- [ ] **Step 4: Commit**

```bash
git add apps/platform/components/chat/chat-sheet.tsx apps/platform/components/chat/message-list.tsx
git commit -m "feat(chat): New messages unread divider frozen at open"
```

---

## Task 8: Motion polish — reduced-motion + animate-once (M3)

**Files:**
- Modify: `apps/platform/components/chat/message-item.tsx`

(The `key={m.client_msg_id ?? m.id}` change from Task 7 already prevents the optimistic→saved id swap from replaying the enter animation. This task makes the enter animation respect `prefers-reduced-motion`.)

- [ ] **Step 1: Respect reduced motion in `message-item.tsx`**

Change the import on line 3:
```tsx
import { motion, useReducedMotion } from "framer-motion";
```
At the top of `MessageItem` (after `const { t } = useLanguage();`, before the `deleted_at` guard):
```tsx
    const reduceMotion = useReducedMotion();
```
Update the `motion.div` (lines 41-44) so the enter animation is skipped when reduced motion is requested:
```tsx
        <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 4 }}
            animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className={`group relative flex gap-2.5 px-4 py-1.5 transition-colors hover:bg-black/[0.025] ${
                message.pending ? "opacity-60" : ""
            }`}
        >
```

- [ ] **Step 2: Verify**

Run: `pnpm --filter @scheniders/platform type-check`
Expected: PASS.
Run: `pnpm --filter @scheniders/platform lint`
Expected: PASS (0 errors).

- [ ] **Step 3: Commit**

```bash
git add apps/platform/components/chat/message-item.tsx
git commit -m "feat(chat): respect prefers-reduced-motion on message enter"
```

---

## Task 9: Dialog accessibility — role/aria, Esc, focus trap + restore, aria-live (M5)

**Files:**
- Modify: `apps/platform/components/chat/chat-sheet.tsx`
- Modify: `apps/platform/components/chat/message-list.tsx`

- [ ] **Step 1: Dialog semantics + focus trap + restore + Esc in `chat-sheet.tsx`**

Add `KeyboardEvent` (the React synthetic-event type) to the react import — the file imports no default `React`, so use a named alias:
```tsx
import { type KeyboardEvent as ReactKeyboardEvent } from "react";
```
Add a ref + focus/keyboard effect. After the existing hooks in `ChatSheet`, add:
```tsx
    const dialogRef = useRef<HTMLElement>(null);
    const previouslyFocused = useRef<HTMLElement | null>(null);

    useEffect(() => {
        if (isOpen) {
            previouslyFocused.current = document.activeElement as HTMLElement | null;
            // Focus the first focusable element inside the dialog on the next frame
            // (after the panel mounts). Composer textarea wins when a conversation is open.
            requestAnimationFrame(() => {
                const root = dialogRef.current;
                if (!root) return;
                const first = root.querySelector<HTMLElement>(
                    'textarea, button, a[href], input, [tabindex]:not([tabindex="-1"])'
                );
                first?.focus();
            });
        } else {
            previouslyFocused.current?.focus?.();
        }
    }, [isOpen]);

    const onDialogKeyDown = (e: ReactKeyboardEvent) => {
        if (e.key === "Escape") {
            e.stopPropagation();
            close();
            return;
        }
        if (e.key !== "Tab") return;
        const root = dialogRef.current;
        if (!root) return;
        const focusables = Array.from(
            root.querySelectorAll<HTMLElement>(
                'textarea, button, a[href], input, [tabindex]:not([tabindex="-1"])'
            )
        ).filter((el) => !el.hasAttribute("disabled") && el.offsetParent !== null);
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement as HTMLElement | null;
        if (e.shiftKey && active === first) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && active === last) {
            e.preventDefault();
            first.focus();
        }
    };
```
Add `useRef` to the React import if not already present (Task 7 already added it). Then add the props to `motion.aside` — extend its opening tag (after `exit=...` / `transition=...`, before the closing `>`):
```tsx
                        ref={dialogRef}
                        role="dialog"
                        aria-modal="true"
                        aria-label={t("chat.title", "Team chat")}
                        onKeyDown={onDialogKeyDown}
```

- [ ] **Step 2: `aria-live` announcement of incoming messages in `message-list.tsx`**

Add, just inside the outer `return`'s top-level `<div className="relative flex min-h-0 flex-1 flex-col">` (right after it opens), a visually-hidden polite live region announcing the latest message:
```tsx
            <div aria-live="polite" className="sr-only">
                {(() => {
                    const last = messages[messages.length - 1];
                    if (!last) return "";
                    const who = memberMap.get(last.sender_id)?.display_name ?? "Teammate";
                    return last.deleted_at ? "" : `${who}: ${last.body}`;
                })()}
            </div>
```
(`sr-only` is a built-in Tailwind utility; `memberMap` and `messages` are already in scope.)

- [ ] **Step 3: Verify**

Run: `pnpm --filter @scheniders/platform type-check`
Expected: PASS.
Run: `pnpm --filter @scheniders/platform lint`
Expected: PASS (0 errors).

- [ ] **Step 4: Full unit-test sweep + final gates**

Run: `pnpm --filter @scheniders/platform exec vitest run lib/chat/avatar-identity.test.ts lib/chat/unread.test.ts`
Expected: PASS (both files, 13 assertions total).
Run: `pnpm --filter @scheniders/platform type-check`
Expected: PASS.
Run: `pnpm --filter @scheniders/platform lint`
Expected: PASS (0 errors).

- [ ] **Step 5: Commit**

```bash
git add apps/platform/components/chat/chat-sheet.tsx apps/platform/components/chat/message-list.tsx
git commit -m "feat(chat): dialog a11y — role/aria, focus trap + restore, aria-live"
```

---

## Task 10: Live verification (manual, 2-user where presence matters)

No automated coverage exists for these components (chat components need deep supabase/auth/query mocks); verify in the running app. The dev server is the user's `localhost:3000`.

- [ ] **Step 1: Visual + behavior checklist**

Open the chat dialog and confirm:
- [ ] Avatars without a photo show pastel-colored initials; the same teammate is the same color in the directory, message list, presence stack, and mention dropdown.
- [ ] A teammate online in another session shows a green status dot in the Team-members directory and presence stack; offline teammates show no dot.
- [ ] Opening a conversation with unread messages renders a single "New messages" divider at the correct boundary, and it does not move as you scroll/read.
- [ ] Switching into a conversation shows skeleton rows briefly, not the "No messages yet" empty state.
- [ ] Empty channel / empty DM / no-conversations all render the calm `ChatEmptyState`.
- [ ] New incoming messages animate once; existing messages don't replay their entrance on reaction/edit updates.
- [ ] With OS "reduce motion" on, messages appear without the slide/fade.
- [ ] `Esc` closes the dialog; focus returns to the chat trigger button; `Tab` stays within the dialog.

- [ ] **Step 2: Confirm gates one last time**

Run: `pnpm --filter @scheniders/platform type-check && pnpm --filter @scheniders/platform lint`
Expected: both PASS (0 errors).

---

## Self-Review Notes (coverage map)

- **M1 (skeletons/empty/loading):** Task 6 — `ChatEmptyState`, message-list loading skeletons, conversation-list empty DRY.
- **M2 (avatars + color-hash + online ring):** Tasks 1, 3, 4, 5 — `avatar-identity` util, presence store/selector, `ChatAvatar`, all call-site swaps.
- **M3 (restrained motion, animate-once, reduced-motion):** Tasks 7 (stable `client_msg_id` key) + 8 (`useReducedMotion`). The reaction-pop micro-animation from spec §5.4 is intentionally deferred (would require editing `reaction-bar.tsx` not yet inventoried) — flagged as a small follow-up, not part of this plan.
- **M4 (unread divider):** Tasks 2 (`firstUnreadMessageId` + tests) + 7 (freeze-at-open + render).
- **M5 (a11y: aria-live + focus trap):** Task 9.
- **No migrations** — entirely client/presentation, matching spec §5.7.
