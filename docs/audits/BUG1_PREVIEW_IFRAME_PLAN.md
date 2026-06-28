# BUG1 — Viewport-accurate device preview (iframe revival) — implementation plan

**Status:** planned, not started. Multi-round (~9 dev-days, 10 steps). The
tractable audit backlog is otherwise cleared; this is one of two remaining
large architectural items (other: E4 per-custom-page section authoring).

## The bug (P0)
`apps/platform/components/store-builder-v2/live-preview.tsx` renders the page
into a plain in-DOM `<div>` whose width is `390/820/100%` (`:55-59`, applied
`:851`). Section responsiveness is Tailwind `sm:/md:/lg:` which key off the real
editor window (~700-900px), so "Mobile" crops desktop — multi-column grids never
reflow. Mobile-first Iraq COD market → merchants ship a broken mobile store the
preview said was fine. (R55 shipped only an honest "approximate width" notice.)

## Key finding — the draft→iframe path ALREADY EXISTS (this is a wiring job)
- Route: `apps/storefront/app/_preview/[tenant]/[page_id]/page.tsx`, token-gated
  (`verifyPreviewToken`); token already minted in `app/store/edit/page.tsx:125-128`
  and `buildPreviewUrl` already built (`editor-shell.tsx:158-177`).
- Live in-memory draft streams in via postMessage: `SchneidersPreviewLiveRenderer`
  (`schneiders-preview-live-renderer.tsx:101-127`) swaps config in place on
  `schn-editor:page_config_update`/`runtime_update` — no reload.
- The editor already posts those on every edit (`editor-shell.tsx:317-347`) — but
  the effect early-returns because `bridge.state.ready` is never true.
- Why: nothing renders `<PreviewFrame>`/`<PreviewOverlay>`; only `<LivePreview>`
  is mounted (`editor-shell.tsx:1441-1472`, mobile `mobile-editor-shell.tsx:318`),
  so `iframe_ref` never attaches → `ready` never fires → ~125 lines of bridge
  plumbing are dead.

## The real cost: editing-affordance parity
`PreviewOverlay` ships only selection/hover rings + a floating toolbar. These
`LivePreview`-only affordances must be rebuilt over the iframe before deleting it,
or editing regresses (worse than the accuracy gap):
- inline contenteditable edit (`live-preview.tsx:383-554`)
- insert-at `+` buttons (`:1221-1275`)
- spacing drag (`:1061-1202`)
- right-click context menu (`:578-605`)

## Steps (effort)
0. Decide: replace `LivePreview` with `PreviewFrame`+`PreviewOverlay`, delete
   `LivePreview` (audit forbids shipping both). Keep `PreviewModal` as fullscreen.
1. Mount `<PreviewFrame ref={iframe_ref}>` + `<PreviewOverlay>` in the desktop
   canvas → `ready` flips → dormant config-push/page-nav effects activate. (~0.5d)
2. Bridge protocol coverage — most exists (`ready`, `page_config_update`,
   `runtime_update`, `section_clicked`, `scroll_to_section`, `request_rect`,
   hover, `scrolled`). NEW: `inline_edit_commit`, `all_rects` (for gap handles),
   `set_selected_section`, `section_context_menu`. (~1d)
3. Overlay coordinate mapping: editor coord = `iframeBounds + rect`; keep iframe
   at natural 1:1 (no scale transform — media queries key off layout viewport).
   `PreviewOverlay` already offsets by `iframeBounds`. (~0.5d)
4. Re-implement inline edit inside the storefront bridge (contenteditable lives
   in the iframe now); keep it authoritative until blur to avoid cursor jumps;
   emit `inline_edit_commit` → editor `handleInlineEdit` (`:698-725`). (~1.5d)
5. Re-implement insert-at + spacing-drag editor-side over the iframe using an
   `all_rects` round trip (mirror `measureGaps` `:693-735`); live spacing via a
   transient `page_config_update`. (~1.5d)
6. Context menu via `section_context_menu` → editor renders `LivePreviewContextMenu`. (~0.5d)
7. **SKIP the RTL portion.** The generic plan proposed `dir="rtl"` for ar/ku — this
   VIOLATES the project's hard LTR-only rule (only ever set `<html lang>`, never
   `dir`). Sync locale via `lang` + `runtime_update` only; do NOT set `dir`.
   Breakpoint must drive BOTH the `PreviewFrame` width AND `runtime_update`. (~0.25d)
8. Page nav: `page_id_change` → live renderer `location.replace` if
   `isSafePreviewNavUrl`; verify the first-mount guard. Re-mint the 1h token on
   long sessions (token TTL `store/edit/page.tsx:34`). (~0.25d)
9. Migrate `mobile-editor-shell.tsx:318` to the same swap. (~1d)
10. Delete `live-preview*.tsx` + tests; remove the approximate-width notice. (~0.5d)

## Risks / verification
- Affordance parity is the whole risk surface — don't ship the iframe without
  steps 4-6 or editing regresses.
- Cross-origin dev needs both apps up + `NEXT_PUBLIC_STOREFRONT_ORIGIN` /
  `NEXT_PUBLIC_PLATFORM_ORIGIN` set in prod (messages drop silently otherwise).
- jsdom can't lay out a cross-origin iframe or fire media queries → the accuracy
  fix itself isn't unit-testable; bridge/overlay/coordinate logic stays testable.
  `editor-shell.test.tsx` + `live-preview*.test.tsx` need rewrites/removal.
- Manual smoke (both apps, real browser): reflow at 390/820/desktop, ring
  alignment, inline-edit cursor, spacing-drag feedback, page-nav reload.

## Rejected alternative
Container-query migration of ~30 sections (`sm:/md:` → `@container`): storefront
is Tailwind v3.4 (needs `@tailwindcss/container-queries`), platform is v4
(built-in); `@scheniders/sections` is compiled by both → classes must work in
both. Large cross-cutting refactor that also changes real storefront output.
Not recommended — the iframe path is fully built.

## Anchor files
- apps/platform/components/store-builder-v2/editor-shell.tsx
- apps/platform/components/store-builder-v2/preview-frame.tsx, preview-overlay.tsx
- apps/platform/hooks/use-iframe-bridge.ts
- apps/storefront/components/schneiders-preview-bridge.tsx, schneiders-preview-live-renderer.tsx
- apps/storefront/app/_preview/[tenant]/[page_id]/page.tsx
