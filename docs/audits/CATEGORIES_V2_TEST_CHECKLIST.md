# Categories Tab V2 — Comprehensive Test Checklist

**Scope:** Phases 1 & 2 of the Categories V2 upgrade. Covers DB migrations, type system, hooks, storefront queries, V2 UI, i18n, keyboard, persistence, RLS, and edge cases.

**Route:** `http://localhost:3000/products?tab=categories`
**Feature flag:** V2 is default-on. `NEXT_PUBLIC_CATEGORIES_V2=0` reverts to legacy.
**Auth:** a merchant session (tenant-scoped).
**Supabase project:** the one linked via Supabase MCP.

Mark each item `[P]` pass, `[F]` fail, `[S]` skip (state reason).

---

## 0. Environment smoke

- [ ] App is reachable at `http://localhost:3000` (dev server running).
- [ ] Logged-in merchant has ≥ 2 categories and ≥ 1 product (seed if needed).
- [ ] Browser language can be toggled (EN ↔ AR) via app settings.
- [ ] Zero TypeScript errors in `apps/platform` files under `components/categories/v2/**`, `store/use-category-store.ts`, `components/ui/mini-sparkline.tsx`, `components/ui/view-switcher.tsx`, `app/products/page.tsx` (pre-existing team/i18n errors are expected).
- [ ] `pnpm build` (or `next build`) succeeds for `@scheniders/platform` (optional gate).

---

## 1. Database schema — `categories` new columns

Verify via `mcp__supabase__execute_sql` (read-only `SELECT`):

```sql
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_name = 'categories'
ORDER BY ordinal_position;
```

- [ ] `status` exists, type `text`, default `'published'`, NOT NULL.
- [ ] `published_at` timestamptz, nullable.
- [ ] `unpublish_at` timestamptz, nullable.
- [ ] `archived_at` timestamptz, nullable.
- [ ] `banner_url` text, nullable.
- [ ] `accent_color` text, nullable.
- [ ] `icon` text, nullable.
- [ ] `name_ar` text, nullable.
- [ ] `name_en` text, nullable.
- [ ] `description_ar` text, nullable.
- [ ] `description_en` text, nullable.
- [ ] `meta_title` text, nullable.
- [ ] `meta_description` text, nullable.
- [ ] `og_image_url` text, nullable.
- [ ] `canonical_url` text, nullable.
- [ ] `show_in_main_nav` boolean, default `true`.
- [ ] `show_in_mega_menu` boolean, default `false`.
- [ ] `show_in_mobile_drawer` boolean, default `true`.
- [ ] `nav_variant` text, default `'pills'`.
- [ ] `page_config` jsonb, default non-null.
- [ ] `page_config_draft` jsonb, nullable.
- [ ] `landing_page_url` text, nullable.
- [ ] `brand_id` uuid, nullable (no FK yet — brands table lands in P3).

### 1a. Constraints & indexes

```sql
-- Status check
INSERT INTO categories (tenant_id, name, slug, status) VALUES ('<tenant>','x','x-fail','bogus');
-- expected: fails with check violation
```

- [ ] Inserting `status = 'bogus'` fails the CHECK.
- [ ] Inserting `nav_variant = 'bogus'` fails the CHECK.
- [ ] Index `idx_categories_tenant_status` exists.
- [ ] Index `idx_categories_tenant_publish_window` exists.
- [ ] Partial index on `(tenant_id)` WHERE `show_in_main_nav` exists.
- [ ] `pg_description` on `products.category_id` mentions "primary category".

---

## 2. Database schema — `product_categories` junction

```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'product_categories' ORDER BY ordinal_position;
```

- [ ] Table exists with: `id`, `tenant_id`, `product_id`, `category_id`, `is_primary`, `is_featured`, `featured_order`, `source`, `rule_id`, `created_at`.
- [ ] `UNIQUE (product_id, category_id)` constraint exists.
- [ ] CHECK on `source IN ('manual','rule','import')`.
- [ ] 5 indexes present (tenant, product, category, primary partial, featured partial — verify via `pg_indexes`).
- [ ] RLS enabled and policy references `(auth.jwt() ->> 'tenant_id')::UUID`.
- [ ] Seed integrity: `SELECT COUNT(*) FROM product_categories WHERE is_primary = true` equals `SELECT COUNT(*) FROM products WHERE category_id IS NOT NULL`.
- [ ] Every seeded row has `source = 'manual'`.

### 2a. Primary-sync trigger

Use a throwaway product + 2 categories.

