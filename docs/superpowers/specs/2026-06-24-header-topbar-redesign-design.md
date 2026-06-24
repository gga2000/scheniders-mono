# Header / TopBar Redesign — Design Spec

**Date:** 2026-06-24
**Branch:** `feat/store-builder-feature-grabs` (header work)
**App:** `@scheniders/platform`
**Primary file:** `apps/platform/components/layout/global-search.tsx` (exports both `GlobalSearch` and `TopBar`)

---

## 1. Context

The platform top bar (`TopBar`) looks dated next to the rest of the app. Three problems drove this work:

1. **A hard dividing line** between the header and the page (`border-b border-(--card-border)/80`, global-search.tsx:386) reads as a seam.
2. **The glass blur was removed** (commit `7b0d12c`) because it flashed/glitched on scroll. The user wants it back — done correctly.
3. **No scroll-to-hide.** The user wants the header to slide away on a small scroll for a full-screen page, and back on scroll-up. Attempted before; it broke the app.

A 6-lens adversarial audit (49 confirmed findings) established the **root causes** of why blur + scroll-hide broke before — they are not cosmetic, they are structural, and they must be fixed for the new look to be glitch-free. This spec bundles those fixes with the three headline features.

### Root causes the audit confirmed
- The blur didn't flicker because of `backdrop-filter` alone. The header **re-renders ~5×/sec** from a `setInterval(checkCollapsed, 200)` localStorage poll (global-search.tsx:365), **fully unmounts/remounts** via `return null` on orders/customers pages (global-search.tsx:374-380), and hosts **infinite `animate-ping`** layers — a perpetual repaint loop. `backdrop-filter` on top of that = Chromium backdrop repaint flicker on scroll. The old `maskImage` + `maskComposite` trick compounded it.
- The dark-mode header is styled by **~130 lines of brittle attribute selectors** (`globals.css:1225-1358`) like `.dark header[class*="bg-[var(--background)]"] { …!important }`. The header actually uses `bg-background` (not `bg-[var(--background)]`), so the rule is **dead code** — and its `background:#121212 !important` would kill any translucent glass layer anyway.
- Header overlays are **inconsistently portaled**: presence uses a portaled Radix Popover, but Notifications and the Search results render **inline** inside the sticky header. A glass `backdrop-filter` creates a new stacking context, and a scroll-hide `transform` drags inline overlays off-screen — so both features break inline dropdowns unless they portal.

---

## 2. Goals & Non-Goals

### Goals
- Replace the seam with a SOTA surface treatment (no hard border).
- Restore a glass/frosted header that **never glitches** on scroll, in light and dark.
- Add a desktop scroll-to-hide ("headroom") that reveals on scroll-up — no layout shift, no broken dropdowns.
- Declutter the right-side action cluster (overflow menu + account menu) and fix sizing.
- Fix the bundled P1/P2/P3 correctness, perf, and CSS-architecture findings that make the above safe.

### Non-Goals (explicit scope boundaries)
- **Mobile scroll-hide.** The mobile sticky filter bars are hard-coupled to `top-[78px]` (orders/customers sticky-filter-bar.tsx:110/135). Animating the mobile header would leave a gap. Mobile header stays static; scroll-hide is **desktop-only**. (Separate future task.)
- **Search backend.** `GlobalSearch` still searches the in-memory `orders` context. Not touched here.
- **Keyboard shortcuts / a11y sweep.** The existing Cmd+K stays as-is; no new shortcuts, per project rules.
- **The orders/customers toolbar collapse feature itself** stays — only TopBar's consumption of its state is removed (see §4.7).

---

## 3. Design decisions (locked via visual brainstorming)

| Decision | Choice | Summary |
|---|---|---|
| **Surface** | **Frosted Glass** | Translucent token surface + real `backdrop-filter`; content frosts under it; no border. |
| **Action cluster** | **Overflow tuck** | Theme + Language move into a `⋯` dropdown; account menu on the avatar; AutoSend + Presence + Chat + Notifications stay visible. |
| **Scroll behavior** | **Quick hide** | Scroll down past ~64px → header slides up & hides; any scroll-up reveals it; always shown near top. |

---

## 4. Component design

### 4.1 `useHeadroom` hook — `apps/platform/hooks/use-headroom.ts` (NEW)

A small, self-contained, testable hook. One job: tell the header whether it should be hidden based on scroll direction.

**Signature**
```ts
interface UseHeadroomOptions {
  /** px scrolled before hiding is allowed. Default 64. */
  threshold?: number;
  /** min delta to act on — kills jitter. Default 4. */
  deadzone?: number;
  /** when true, never hide (e.g. a header dropdown is open). */
  locked?: boolean;
  /** disable entirely (e.g. mobile). Default false. */
  disabled?: boolean;
}
function useHeadroom(options?: UseHeadroomOptions): { hidden: boolean };
```

