# Header / TopBar Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the platform top bar's hard seam with a glitch-free frosted-glass surface, add a desktop scroll-to-hide header, declutter the action cluster, and fix the audit-confirmed perf/correctness bugs that made glass + scroll-hide break before.

**Architecture:** A new isolated `useHeadroom` hook drives a CSS-`transform` show/hide on a sticky `<header>`. A token-driven `.app-header` glass layer replaces ~130 lines of brittle dark-mode attribute selectors. All header overlays move to portaled Radix primitives so the glass stacking context and the scroll transform can't clip or drag them. The 200ms localStorage poll and the `return null` remount (the real flicker cause) are deleted.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind v4 (CSS-first), `@scheniders/ui` Radix wrappers (`dropdown-menu`, `popover`), TanStack Query, Zustand, Vitest + Testing Library (jsdom).

**Spec:** `docs/superpowers/specs/2026-06-24-header-topbar-redesign-design.md`

---

## File map

| File | Responsibility | Action |
|---|---|---|
| `apps/platform/hooks/use-headroom.ts` | Scroll-direction → `hidden` boolean | **Create** |
| `apps/platform/hooks/use-headroom.test.tsx` | Unit tests for the hook | **Create** |
| `apps/platform/hooks/use-auto-send.ts` | Cached auto-send GET + PUT (TanStack Query) | **Create** |
| `apps/platform/components/layout/global-search.tsx` | `TopBar` surface, cluster, scroll-hide wiring; portal `GlobalSearch` results | **Modify** |
| `apps/platform/components/layout/notifications-dropdown.tsx` | Portal the dropdown (Radix Popover) | **Modify** |
| `apps/platform/components/layout/header-action-button.tsx` | Shared 40px control style constant | **Create** |
| `apps/platform/components/chat/chat-trigger.tsx` | Atomic store selector | **Modify** |
| `apps/platform/components/chat/live-presence-stack.tsx` | Atomic store selector, fixed width, tokenize indigo | **Modify** |
| `apps/platform/components/orders/auto-send-toggle.tsx` | Use `useAutoSend`, tokenize colors, 1px border | **Modify** |
| `apps/platform/app/globals.css` | Add `.app-header` glass layer + z tokens; delete brittle dark block (1225-1358) | **Modify** |

**Constraints (from CLAUDE.md):** no `any`, `@ts-ignore`, `eslint-disable`, non-null `!` to silence, swallowed `try/catch`, poll/sleep hacks, hardcoded values. LTR only. Desktop-only scroll-hide. Don't touch Cmd+K or the orders/customers toolbar-collapse feature itself.

---

### Task 1: `useHeadroom` hook (TDD)

**Files:**
- Create: `apps/platform/hooks/use-headroom.ts`
- Test: `apps/platform/hooks/use-headroom.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/platform/hooks/use-headroom.test.tsx`:

```tsx
/// <reference types="vitest/globals" />
// @vitest-environment jsdom

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, act, cleanup } from "@testing-library/react";
import { useHeadroom, type UseHeadroomOptions } from "./use-headroom";

function setScrollY(px: number): void {
    Object.defineProperty(window, "scrollY", { configurable: true, writable: true, value: px });
    window.dispatchEvent(new Event("scroll"));
}

function Harness(props: UseHeadroomOptions): React.ReactElement {
    const { hidden } = useHeadroom(props);
    return <span data-testid="h">{hidden ? "hidden" : "shown"}</span>;
}

const text = () => screen.getByTestId("h").textContent;

beforeEach(() => {
    // Run rAF synchronously so scroll → state flush happens inside act().
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => { cb(0); return 0; });
    setScrollY(0);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("useHeadroom", () => {
    it("starts shown", () => {
        render(<Harness />);
        expect(text()).toBe("shown");
    });

    it("hides after scrolling down past the threshold", () => {
        render(<Harness threshold={64} />);
        act(() => setScrollY(200));
        expect(text()).toBe("hidden");
    });

    it("reveals on scroll up", () => {
        render(<Harness threshold={64} />);
        act(() => setScrollY(200));
        expect(text()).toBe("hidden");
        act(() => setScrollY(150));
        expect(text()).toBe("shown");
    });

    it("always shows near the top", () => {
        render(<Harness threshold={64} />);
        act(() => setScrollY(200));
        expect(text()).toBe("hidden");
        act(() => setScrollY(4));
        expect(text()).toBe("shown");
    });

    it("ignores deltas inside the deadzone", () => {
        render(<Harness threshold={64} deadzone={4} />);
        act(() => setScrollY(200));
        expect(text()).toBe("hidden");
        act(() => setScrollY(198)); // up by 2 < deadzone → no change
        expect(text()).toBe("hidden");
    });

    it("never hides while locked", () => {
        render(<Harness threshold={64} locked />);
        act(() => setScrollY(300));
        expect(text()).toBe("shown");
    });

    it("does nothing when disabled", () => {
        render(<Harness threshold={64} disabled />);
        act(() => setScrollY(300));
        expect(text()).toBe("shown");
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run apps/platform/hooks/use-headroom.test.tsx`
Expected: FAIL — `Failed to resolve import "./use-headroom"`.