- [ ] `INSERT INTO product_categories (... is_primary = true)` updates `products.category_id`.
- [ ] Inserting a second row with `is_primary = true` for the same product sets the previous primary's `is_primary = false` (only one primary per product).
- [ ] `UPDATE ... SET is_primary = true` on a non-primary row flips the existing primary off.
- [ ] `DELETE` of the current primary promotes the oldest remaining junction row's `category_id` to `products.category_id`.
- [ ] Deleting the last junction row sets `products.category_id = NULL`.

### 2b. RLS isolation

- [ ] Query junction as tenant A — returns only A's rows.
- [ ] Attempting to `INSERT` with tenant B's `tenant_id` as tenant A is denied.
- [ ] `UPDATE` of another tenant's row returns zero rows affected (not an error, but no change).

---

## 3. Type system

- [ ] `packages/shared/src/types/category.ts` exports `Category` with every new field (spot-check `status`, `accent_color`, `page_config`, `brand_id`).
- [ ] `CategoryPageBlock` union has `hero`, `featured_products`, `subcategory_grid`, `product_list`, `rich_text`.
- [ ] `DEFAULT_CATEGORY_PAGE_CONFIG` constant is exported.
- [ ] `packages/supabase/src/database.types.ts` has a `product_categories` entry with Row/Insert/Update and Relationships to `categories`, `products`, `tenants`.
- [ ] `apps/platform/types/product.ts` re-exports `Category`, `CategoryStatus`, `NavVariant`, `CategoryPageConfig`, etc. from `@scheniders/shared`.
- [ ] `cd packages/shared && npx tsc --noEmit` exits 0.
- [ ] `cd apps/storefront && npx tsc --noEmit` exits 0.
- [ ] Platform typecheck: only pre-existing errors in `team/*` and `lib/i18n.ts` (categories files clean).

---

## 4. Hooks — `apps/platform/hooks/use-categories-query.ts`

Programmatic check via the UI (each hook is exercised by a user action — see UI section). Additionally:

- [ ] `useCategoriesQuery({ includeArchived: true })` returns archived categories (set one archived, verify it appears when flag true, disappears when false).
- [ ] `useCategoriesQuery({ statuses: ['draft'] })` returns only drafts.
- [ ] `useArchiveCategoryMutation` sets `status = 'archived'` AND `archived_at` to now (verify via DB after UI action).
- [ ] `useRestoreCategoryMutation` sets `status = 'published'` AND `archived_at = NULL`.
- [ ] `useReorderCategoriesMutation` persists new `display_order` values for the set.
- [ ] `useDuplicateCategoryMutation` creates a new row with name `"… (copy)"` and a unique slug suffix.
- [ ] Duplicate with `withProducts: true` also clones junction rows (all `is_primary = false`).
- [ ] React Query invalidation: after a mutation, UI reflects change without hard refresh.

---

## 5. Storefront — `apps/storefront/lib/queries.ts`

- [ ] `listProductsInCategory(tenantId, categoryId)` returns products assigned via `product_categories` junction (not just primary).
- [ ] Junction-first query filters out `is_visible = false` and `is_archived = true` products.
- [ ] Legacy `listProducts({ categoryId })` still works (filters by `products.category_id`).
- [ ] A product assigned to two categories via the junction appears on both category pages.

---

## 6. Feature flag

- [ ] Without `NEXT_PUBLIC_CATEGORIES_V2` set (unset or `"1"`), `/products?tab=categories` renders V2 (KPI cards visible).
- [ ] With `NEXT_PUBLIC_CATEGORIES_V2=0`, same route renders the legacy simple list (no KPI cards, single search bar).

---

## 7. Header KPI cards (6)

- [ ] All 6 cards render in one row on wide screens; collapse to 2–3 cols on mobile.
- [ ] Tones: total=yellow, coverage=green, uncategorized=pink, hidden=blue, scheduled=mint, empty=purple.
- [ ] **Total**: count of categories with `status != 'archived'`. Sub-line shows top-level count · published count.
- [ ] **Coverage**: `(totalProducts - uncategorizedCount) / totalProducts * 100` as integer %. Sub-line `N/M assigned`. Coverage = 100% when totalProducts = 0.
- [ ] **Uncategorized**: count of products with `!category_id && !is_archived`. Clicking logs/triggers drill (currently no-op but button responds).
- [ ] **Hidden from nav**: count of non-archived categories where `show_in_main_nav = false`. Sub-line shows drafts count.
- [ ] **Scheduled**: categories with a future `published_at` OR future `unpublish_at`. Sub-line "upcoming".
- [ ] **Empty**: non-archived categories with 0 products in the count map. Sub-line "no products assigned".
- [ ] Toggle `show_in_main_nav` on one category → Hidden card count updates within ~1s (no refresh).
- [ ] Archive one category → Total/Empty counts drop; Archived isn't counted.