**Behavior**
- Subscribes to `window` scroll with `{ passive: true }`; reads `window.scrollY` **inside `requestAnimationFrame`** (no layout thrash), guarded by a `ticking` ref so at most one rAF is queued per frame.
- Direction logic: `dy > deadzone && scrollY > threshold` → hidden; `dy < -deadzone` → shown. Always shown when `scrollY < 8`.
- `locked` → force `hidden = false` and skip updates (header must never hide while a popover anchored to it is open).
- `disabled` → no listener attached, always returns `{ hidden: false }`.
- Reads `prefers-reduced-motion`; when set, the **transition** is suppressed in CSS (the hook still toggles, the movement is just instant — no animation jank). The hook itself does not animate; it only flips a boolean.
- Cleans up the listener and any pending rAF on unmount.
- **No `setState` per scroll frame unless the boolean actually changes** — compare against the previous value before setting.

**Why this is the safe pattern:** the header animates via a CSS `transform` driven by one boolean; the hook does not re-render on every scroll tick, and it never touches `top`/`height` (no reflow). This is the canonical headroom approach and avoids every failure mode that broke the previous attempt.

### 4.2 Glass surface — `.app-header` layer in `globals.css` (NEW), removes old block

Add a scoped, **token-driven** layer; **delete** the brittle dark-mode block (globals.css:1225-1358).

```css
/* Global Header — token-driven glass. Light & dark via vars, no class-string matching. */
.app-header {
  position: sticky;
  top: 0;
  z-index: var(--z-header, 40);
  isolation: isolate;                 /* own stacking context for the glass */
  background: color-mix(in srgb, var(--card-bg) 72%, transparent);
  backdrop-filter: blur(16px) saturate(1.4);
  -webkit-backdrop-filter: blur(16px) saturate(1.4);
  transition: transform .28s cubic-bezier(.22, 1, .36, 1),
              box-shadow .2s ease, background-color .2s ease;
  will-change: transform;
}
/* No-backdrop-filter fallback → solid token surface, never see-through-broken. */
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .app-header { background: var(--card-bg); }
}
/* Elevation only after scrolling — soft shadow does the separating, not a border. */
.app-header[data-scrolled="true"] {
  box-shadow: 0 1px 0 color-mix(in srgb, var(--foreground) 6%, transparent),
              0 10px 22px -14px color-mix(in srgb, var(--foreground) 30%, transparent);
}
.app-header[data-hidden="true"] { transform: translateY(-115%); }
@media (prefers-reduced-motion: reduce) { .app-header { transition: none; } }
```

- **No `maskImage` / `maskComposite`** (the old flicker trigger).
- Dark mode needs **no special selectors** — `--card-bg`/`--foreground` already flip in `.dark` (tokens.css). Any genuinely divergent neon accent (e.g. the yellow search-icon fill, focus glow) becomes a small explicit `.dark .app-header__…` rule **without `!important`**, not a class-substring match.
- `data-scrolled` and `data-hidden` are set as **DOM attributes** from React state on the `<header>`, so the surface reacts without per-frame re-renders of children.

### 4.3 Seam removal
Delete `bg-background border-b border-(--card-border)/80` absolute layer (global-search.tsx:385-387). The `.app-header` surface replaces it. Separation now comes from the glass + the on-scroll shadow (`data-scrolled`), never a hard line.

### 4.4 Right cluster — Overflow tuck
- Extract a single shared control style (40px, `rounded-full`, `bg-(--card-bg)`, `border-(--card-border)`, `hover:border-(--foreground-muted)`) as a constant/util applied to **every** icon control, including the presence trigger (fixes the 36px vs 40px mismatch and future drift).
- **Visible:** AutoSend · `│` · Presence · Chat · Notifications · `⋯` · Avatar.
- **`⋯` overflow** = Radix `DropdownMenu` (portaled) containing Theme toggle + Language toggle.
- **Avatar** = Radix `DropdownMenu` (portaled): Settings · Profile · Sign out. **Removes the duplicate `/settings` link** (the standalone gear at global-search.tsx:423 is deleted).
- Presence stack gets a **fixed-width container** so it doesn't reflow the cluster between empty/populated states.

### 4.5 Portal all header overlays
- `NotificationsDropdown` and the `GlobalSearch` results panel move from inline absolute to a portaled Radix `Popover`/`DropdownMenu` (presence already does this). Immune to the glass stacking context and the scroll-hide transform.
- Add a z-index scale token: `--z-header: 40; --z-header-overlay: 60;` so overlays always sit above the glass.
- Each header overlay reports open/closed up to TopBar (callback or shared boolean) → feeds `useHeadroom({ locked })` so the header can't hide mid-interaction.