- [ ] **Step 3: Write the hook**

Create `apps/platform/hooks/use-headroom.ts`:

```ts
"use client";

import { useEffect, useRef, useState } from "react";

export interface UseHeadroomOptions {
    /** px scrolled before hiding is allowed. Default 64. */
    threshold?: number;
    /** min |delta| to act on — kills jitter. Default 4. */
    deadzone?: number;
    /** when true, never hide (e.g. a header dropdown is open). Default false. */
    locked?: boolean;
    /** disable entirely (e.g. mobile). Default false. */
    disabled?: boolean;
}

/**
 * Direction-aware "headroom": hides the header on scroll-down past `threshold`,
 * reveals it on any scroll-up, and always shows it near the top. Reads scrollY
 * inside requestAnimationFrame (no layout thrash), updates at most once per frame,
 * and only flips a boolean — the actual movement is a CSS transform on the header,
 * so there is no per-frame re-render of the header subtree and no reflow.
 */
export function useHeadroom(options: UseHeadroomOptions = {}): { hidden: boolean } {
    const { threshold = 64, deadzone = 4, locked = false, disabled = false } = options;
    const [hidden, setHidden] = useState(false);
    const lastY = useRef(0);
    const ticking = useRef(false);
    const lockedRef = useRef(locked);
    lockedRef.current = locked;

    useEffect(() => {
        if (disabled || typeof window === "undefined") return;
        lastY.current = window.scrollY;

        const update = () => {
            ticking.current = false;
            if (lockedRef.current) return;
            const y = window.scrollY;
            const dy = y - lastY.current;
            if (Math.abs(dy) < deadzone) return;
            lastY.current = y;
            if (y < 8) { setHidden(false); return; }
            if (dy > 0 && y > threshold) setHidden(true);
            else if (dy < 0) setHidden(false);
        };

        const onScroll = () => {
            if (ticking.current) return;
            ticking.current = true;
            requestAnimationFrame(update);
        };

        window.addEventListener("scroll", onScroll, { passive: true });
        return () => window.removeEventListener("scroll", onScroll);
    }, [threshold, deadzone, disabled]);

    return { hidden: locked ? false : hidden };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run apps/platform/hooks/use-headroom.test.tsx`
Expected: PASS — 7 passed.

- [ ] **Step 5: Commit**

```bash
git add apps/platform/hooks/use-headroom.ts apps/platform/hooks/use-headroom.test.tsx
git commit -m "feat(header): add useHeadroom scroll-direction hook + tests"
```

---

### Task 2: Stop the churn in `TopBar` (delete poll + return-null, use usePathname)

This is the single most important fix — the 5×/sec re-render + remount is the real blur-flicker cause. Header must stay mounted.

**Files:**
- Modify: `apps/platform/components/layout/global-search.tsx:330-380`

- [ ] **Step 1: Replace the TopBar state/effect block**

In `global-search.tsx`, replace the `pathname`/toolbar-collapse state, the effect (lines ~333-371), and the two `return null` blocks (lines ~373-380) with nothing — delete them. The component keeps only `useAuth()` and `useRouter()` for now. The new top of `TopBar` becomes:

```tsx
export function TopBar({ onMenuClick, isMobile }: TopBarProps) {
    const { user, profile } = useAuth();

    return (
        <header className="sticky top-0 z-40">
```

Remove the now-unused imports/usages: delete `useRouter`/`router` if unused, and remove the `useEffect`/`useState` for `isOrdersToolbarCollapsed`/`isCustomersToolbarCollapsed`/`pathname`. (Leave `useState`/`useEffect` imports if still used elsewhere in the file — `GlobalSearch` uses them, so keep the import line.)

> Note: `onMenuClick` is still passed in but the mobile menu button lives in the mobile actions block; keep the prop in the signature. If `onMenuClick` is genuinely unused after this task, prefix-free removal is fine — verify with lint in Step 2.

- [ ] **Step 2: Verify type-check + lint pass**

Run: `pnpm --filter @scheniders/platform type-check`
Expected: PASS (no errors).
Run: `pnpm --filter @scheniders/platform lint`
Expected: no **new** errors (warnings OK per repo baseline).

- [ ] **Step 3: Manual smoke**

Run `pnpm dev:platform`, open `/orders`, collapse the orders toolbar. Expected: the global header **stays visible** (no longer disappears); the orders filter toolbar still collapses. Soft-navigate `/orders ↔ /dashboard` — no console hydration warning, header stable.