---

## 8. Filter bar

- [ ] Search input has magnifier icon and placeholder.
- [ ] Typing debounces filtering (no per-keystroke flicker on large lists).
- [ ] Fuse matches `name`, `slug`, `description`, `name_ar`, `name_en` with threshold 0.3.
- [ ] X (clear) appears only when search has text; clicking resets query.
- [ ] Status chip "Published" toggles — active tone emerald, inactive muted border.
- [ ] Chip "Draft" toggles amber.
- [ ] Chip "Archived" toggles gray.
- [ ] Guard: unchecking the last active status keeps at least one on (implementation falls back to `['published', 'draft']` if set becomes empty).
- [ ] "In main nav" chip filters the list to `show_in_main_nav = true`.
- [ ] "Reset" button appears when any filter differs from default; clears everything.
- [ ] View switcher has 3 buttons (tree / grid / mega-menu). Active state inverts colors.
- [ ] Keyboard icon button renders (placeholder for shortcuts modal).
- [ ] "+ New category" button opens the form modal.

---

## 9. Tree view (`viewMode === 'tree'`)

- [ ] Rows render in a single bordered card with padding.
- [ ] Depth indentation: root = 12px start padding; each nesting level adds 20px.
- [ ] Expand chevron only visible when the category has children.
- [ ] Clicking chevron toggles child visibility (persists via store `expandedIds`).
- [ ] Rotate animation (0° → 90°) on expanded.
- [ ] Grip handle visible on hover, cursor grab/grabbing.
- [ ] Drag to reorder within same parent persists on refresh.
- [ ] Drag onto another parent's row reparents (new `parent_id`).
- [ ] Drag ghost (`DragOverlay`) styled with ink border, shadow.
- [ ] Dropping on itself is a no-op (no request fired).
- [ ] Keyboard sortable: Tab to grip, Space to pick up, arrows to move, Space to drop.
- [ ] Network: one batched request or N parallel `UPDATE`s hit `/rest/v1/categories` per reorder.
- [ ] After refresh, `display_order` values in DB match the UI order.

---

## 10. Grid view (`viewMode === 'grid'`)

- [ ] Layout: 1/2/3/4 columns at sm/lg/xl breakpoints.
- [ ] Card shows `banner_url` when set, else `image_url` thumb, else icon emoji, else Folder icon.
- [ ] `accent_color` paints the top strip when no banner.
- [ ] Draft badge shows in top-right when `status = 'draft'`.
- [ ] "Nav" pill shows when `show_in_main_nav = true`.
- [ ] Checkbox in top-left, click does not open detail.
- [ ] Hovering reveals visibility + edit buttons in bottom-right corner.
- [ ] Archived category is opacity-60.
- [ ] `framer-motion` layout animation reorders smoothly on filter change.

---

## 11. Category row

Verified across tree + grid where applicable.

- [ ] Accent color swatch (9×9) with rounded corners.
- [ ] Image fallback → icon → first 2 letters of name (uppercase).
- [ ] Name + `/slug` line, truncated with ellipsis.
- [ ] Draft badge (amber) shown only when `status='draft'`.
- [ ] Archived badge (gray) shown only when `status='archived'`.
- [ ] Scheduled badge (teal) shown when `published_at` or `unpublish_at` is in the future; tooltip shows full timestamp.
- [ ] Missing-SEO AlertCircle (amber) shown only when `status='published'` AND (`meta_title` or `meta_description` missing).
- [ ] Sparkline renders only with `revenueSeries.length > 1`.
- [ ] Health grade chip `A/B/C/D/F` uses correct color tone.
- [ ] Product count "N product(s)" pluralizes.
- [ ] Hover reveals action buttons (opacity 0 → 100).
- [ ] Visibility toggle flips `is_visible`.
- [ ] Edit pencil opens form modal prefilled.
- [ ] More menu: Duplicate, Archive (only when not archived), Delete (rose tone).
- [ ] Clicking menu backdrop closes it.
- [ ] Menu dropdown is positioned `end-0` (RTL-correct).

---

## 12. Bulk actions bar