### 4.6 Bundled correctness/perf fixes
- **Remove the 200ms poll + `return null`** (global-search.tsx:342-380). TopBar stops reading `ordersToolbarCollapsed`/`customersToolbarCollapsed` entirely.
- **`usePathname()`** replaces `window.location.pathname` (global-search.tsx:333) — reactive to soft nav, SSR-safe, no hydration mismatch. (After removal of the route-based hide, `pathname` may not even be needed in TopBar; drop if unused.)
- **Atomic Zustand selectors:** `useChatStore((s) => s.open)` in `chat-trigger.tsx:10` and `live-presence-stack.tsx:13` — stops a re-render of header buttons on every chat keystroke.
- **AutoSend → TanStack Query:** new `useAutoSend` hook (cached `queryKey`, PUT mutation), shared by navbar + mobile variants — removes the per-mount `fetch` + spinner flash. Replace hardcoded `bg-green-50 border-2 border-green-400` + `border-white` dot with success-accent tokens that flip in dark; use `border` (1px) so the button stays exactly 40px.
- **Tokenize remaining hardcoded colors:** presence "Message" button indigo (`live-presence-stack.tsx:103`) → token/Button primitive.

### 4.7 Orders/customers integration
- The orders/customers toolbar **collapse toggle stays** (orders-page-presenter.tsx:355 still writes `ordersToolbarCollapsed`, collapsing the page's own filter toolbar). Only TopBar's *reaction* to it is removed. Net effect: collapsing the toolbar no longer nukes the global header; scroll-hide reclaims that space instead, and the header stays reachable at the top.
- Desktop filter bars are not sticky, so no `top`/z collision with the header. Verify during implementation that no page assumed the header could vanish.

---

## 5. Data flow

- **Scroll-hide:** `window` scroll → `useHeadroom` (rAF) → `hidden` boolean → `data-hidden` attr on `<header>` → CSS transform. `data-scrolled` set the same way (`scrollY > 0`).
- **Overlay-open → lock:** each header dropdown's `onOpenChange` → TopBar boolean (`anyOverlayOpen`) → `useHeadroom({ locked: anyOverlayOpen })`.
- **AutoSend:** `useAutoSend` query (GET) + mutation (PUT) → cached, shared.
- **Chat/presence:** atomic store selectors.

---

## 6. Error & edge handling

- Glass: `@supports` fallback to solid token bg.
- Scroll-hide: never hides when `scrollY < 8`; never hides while an overlay is open; transform-only (no reflow); reduce-motion → instant, no animation.
- No `setState` on scroll unless the boolean changes (prevents render storms — the very thing that broke blur before).
- SSR: `usePathname()` + attributes default to shown/not-scrolled on the server; no hydration divergence.

---

## 7. Testing

- **Vitest** — `use-headroom.test.ts`: threshold, deadzone, lock, disabled, near-top-always-shown, cleanup. Mock `window.scrollY` + dispatch scroll; assert boolean transitions and that no update fires below deadzone.
- **Type-check + lint** — `pnpm type-check`, `pnpm lint` (CI gate; must pass).
- **Manual (desktop):** light + dark; scroll down (hides) / up (reveals) / near-top (always shown); open Notifications → scroll (must NOT hide); open Search results → scroll (must NOT hide); soft-nav orders ↔ dashboard (no stale state, no flicker); `prefers-reduced-motion` (instant, no glitch); confirm no seam in either theme; confirm presence realtime channel survives (no remount).
- **Manual (mobile):** header unchanged, filter bar `top-[78px]` intact.

---

## 8. Implementation order

1. **Stop the churn first** (unblocks everything): remove poll + `return null`; `usePathname()`; atomic store selectors. Verify no behavior regressions.
2. **Token-driven dark mode:** delete globals.css:1225-1358 block; add `.app-header` layer + z-index tokens; verify dark mode parity off pure tokens.
3. **Seam → glass:** swap the absolute bg layer for `.app-header`; wire `data-scrolled`. Verify no flicker, no seam, both themes.
4. **Portal overlays:** Notifications + Search → portaled Radix; add overlay-open lock plumbing.
5. **Scroll-hide:** add `useHeadroom`; wire `data-hidden` + `locked`; desktop-only. Verify all guards.
6. **Cluster regroup:** shared 40px control style; `⋯` overflow (theme/lang); avatar account menu (remove duplicate gear); presence fixed-width.
7. **AutoSend → TanStack Query** + tokenized colors; tokenize presence indigo.
8. **Full verification pass** (§7) + `verification-before-completion`.

---

## 9. Open risks

- **Radix dependency for overflow/account/notifications/search:** Radix Popover/DropdownMenu is already a dep (presence uses it). Confirm consistent styling tokens across all header dropdowns.
- **`backdrop-filter` cost** with many rows scrolling under: acceptable on modern hardware; the `@supports` fallback covers the rest. Watch for repaint on very long lists — mitigated by removing the churn.
- **Glass over the trial/paused banners:** TrialBanner + TenantPausedBanner render above TopBar in `<main>`. Confirm the sticky header's `top:0` and the banners interact sanely (banners scroll away above the header — expected).