- [ ] **Step 4: Commit**

```bash
git add apps/platform/components/layout/global-search.tsx
git commit -m "fix(header): remove 200ms poll + return-null remount from TopBar"
```

---

### Task 3: Atomic Zustand selectors in chat header buttons

Without a selector, `useChatStore()` re-renders these on every chat keystroke (draft writes).

**Files:**
- Modify: `apps/platform/components/chat/chat-trigger.tsx:11`
- Modify: `apps/platform/components/chat/live-presence-stack.tsx:14`

- [ ] **Step 1: chat-trigger.tsx — use a selector**

Replace line 11:
```tsx
    const { open } = useChatStore();
```
with:
```tsx
    const open = useChatStore((s) => s.open);
```

- [ ] **Step 2: live-presence-stack.tsx — use a selector**

Replace line 14:
```tsx
    const { open } = useChatStore();
```
with:
```tsx
    const open = useChatStore((s) => s.open);
```

- [ ] **Step 3: Verify**

Run: `pnpm --filter @scheniders/platform type-check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/platform/components/chat/chat-trigger.tsx apps/platform/components/chat/live-presence-stack.tsx
git commit -m "perf(header): atomic chat-store selectors so typing doesn't re-render header"
```

---

### Task 4: CSS foundation — z tokens + `.app-header` glass layer; delete brittle dark block

**Files:**
- Modify: `apps/platform/app/globals.css` (add layer near top; delete lines 1225-1358)

- [ ] **Step 1: Add z-index tokens + the `.app-header` layer**

Insert after the `.sb-glass`/`.sb-glass-bar` block (around line 96 in `globals.css`):

```css
/* ============================================
   Global Header / TopBar — token-driven glass.
   Light & dark resolve from --card-bg / --foreground, no class-string matching.
   ============================================ */
:root { --z-header: 40; --z-header-overlay: 60; }

.app-header {
  position: sticky;
  top: 0;
  z-index: var(--z-header);
  isolation: isolate;                 /* own stacking context for the glass */
  background: color-mix(in srgb, var(--card-bg) 72%, transparent);
  backdrop-filter: blur(16px) saturate(1.4);
  -webkit-backdrop-filter: blur(16px) saturate(1.4);
  transition: transform .28s cubic-bezier(.22, 1, .36, 1),
              box-shadow .2s ease, background-color .2s ease;
  will-change: transform;
}
/* No backdrop-filter support → solid token surface (never see-through-broken). */
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .app-header { background: var(--card-bg); }
}
/* Elevation appears only after scrolling — a soft shadow separates, not a border. */
.app-header[data-scrolled="true"] {
  box-shadow: 0 1px 0 color-mix(in srgb, var(--foreground) 6%, transparent),
              0 10px 22px -14px color-mix(in srgb, var(--foreground) 30%, transparent);
}
.app-header[data-hidden="true"] { transform: translateY(-115%); }
@media (prefers-reduced-motion: reduce) { .app-header { transition: none; } }
```

- [ ] **Step 2: Delete the brittle dark-mode header block**

Delete `globals.css` lines **1225-1322** — the entire `/* Global Header / TopBar — Dark Mode */` block (every `.dark header[class*="..."] { …!important }` rule through the action-button hover rule). **Keep** the mobile-nav dark block that follows (starts at the `/* Mobile Bottom Nav — Dark Mode */` comment) — do not delete past it.

> These rules are dead (they key off `bg-[var(--background)]` but the header uses `bg-background`) or pure token duplication. After deletion, the header children that use `bg-[var(--card-bg)]` already resolve to the dark token `#2A2A2A` via tokens.css — no visual regression.

- [ ] **Step 3: Verify build compiles the CSS**

