# E4 — Custom-page section authoring — implementation plan

**Status:** planned. Foundation already shipped (CustomPage type, `config.custom_pages[]`,
CustomPagesScreen CRUD, storefront `/s/<tenant>/p/<slug>` route). This plan adds the
missing half: **authoring a custom page's section tree in the builder canvas**, the
same way system pages are edited. Approach A (separate `active_custom_page_id` edit
target; `active_page` stays the frozen `PageId` enum).

## The gap
`CustomPage` already holds `sections: SectionInstance[]`, but nothing lets a merchant
edit them: CustomPagesScreen is CRUD-only (its own comment: "the per-page section tree
is edited elsewhere") and the canvas only ever targets `config.pages[active_page]`.
`active_page: PageId` can't name a custom page (custom pages have slugs/ids, not enum
members), and `/_preview` rejects non-enum page segments (falls back to `home`).

## Design (approved)
- **No data-model change.** Reuse `CustomPage {id, slug, title, sections[], meta, hidden}`.
- **One edit target at a time.** New builder state `active_custom_page_id: string | null`.
  `set_active_page` clears it; `set_active_custom_page_id` sets it. Exactly one of
  (system page | custom page) is the edit target.
- **Single write chokepoint.** Pure helper `withActivePageSections(config, target, mutate)`
  (`target` = system `PageId` **or** custom id) returns the next config, writing to
  `pages[]` or `custom_pages[]`. All canvas mutations go through it. System-page writes
  stay byte-identical (additive).
- **Preview by slug.** For a custom target the editor uses the slug as the `/_preview`
  page segment; config-push posts the custom page as `PageConfig {page_id: slug, sections,
  meta}`; page-nav fires `page_id_change` to the custom-slug URL. Target is keyed by **id**
  so a re-slug mid-edit survives (preview URL re-mints on slug change).

## Steps (each: green type-check + lint + tests, then commit)
1. **Shared helper** — `withActivePageSections` + an `EditTarget` type + `findCustomPageById`
   in `packages/shared/src/custom-pages.ts` (+ tests). New code, zero collision. Foundation.
2. **Builder hook** (`use-store-builder-v2.ts`) — `active_custom_page_id` state +
   `set_active_custom_page_id` + derived `active_custom_page`; `set_active_page` clears the
   custom id; dangling id resolves to null. Tests.
3. **Editor-shell canvas** — derive one `editTarget`; route `activeSections` + every handler
   (sections-change / add / spacing / inline-edit / page-meta / overlay actions) through the
   helper; preview URL + config-push + page-nav use the custom slug when targeting a custom
   page. (Hot file — verify clear before editing.)
4. **Page-tree + CRUD** — page-tree "Custom pages" group listing each page (title · N
   sections · hidden badge) as a selectable canvas row → `set_active_custom_page_id`; add
   an "Edit sections" button to each CustomPagesScreen row → set target + close screen.
5. **`_preview` route** — resolve the page segment: system PageId → existing path; else a
   `custom_pages` slug → render its sections via the live renderer (wrapped as `PageConfig`);
   else `NoV2Placeholder`. Hidden pages still preview (editor context).
6. **Edge cases + verify** — deleted-while-editing → fall back to home; hidden page editable;
   variant page-conditions never match a custom slug (already true). Full suite green.

## Out of scope (deferred)
Page reorder, duplicate, nav-builder linking of custom pages.

## Risks
- `use-store-builder-v2.ts`, `editor-shell.tsx`, `page-tree.tsx` are shared with a parallel
  session — verify each is clear immediately before editing; keep commits small.
- Cross-origin custom-page preview not unit-testable (same jsdom limit as BUG1) — resolution
  logic stays unit-tested; manual browser smoke noted.