- [ ] Bar hidden when `selectedIds.length === 0`.
- [ ] Spring animation on entry (bottom-centered).
- [ ] Counter reads `N / total selected` (total = current filtered count).
- [ ] Hide-from-nav writes `show_in_main_nav = false` for all selected.
- [ ] Show-in-nav writes `show_in_main_nav = true`.
- [ ] Archive button writes status + `archived_at` for all selected.
- [ ] Restore button writes status='published' + clears `archived_at`.
- [ ] Merge button only appears when `selectedCount >= 2`.
- [ ] Duplicate / Move buttons fire their callbacks (even if stub in P2).
- [ ] Delete button fires callback with rose tone.
- [ ] Clear (X) resets selection.
- [ ] Loading spinner replaces icon while mutation pending.
- [ ] After archive: Undo pill appears with label + countdown.
- [ ] Countdown ticks down from 8s; label updates every 100ms.
- [ ] Clicking Undo within window restores all archived IDs.
- [ ] Timer auto-dismisses after 8s.
- [ ] `beforeunload` / unmount clears interval + timeout (no memory leak).

---

## 13. Form modal

- [ ] "+ New category" opens modal in add mode.
- [ ] Pencil on a row opens modal in edit mode with fields populated.
- [ ] Submitting add creates a row and triggers toast `categories.toast.created`.
- [ ] Submitting edit updates row and triggers toast `categories.toast.updated`.
- [ ] Modal closes on success.
- [ ] (P3 scope — tabbed rich form is NOT in P2. Legacy modal renders; verify it still works.)

---

## 14. Keyboard shortcuts (global within tab)

- [ ] `N` (no modifier) opens new-category modal.
- [ ] `/` focuses the search input.
- [ ] `Escape` clears selection when any are selected.
- [ ] Typing `n` inside an input or textarea does NOT trigger the shortcut.
- [ ] `Escape` inside a focused input still clears selection (exempted).
- [ ] `Ctrl+N` / `Cmd+N` do NOT trigger (modifier guard).

---

## 15. Zustand store persistence

Open DevTools → Application → Local Storage.

- [ ] Key `category-store-v1` is present.
- [ ] After switching view mode and refreshing, `viewMode` restores.
- [ ] After applying filter changes and refreshing, `filters` restores.
- [ ] After expanding a node and refreshing, `expandedIds` restores.
- [ ] `selectedIds` is NOT persisted (refresh clears selection).
- [ ] `draftEdits` is NOT persisted.
- [ ] Writes are debounced (~1s): rapid clicks don't produce a write on every event.

---

## 16. i18n & RTL

- [ ] In EN locale, every `categories.*` label resolves (no raw `categories.kpi.total` text on screen).
- [ ] Switch to AR — all labels render in Arabic.
- [ ] Document direction becomes RTL (`dir="rtl"` on html).
- [ ] `ms-auto`, `end-0`, `start-2`, `pe-/ps-` classes mirror correctly.
- [ ] Drag handles and checkboxes still on the visual "start" side.
- [ ] More-menu dropdown anchors to visual "end" in both directions.

---

## 17. Empty, loading, error states

- [ ] Before categories load: spinner visible in content area.
- [ ] When filters exclude all categories: dashed empty placeholder ("No categories match your filters.").
- [ ] When tenant has zero categories: grid/tree shows empty placeholder; KPIs show zeros gracefully (no NaN, no divide-by-zero).
- [ ] Mutation error (e.g., force network offline, try archive): toast `categories.error.*` surfaces.
- [ ] Delete attempt on a category with products is blocked with `categories.error.hasProducts`.

---

## 18. Accessibility spot-checks

- [ ] Status chips have keyboard focus outline.
- [ ] View switcher buttons have `role="tab"`, `aria-selected`.
- [ ] Checkboxes have visible focus rings.
- [ ] Drag handle has `aria-label="Drag to reorder"`.
- [ ] More-menu trigger is a real `<button>` (tab reachable).

---

## 19. Network & performance

- [ ] Initial tab open issues one `GET /rest/v1/categories` request.
- [ ] Switching view modes does NOT refetch.
- [ ] Reorder drag produces fewer than N+1 requests (batched per row is acceptable; watch for infinite loops).
- [ ] No console errors in the browser console on initial render.
- [ ] No React "key" warnings.
- [ ] No hydration mismatch warnings.

---

## 20. Regression — legacy features still work

- [ ] `/products?tab=all` still renders the Products V2 grid unchanged.
- [ ] Product detail drawer still opens.
- [ ] Order flow through a product (add to cart, checkout) unchanged.
- [ ] Legacy `/products?tab=categories` with flag=0 still renders and allows CRUD.

---

## 21. Cleanup verification

- [ ] No `console.log` left in V2 category files.
- [ ] No unused imports in V2 files (`npx tsc --noEmit` green, ESLint clean for these paths).
- [ ] Extracted `MiniSparkline` still works in the Products tab's forecasting cards.

---

## Sign-off

- Total items: count them — if < 180 we missed some.
- Pass rate: __/__
- Failures requiring fix (blocking): list.
- Failures accepted as P3+ work: list.