Run: `pnpm --filter @scheniders/platform type-check`
Expected: PASS (CSS isn't type-checked, but this confirms nothing imports a deleted symbol).
Run `pnpm dev:platform`, load any page. Expected: no console CSS errors; app still styled.

- [ ] **Step 4: Manual dark-mode check**

Toggle dark mode. Expected: header children (search, action buttons, dropdowns) still render dark correctly off pure tokens. (The header surface itself is replaced in Task 5; for now the old `bg-background` layer is still in place — that's fine, just confirm no regression from the deletion.)

- [ ] **Step 5: Commit**

```bash
git add apps/platform/app/globals.css
git commit -m "refactor(header): token-driven .app-header glass layer; drop brittle dark selectors"
```

---

### Task 5: Apply `.app-header` to TopBar surface (kill the seam) + `data-scrolled`

**Files:**
- Modify: `apps/platform/components/layout/global-search.tsx` (the `<header>` + its absolute bg layer, ~lines 382-389)

- [ ] **Step 1: Add a scroll-position effect to TopBar**

At the top of `TopBar` (after `const { user, profile } = useAuth();`), add:

```tsx
    const [scrolled, setScrolled] = useState(false);

    useEffect(() => {
        if (typeof window === "undefined") return;
        let ticking = false;
        const onScroll = () => {
            if (ticking) return;
            ticking = true;
            requestAnimationFrame(() => {
                ticking = false;
                setScrolled(window.scrollY > 0);
            });
        };
        onScroll();
        window.addEventListener("scroll", onScroll, { passive: true });
        return () => window.removeEventListener("scroll", onScroll);
    }, []);
```

(Ensure `useState`, `useEffect` are imported — they are, at line 3.)

- [ ] **Step 2: Replace the header element + delete the seam layer**

Replace:
```tsx
        <header className="sticky top-0 z-40">
            {/* Header Background - Removed blur to stop flashing/glitching issues */}
            <div
                className="absolute inset-0 bg-background border-b border-(--card-border)/80 pointer-events-none"
            />
            {/* Header Content */}
            <div className="relative flex items-center justify-between gap-3 md:gap-6 w-full px-4 md:px-6 py-3 md:py-4">
```
with:
```tsx
        <header className="app-header" data-scrolled={scrolled}>
            {/* Header Content */}
            <div className="relative flex items-center justify-between gap-3 md:gap-6 w-full px-4 md:px-6 py-3 md:py-4">
```

And remove the corresponding extra closing `</div>` that wrapped the old absolute layer is **not** needed — the absolute `<div>` was self-closing, so only delete those three lines. The content `<div>` and its existing `</div>` stay.

- [ ] **Step 3: Verify + manual**

Run: `pnpm --filter @scheniders/platform type-check` → PASS.
Run `pnpm dev:platform`. Expected: **no dividing line**; frosted glass visible; scroll down → soft shadow appears (`data-scrolled`); content frosts under the header; **no flicker** on fast scroll, light and dark.

- [ ] **Step 4: Commit**

```bash
git add apps/platform/components/layout/global-search.tsx
git commit -m "feat(header): frosted-glass .app-header surface, remove the seam"
```

---

### Task 6: Portal the Notifications + GlobalSearch overlays; add `anyOverlayOpen`

Inline absolute dropdowns get clipped by the glass stacking context and dragged by the scroll transform. Move them into portaled Radix layers and surface their open state.

**Files:**
- Modify: `apps/platform/components/layout/notifications-dropdown.tsx`
- Modify: `apps/platform/components/layout/global-search.tsx` (GlobalSearch results → portaled; TopBar overlay-open state)

- [ ] **Step 1: Convert NotificationsDropdown to a Radix Popover**

In `notifications-dropdown.tsx`, replace the manual `useState(isOpen)` + click-outside + `<div ref={containerRef} className="relative">` + `<AnimatePresence>` wrapper with the portaled Popover from `@scheniders/ui/popover`. Add an `onOpenChange` prop so the parent learns open state:

```tsx
import { Popover, PopoverTrigger, PopoverContent } from "@scheniders/ui/popover";

interface NotificationsDropdownProps {
    onOpenChange?: (open: boolean) => void;
}

export function NotificationsDropdown({ onOpenChange }: NotificationsDropdownProps) {
    // ...existing data hooks (notifications, totalUnread, markAllAsRead, clearAll)...

    return (
        <Popover onOpenChange={onOpenChange}>
            <PopoverTrigger asChild>
                <button
                    className="relative w-10 h-10 rounded-full bg-[var(--card-bg)] border border-[var(--card-border)] flex items-center justify-center text-muted hover:text-foreground hover:border-[var(--foreground-muted)] transition-all data-[state=open]:ring-2 data-[state=open]:ring-[var(--pastel-yellow)] data-[state=open]:border-transparent"
                    title="Notifications"
                >
                    <Bell className="w-5 h-5" />
                    {totalUnread > 0 && (
                        <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center shadow-lg">
                            {totalUnread > 99 ? "99+" : totalUnread}
                        </span>
                    )}
                </button>
            </PopoverTrigger>
            <PopoverContent
                align="end"
                className="w-96 p-0 overflow-hidden bg-[var(--card-bg)] border-[var(--card-border)] shadow-xl"
                style={{ zIndex: "var(--z-header-overlay)" }}
            >
                {/* ...move the existing dropdown header + list markup here, unchanged... */}
            </PopoverContent>
        </Popover>
    );
}
```

Delete the now-unused `isOpen` state, the `containerRef`, the click-outside `useEffect`, and the `motion`/`AnimatePresence` wrappers (Radix handles open/close + outside-click). Keep all the inner header/list/empty markup verbatim inside `PopoverContent`.

- [ ] **Step 2: Portal the GlobalSearch results dropdown**

The `GlobalSearch` results panel (lines ~258-320) is `absolute` inside the search container. Wrap the existing `motion.div` results panel in a `createPortal` to `document.body` is heavier than needed; instead, keep it visually anchored but lift it above the glass by setting its z-index to the overlay token and ensuring the search container is **not** inside `.app-header`'s clip. Since `.app-header` uses `isolation:isolate` (not `overflow:hidden`), the absolute panel is **not clipped** — it only needs a higher z-index than the glass. Change the results `className` z-index:

Replace:
```tsx
                        className="absolute top-full left-0 right-0 mt-2 bg-(--card-bg) rounded-2xl border border-(--card-border) shadow-xl overflow-hidden z-50"
```
with:
```tsx
                        className="absolute top-full left-0 right-0 mt-2 bg-(--card-bg) rounded-2xl border border-(--card-border) shadow-xl overflow-hidden"
                        style={{ zIndex: "var(--z-header-overlay)" }}
```

Add an `onOpenChange` callback to `GlobalSearch` so it reports its `isOpen` to TopBar. Change the `GlobalSearch` signature:

```tsx
export function GlobalSearch({ onOpenChange }: { onOpenChange?: (open: boolean) => void }) {
```
and call `onOpenChange?.(isOpen)` whenever `isOpen` changes by adding after the existing click-outside effect:

```tsx
    useEffect(() => { onOpenChange?.(isOpen); }, [isOpen, onOpenChange]);
```

- [ ] **Step 3: Track `anyOverlayOpen` in TopBar**

In `TopBar`, add state and pass setters:

```tsx
    const [searchOpen, setSearchOpen] = useState(false);
    const [notifOpen, setNotifOpen] = useState(false);
    const anyOverlayOpen = searchOpen || notifOpen;
```

Wire them:
```tsx
                    <GlobalSearch onOpenChange={setSearchOpen} />
```
```tsx
                        <NotificationsDropdown onOpenChange={setNotifOpen} />
```
(and the mobile `<NotificationsDropdown onOpenChange={setNotifOpen} />` too).

`anyOverlayOpen` is consumed in Task 7.

- [ ] **Step 4: Verify + manual**

Run: `pnpm --filter @scheniders/platform type-check` → PASS.
Manual: open Notifications — panel appears above the glass, closes on outside-click/Esc. Open search results — appears above glass. Both render correctly in dark mode.

- [ ] **Step 5: Commit**

```bash
git add apps/platform/components/layout/notifications-dropdown.tsx apps/platform/components/layout/global-search.tsx
git commit -m "refactor(header): portal notifications + search overlays above the glass"
```

---

### Task 7: Wire scroll-to-hide into TopBar (desktop-only, locked while overlay open)

**Files:**
- Modify: `apps/platform/components/layout/global-search.tsx` (TopBar)

- [ ] **Step 1: Import the hook + mobile detector**

At the top of `global-search.tsx` add:
```tsx
import { useHeadroom } from "@/hooks/use-headroom";
import { useIsMobile } from "@/hooks/use-mobile";
```

- [ ] **Step 2: Compute `hidden` and apply it**

In `TopBar`, after `anyOverlayOpen`:
```tsx
    const isMobileViewport = useIsMobile();
    const { hidden } = useHeadroom({ locked: anyOverlayOpen, disabled: isMobileViewport });
```

> `isMobile` is also passed in as a prop; the hook needs the reactive viewport hook because the header must re-enable hide when resizing from mobile→desktop. Using `useIsMobile()` here is consistent with `dashboard-layout.tsx`.

Update the header element to apply `data-hidden`:
```tsx
        <header className="app-header" data-scrolled={scrolled} data-hidden={hidden}>
```

- [ ] **Step 3: Verify + manual (the critical guard checks)**

Run: `pnpm --filter @scheniders/platform type-check` → PASS.
Run: `pnpm exec vitest run apps/platform/hooks/use-headroom.test.tsx` → PASS.
Manual (desktop): scroll down ~64px → header slides up; scroll up → reveals; at top → always shown. **Open Notifications, then scroll down → header must NOT hide** (locked). Same with search results open. Resize to mobile width → header stays put (disabled). `prefers-reduced-motion` on → header still hides but instantly (no animation), no glitch.

- [ ] **Step 4: Commit**

```bash
git add apps/platform/components/layout/global-search.tsx
git commit -m "feat(header): desktop scroll-to-hide via useHeadroom, locked while overlays open"
```

---

### Task 8: Cluster regroup — shared control, overflow menu, account menu, presence sizing

**Files:**
- Create: `apps/platform/components/layout/header-action-button.tsx`
- Modify: `apps/platform/components/layout/global-search.tsx` (TopBar right cluster)
- Modify: `apps/platform/components/chat/live-presence-stack.tsx` (fixed-width 40px trigger)

- [ ] **Step 1: Create the shared control style constant**

Create `apps/platform/components/layout/header-action-button.tsx`:

```tsx
/** Shared visual for every 40px round icon control in the header action cluster.
 *  One source of truth so the cluster never drifts in size or border again. */
export const HEADER_ACTION_CLASS =
    "w-10 h-10 rounded-full bg-[var(--card-bg)] border border-[var(--card-border)] " +
    "flex items-center justify-center text-muted hover:text-foreground " +
    "hover:border-[var(--foreground-muted)] transition-all";
```

- [ ] **Step 2: Build the overflow (⋯) menu containing Theme + Language**

In `global-search.tsx`, add imports:
```tsx
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@scheniders/ui/dropdown-menu";
import { MoreHorizontal, LogOut, User as UserIcon, Settings as SettingsIcon } from "lucide-react";
import { HEADER_ACTION_CLASS } from "./header-action-button";
```

Replace the desktop actions block (currently AutoSend, Theme, Language, Presence, Chat, Notifications, Settings link, Avatar link — lines ~403-449) with the regrouped cluster:

```tsx
                    <div className="hidden md:flex items-center gap-2">
                        {/* Work tools */}
                        <AutoSendToggle variant="navbar" />

                        {/* Divider between work tools and identity/comms */}
                        <div className="w-px h-6 bg-[var(--card-border)]/60 mx-1" />

                        {/* Presence · Chat · Notifications */}
                        <LivePresenceStack />
                        <ChatTrigger />
                        <NotificationsDropdown onOpenChange={setNotifOpen} />

                        {/* Overflow: Theme + Language */}
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <button className={HEADER_ACTION_CLASS} title="More" aria-label="More options">
                                    <MoreHorizontal className="w-5 h-5" />
                                </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" style={{ zIndex: "var(--z-header-overlay)" }} className="w-44">
                                <DropdownMenuItem className="gap-2 p-0 focus:bg-transparent">
                                    <div className="flex items-center gap-2 px-2 py-1.5 w-full">
                                        <ThemeToggle />
                                        <span className="text-sm">Theme</span>
                                    </div>
                                </DropdownMenuItem>
                                <DropdownMenuItem className="gap-2 p-0 focus:bg-transparent">
                                    <div className="flex items-center gap-2 px-2 py-1.5 w-full">
                                        <LanguageToggle />
                                        <span className="text-sm">Language</span>
                                    </div>
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>

                        {/* Account menu on the avatar (replaces the duplicate Settings gear) */}
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <button
                                    className="w-10 h-10 rounded-full bg-linear-to-br from-[#FBE38E] to-[#F4C7CF] flex items-center justify-center text-[#1E1E1E] font-bold text-sm hover:scale-105 transition-transform overflow-hidden shadow-sm"
                                    title="Account"
                                >
                                    {profile?.avatar_url ? (
                                        <img src={profile.avatar_url} alt={profile.display_name || "User"} className="w-full h-full object-cover" />
                                    ) : (
                                        <span>{(profile?.display_name || user?.email || "U")?.charAt(0).toUpperCase()}</span>
                                    )}
                                </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" style={{ zIndex: "var(--z-header-overlay)" }} className="w-48">
                                <DropdownMenuItem asChild>
                                    <Link href="/settings" className="gap-2"><SettingsIcon className="w-4 h-4" /> Settings</Link>
                                </DropdownMenuItem>
                                <DropdownMenuItem asChild>
                                    <Link href="/settings" className="gap-2"><UserIcon className="w-4 h-4" /> Profile</Link>
                                </DropdownMenuItem>
                                <DropdownMenuItem asChild>
                                    <Link href="/logout" className="gap-2 text-rose-600"><LogOut className="w-4 h-4" /> Sign out</Link>
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
```

> The standalone `Settings` gear `<Link>` (old lines 423-429) is **deleted** — Settings now lives in the account menu. Confirm `/logout` is the correct sign-out route (grep `app/logout` / the sidebar's sign-out link; if the project signs out via a function, swap the `<Link href="/logout">` for the existing sign-out handler used in `sidebar.tsx`).

- [ ] **Step 3: Give the presence trigger a fixed 40px footprint**

In `live-presence-stack.tsx`, change the trigger button (line ~28) so it occupies a stable 40px and matches the cluster. Replace:
```tsx
                <button
                    className="flex items-center rounded-full p-0.5 transition-colors hover:bg-foreground/5"
```
with:
```tsx
                <button
                    className="flex h-10 min-w-10 items-center justify-center rounded-full px-1 transition-colors hover:bg-foreground/5"
```
And change the empty-state icon span (line ~34) from `h-9 w-9` to `h-10 w-10` so the empty and populated states are the same height:
```tsx
                        <span className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground">
```

- [ ] **Step 4: Verify + manual**

Run: `pnpm --filter @scheniders/platform type-check` → PASS.
Run: `pnpm --filter @scheniders/platform lint` → no new errors.
Manual (desktop): cluster reads AutoSend · | · Presence · Chat · Notifications · ⋯ · Avatar, evenly sized. ⋯ opens Theme + Language (both work). Avatar opens Settings/Profile/Sign out (Settings navigates, Sign out logs out). No duplicate gear. Open ⋯/avatar then scroll → header stays (Radix open state — note: ⋯/avatar don't feed `anyOverlayOpen`; verify they don't cause a hide-while-open glitch. If they do, add `onOpenChange` setters for them too and OR them into `anyOverlayOpen`).

- [ ] **Step 5: Commit**

```bash
git add apps/platform/components/layout/header-action-button.tsx apps/platform/components/layout/global-search.tsx apps/platform/components/chat/live-presence-stack.tsx
git commit -m "feat(header): overflow menu + account menu, unify 40px controls, fix presence size"
```

---

### Task 9: `useAutoSend` TanStack Query hook + tokenized AutoSendToggle

**Files:**
- Create: `apps/platform/hooks/use-auto-send.ts`
- Modify: `apps/platform/components/orders/auto-send-toggle.tsx`

- [ ] **Step 1: Create the query hook**

Create `apps/platform/hooks/use-auto-send.ts`:

```ts
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const KEY = ["settings", "auto-send"] as const;

async function fetchAutoSend(): Promise<boolean> {
    const res = await fetch("/api/settings/auto-send");
    if (!res.ok) throw new Error(`auto-send GET failed: ${res.status}`);
    const data: unknown = await res.json();
    return typeof data === "object" && data !== null && (data as { enabled?: unknown }).enabled === true;
}

async function putAutoSend(enabled: boolean): Promise<boolean> {
    const res = await fetch("/api/settings/auto-send", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
    });
    if (!res.ok) throw new Error(`auto-send PUT failed: ${res.status}`);
    const data: unknown = await res.json();
    return typeof data === "object" && data !== null && (data as { enabled?: unknown }).enabled === true;
}

export function useAutoSend() {
    const qc = useQueryClient();
    const query = useQuery({ queryKey: KEY, queryFn: fetchAutoSend, staleTime: 60_000 });
    const mutation = useMutation({
        mutationFn: putAutoSend,
        onSuccess: (enabled) => qc.setQueryData(KEY, enabled),
    });
    return {
        enabled: query.data ?? false,
        isLoading: query.isLoading,
        isToggling: mutation.isPending,
        toggle: () => mutation.mutate(!(query.data ?? false)),
    };
}
```

- [ ] **Step 2: Refactor AutoSendToggle to consume it + tokenize colors**

In `auto-send-toggle.tsx`, replace the local `useState`/`useEffect`/`handleToggle` (lines 12-43) with:

```tsx
export function AutoSendToggle({ variant = "mobile" }: AutoSendToggleProps) {
    const { enabled, isLoading: loading, isToggling: toggling, toggle: handleToggle } = useAutoSend();
```
(add `import { useAutoSend } from "@/hooks/use-auto-send";`, remove the now-unused `useState`/`useEffect`/`useCallback` imports if unused).

In the **navbar** enabled state (line ~67), replace the hardcoded green + `border-2` with tokens + 1px border:
```tsx
                        enabled
                            ? "bg-[color-mix(in_srgb,var(--button-success)_14%,transparent)] border border-[var(--button-success)] text-[var(--button-success)] hover:bg-[color-mix(in_srgb,var(--button-success)_22%,transparent)]"
                            : "bg-[var(--card-bg)] border border-[var(--card-border)] text-muted hover:text-foreground hover:border-[var(--foreground-muted)]",
```
And the status dot border (line ~83) from `border-2 border-white` to `border-2 border-[var(--card-bg)]`:
```tsx
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-[var(--button-success)] border-2 border-[var(--card-bg)]" />
```

- [ ] **Step 3: Verify + manual**

Run: `pnpm --filter @scheniders/platform type-check` → PASS.
Manual: AutoSend button loads without a spinner flash on header remount/navigation (cached). Enabled state is exactly 40px (1px border), reads correctly in light and dark; the dot ring matches the surface. Toggling persists and updates immediately.

- [ ] **Step 4: Commit**

```bash
git add apps/platform/hooks/use-auto-send.ts apps/platform/components/orders/auto-send-toggle.tsx
git commit -m "perf(header): cache auto-send via TanStack Query, tokenize colors, 1px border"
```

---

### Task 10: Tokenize the presence "Message" button

**Files:**
- Modify: `apps/platform/components/chat/live-presence-stack.tsx:103`

- [ ] **Step 1: Replace the hardcoded indigo**

Replace:
```tsx
                                    className="shrink-0 rounded-lg bg-indigo-50 px-2.5 py-1.5 text-[11px] font-semibold text-indigo-600 transition-all hover:bg-indigo-100 active:scale-95 disabled:opacity-60"
```
with a token-aware accent that adapts to dark mode:
```tsx
                                    className="shrink-0 rounded-lg bg-[color-mix(in_srgb,var(--ink)_8%,transparent)] px-2.5 py-1.5 text-[11px] font-semibold text-foreground transition-all hover:bg-[color-mix(in_srgb,var(--ink)_14%,transparent)] active:scale-95 disabled:opacity-60"
```

- [ ] **Step 2: Verify + manual**

Run: `pnpm --filter @scheniders/platform type-check` → PASS.
Manual: open the presence popover in dark mode — the "Message" button matches the popover surface (no glaring near-white chip).

- [ ] **Step 3: Commit**

```bash
git add apps/platform/components/chat/live-presence-stack.tsx
git commit -m "fix(header): tokenize presence Message button for dark mode"
```

---

### Task 11: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Type-check + lint (CI gate)**

Run: `pnpm type-check`
Expected: PASS across the workspace.
Run: `pnpm lint`
Expected: 0 errors (warnings within the repo baseline are OK).

- [ ] **Step 2: Unit tests**

Run: `pnpm exec vitest run apps/platform/hooks/use-headroom.test.tsx`
Expected: 7 passed.

- [ ] **Step 3: Manual matrix (desktop, `pnpm dev:platform`)**

Verify each, light **and** dark:
- [ ] No dividing line; frosted glass; soft shadow only after scroll.
- [ ] No flicker on fast scroll (the original bug).
- [ ] Scroll down ~64px → hides; scroll up → reveals; near top → always shown.
- [ ] Open Notifications → scroll → header does NOT hide.
- [ ] Open search results → scroll → header does NOT hide.
- [ ] ⋯ menu opens Theme + Language; both work.
- [ ] Avatar menu: Settings navigates, Profile, Sign out works. No duplicate gear.
- [ ] AutoSend: no spinner flash on navigation; enabled state correct + 40px in both themes.
- [ ] Presence trigger is 40px, aligned; popover "Message" button correct in dark.
- [ ] `prefers-reduced-motion` → hide is instant, no animation glitch.
- [ ] Soft-nav `/orders ↔ /dashboard ↔ /customers` → header stable, no hydration warning.
- [ ] Realtime presence avatars still update (channel not remounted).

- [ ] **Step 4: Mobile sanity**

Resize to <768px: header stays static (scroll-hide disabled), shows merchant badge + Chat + Notifications; orders/customers sticky filter bar at `top-[78px]` unchanged.

- [ ] **Step 5: Invoke verification-before-completion skill, then final report.**

Do not claim done until Steps 1-4 are green with observed output.

---

## Self-review (author)

- **Spec coverage:** Surface glass (T4-T5) ✓; seam removal (T5) ✓; scroll-hide (T1,T7) ✓; overflow cluster + account menu + presence sizing (T8) ✓; portal overlays (T6) ✓; poll/return-null removal (T2) ✓; usePathname (T2 — removed entirely since route flags are gone; spec's "drop if unused" path taken) ✓; atomic selectors (T3) ✓; AutoSend→Query + tokens (T9) ✓; presence indigo (T10) ✓; dark-mode token rewrite (T4) ✓; desktop-only/mobile boundary (T7,T11) ✓; testing (T1,T11) ✓.
- **Placeholders:** none — every code step has full code; the two flagged verifications (`/logout` route, ⋯/avatar lock) are explicit "confirm X, else do Y" instructions, not vague TODOs.
- **Type consistency:** `useHeadroom({ threshold, deadzone, locked, disabled })` and `{ hidden }` match across T1/T7; `useAutoSend` returns `{ enabled, isLoading, isToggling, toggle }` consumed exactly in T9; `HEADER_ACTION_CLASS` defined T8 used T8; `onOpenChange` prop added to NotificationsDropdown (T6) used T6/T8; `--z-header-overlay` defined T4 used T6/T8.

## Risks / confirm-during-build
- **Sign-out route** — verify the real mechanism (T8 Step 2 note); the sidebar already has one, reuse it.
- **⋯ / avatar menus while scrolling** — if Radix-open menus glitch on hide, OR their `onOpenChange` into `anyOverlayOpen` (T8 Step 4).
- **`backdrop-filter` over long lists** — watch repaint; mitigated by removing the churn (T2). The `@supports` fallback covers unsupported browsers.
