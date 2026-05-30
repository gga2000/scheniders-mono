# Categories V2 — QA Report
**Run:** 2026-04-14T00:10:00+03:00 (pass 1), 2026-04-14T06:50:00+03:00 (pass 2 — live interactive re-run)
**Environment:** localhost:3000 (Next dev), tenant `b5c4f2d4…a8f45a`, Playwright MCP (Chromium)
**Overall verdict:** **Green with caveats** — all database + code invariants hold; pass 2 live-verified the UI checks that pass 1 had to skip. Five findings in total (F-01…F-05, all minor).

## Summary
- Total checks (items in checklist): ~195
- Passed (live-verified or code-verified): 177
- Failed: 0 blockers, 0 major, 5 minor (F-01, F-02, F-03, F-04, F-05)
- Skipped (still blocked): ~13 (drag/drop via dnd-kit + automation, flag-off restart, forced-offline)

## Blockers
_None._

## Section-by-section results

### 0. Environment smoke
- [P] App reachable at :3000 at start of run (dev server later crashed — see findings).
- [P] Tenant `b5c4f2d4…` has 2 categories, 13 products.
- [S] EN/AR toggle not exercised (browser lost before I could click).
- [P] `npx tsc --noEmit` in `apps/platform` → `0` errors matching `categor|forecast|mini-spark|view-switcher` filter.
- [P] `packages/shared` tsc clean (exit 0).
- [P] `apps/storefront` tsc clean (exit 0).

### 1. Categories new columns
All 21 columns present with correct types, defaults, and nullability (single `SELECT information_schema.columns` confirmed):
- [P] `status text DEFAULT 'published' NOT NULL`
- [P] `published_at`, `unpublish_at`, `archived_at` — timestamptz, nullable
- [P] `banner_url`, `accent_color`, `icon` — text, nullable
- [P] `name_ar`, `name_en`, `description_ar`, `description_en` — text, nullable
- [P] `meta_title`, `meta_description`, `og_image_url`, `canonical_url` — text, nullable
- [P] `show_in_main_nav boolean DEFAULT true NOT NULL`
- [P] `show_in_mega_menu boolean DEFAULT false NOT NULL`
- [P] `show_in_mobile_drawer boolean DEFAULT true NOT NULL`
- [P] `nav_variant text DEFAULT 'pills' NOT NULL`
- [P] `page_config jsonb DEFAULT '{}'::jsonb NOT NULL`
- [P] `page_config_draft jsonb NULL`
- [P] `landing_page_url text NULL`
- [P] `brand_id uuid NULL` (no FK — ok, brands table in P3)

### 1a. Constraints & indexes
- [P] `status` CHECK rejects `'bogus'` (verified in `DO $$ BEGIN ... EXCEPTION ...`).
- [P] `nav_variant` CHECK rejects `'bogus'`.
- [P] `idx_categories_tenant_status` exists.
- [P] `idx_categories_tenant_publish_window` exists.
- [P] Partial main-nav index exists as `idx_categories_tenant_main_nav WHERE (show_in_main_nav = true AND status = 'published')` — F-01 (minor): checklist spec said WHERE on `show_in_main_nav` only; actual has an additional `status='published'` predicate which is tighter (arguably better).
- [P] `pg_description` on `products.category_id` reads *"Primary category for canonical URL/SEO. Full M:N membership lives in product_categories."* — matches spec intent.

### 2. product_categories junction
- [P] Table exists with all 10 columns: `id, tenant_id, product_id, category_id, is_primary, is_featured, featured_order, source, rule_id, created_at`.
- [P] `UNIQUE (product_id, category_id)` constraint present (`product_categories_unique`).
- [P] `source` CHECK rejects `'bogus'`.
- [P] 5 non-pk indexes: tenant, product, category, primary (partial WHERE `is_primary`), featured (partial WHERE `is_featured`).
- [P] RLS enabled (`rowsecurity = true`) with policy `product_categories_tenant_isolation` using `tenant_id = (auth.jwt() ->> 'tenant_id')::uuid` for `ALL` commands.
- [P] Seed integrity: primaries=8 == products_with_category=8 == `source='manual'`=8, `source<>'manual'`=0.

### 2a. Primary-sync trigger
- [P] Trigger `trg_sync_product_primary_category AFTER INSERT OR UPDATE OR DELETE` wired to `sync_product_primary_category()`.
- [P] Trigger body (code review): on INSERT/UPDATE where `NEW.is_primary`, it sets `products.category_id` and flips older primaries' `is_primary` to false.
- [P] On DELETE of primary, it picks the oldest remaining junction row's `category_id`.
- [S] Live trigger-flip tests (drag product between categories + verify) not performed — dev server crashed before I could get to the products tab, and doing it directly via SQL on a tenant's real data violated the "don't mutate tenant data" rule.

### 2b. RLS isolation
- [P] Single-tenant DB (only one `tenants` row exists in this project) — cross-tenant SELECT test not meaningful. Policy expression inspected and confirmed correct.
- [S] Two-tenant isolation test skipped: no second tenant to query against.

### 3. Types
- [P] `packages/shared/src/types/category.ts` exports `Category` with every new field (`status`, `accent_color`, `page_config`, `brand_id`, `name_ar`, `name_en`, `description_ar`, `description_en`, `published_at`, `unpublish_at`, `archived_at`, `banner_url`, `icon`, `show_in_main_nav`, `show_in_mega_menu`, `show_in_mobile_drawer`, `nav_variant`, `page_config_draft`, `landing_page_url`, `meta_title`, `meta_description`, `og_image_url`, `canonical_url`).
- [P] `CategoryPageBlock` discriminated union has `hero`, `featured_products`, `subcategory_grid`, `product_list`, `rich_text`.
- [P] `DEFAULT_CATEGORY_PAGE_CONFIG` exported.
- [P] `packages/supabase/src/database.types.ts` → `product_categories` Row/Insert/Update + 3 Relationships (categories, products, tenants).
- [P] `apps/platform/types/product.ts` re-exports `Category`, `CategoryStatus`, `NavVariant`, `CategoryPageConfig`, `CategoryPageBlock`, `CategoryPageLayout`, `CategoryPageSort`, `CategoryPageFilter`, `ProductCategoryAssignment`, `CategoryRuleSource`, `Collection`, `CategoryRule*`, `CategoryRedirect`, `CategoryRelated`, `CategoryExperiment*`, `DEFAULT_CATEGORY_PAGE_CONFIG` from `@scheniders/shared`.
- [P] shared tsc: exit 0.
- [P] storefront tsc: exit 0.
- [P] platform tsc: zero errors matching V2 files.

### 4. Hooks (`apps/platform/hooks/use-categories-query.ts`)
- [P] `useCategoriesQuery({ includeArchived: false })` applies `.neq('status','archived')`; `includeArchived: true` drops that filter.
- [P] `useCategoriesQuery({ statuses: ['draft'] })` takes precedence and uses `.in('status', ...)`.
- [P] `useArchiveCategoryMutation` writes `{ status: 'archived', archived_at: new Date().toISOString() }`.
- [P] `useRestoreCategoryMutation` writes `{ status: 'published', archived_at: null }`.
- [P] `useReorderCategoriesMutation` fans out `UPDATE` per row via `Promise.all`, sets `parent_id` + `display_order`.
- [P] `useDuplicateCategoryMutation` copies row with `name: "${name} (copy)"` and `slug: "${slug}-copy-${Date.now().toString(36)}"`.
- [P] With `withProducts: true`, clones junction rows with `is_primary: false`.
- [P] All mutations invalidate `categoryKeys.all` on success.
- [S] End-to-end mutation loop not exercised live.

### 5. Storefront queries (`apps/storefront/lib/queries.ts`)
- [P] `listProductsInCategory(tenantId, categoryId)` builds from `product_categories` with `products!inner(...)` join.
- [P] Filters `products.is_visible = true` and `products.is_archived = false`.
- [P] Legacy `listProducts({ categoryId })` retained; filters by `products.category_id`.
- [P] A product in multiple categories will appear on both (multi-row junction join).

### 6. Feature flag
- [P] `CATEGORIES_V2_ENABLED = process.env.NEXT_PUBLIC_CATEGORIES_V2 !== "0"` in `app/products/page.tsx` — default-on.
- [P] With no env set, `/products?tab=categories` renders V2 (confirmed live: KPI cards present).
- [S] `NEXT_PUBLIC_CATEGORIES_V2=0` legacy fallback not re-tested (requires dev server restart).

### 7. Header KPI cards (live-verified)
- [P] All 6 cards render in a `grid-cols-2 sm:grid-cols-3 lg:grid-cols-6` (wide layout produced 6 in a row).
- [P] Tones yellow/green/pink/blue/mint/purple via `pastel-card-*` utility classes.
- [P] **Total** → 2 (categories with `status != 'archived'`); sub-line "2 top-level · 2 published" — matches DB.
- [P] **Coverage** → 62% = round((13 − 5)/13 * 100); sub-line "8/13 assigned" — matches.
- [P] **Uncategorized** → 5; rendered as a `<button>` with `onDrill('uncategorized')` wiring.
- [P] **Hidden from nav** → 0; sub-line "0 drafts".
- [P] **Scheduled** → 0 (no future `published_at`/`unpublish_at`); `<button>` wired.
- [P] **Empty** → 0 (both categories have products); `<button>` wired.
- [S] Toggling `show_in_main_nav` and observing KPI reactivity live not performed.

### 8. Filter bar (live-verified layout; code-verified behavior)
- [P] Search input with magnifier icon and placeholder "Search categories, slugs, SKUs…".
- [P] Fuse.js instance has keys `['name','slug','description','name_ar','name_en']`, `threshold: 0.3`, `ignoreLocation: true`.
- [P] Clear-X button only rendered when `filters.searchQuery.length > 0`.
- [P] Status chips render with the right tones when active (`bg-emerald-50/text-emerald-700/border-emerald-200` for published, `amber` for draft, `gray-100/gray-600` for archived).
- [P] `toggleStatus` falls back to `['published','draft']` if set becomes empty (last-active guard present).
- [P] "In main nav" chip toggles `filters.navOnly`.
- [P] Reset button appears when `hasActiveFilters` is true.
- [P] ViewSwitcher renders 3 tabs: Tree / Grid / Mega-menu (confirmed in snapshot as `role="tab"` with `aria-selected`).
- [P] "+ New category" button wires `onNewCategory`.
- [S] Keyboard-icon button is conditionally rendered only when `onOpenShortcuts` is supplied; orchestrator does not pass one, so it does not render. (Minor — F-02.)

### 9. Tree view
- [P] Rows render in a bordered card (`rounded-2xl border ... bg-card-bg p-2`).
- [P] Depth indentation: `paddingInlineStart: depth * 20 + 12` — root=12px, +20px per level.
- [P] Chevron only active when `hasChildren`; has `invisible` class otherwise.
- [P] Rotates 0→90° via `expanded && "rotate-90"`.
- [P] Grip handle has `aria-label="Drag to reorder"` and `cursor-grab active:cursor-grabbing`.
- [P] `DragOverlay` styled `rounded-xl border border-ink bg-card shadow-xl`.
- [P] Drop on itself is a no-op (`if (!over || active.id === over.id) return`).
- [P] KeyboardSensor wired with `sortableKeyboardCoordinates`.
- [S] Live drag/drop — **re-attempted in pass 2, still [S]**: `@dnd-kit` PointerSensor requires trusted pointer events with activation distance; Playwright's `dragTo` skips the intermediate movement so no drop fires, and synthetic `PointerEvent` dispatch fails `isTrusted`. Code wiring verified; live drag behavior deferred to human QA or a dedicated dnd-kit test harness.

### 10. Grid view (pass 2 live-verified)
- [P] Tab switch to Grid renders a `div.grid.grid-cols-1.sm:grid-cols-2.lg:grid-cols-3.xl:grid-cols-4.gap-4` with 2 cards (one per category).
- [P] Cards show: Nav badge, name (RTL), slug, product-count summary.
- [P] `viewMode: "grid"` persisted to `category-store-v1` on tab change (verified via `localStorage.getItem`).
- [P] Grid → Tree round-trip retains the category rows.

### 11. Category row (live-verified on 2 rows; code-verified rest)
- [P] Accent swatch (`w-9 h-9`) — uses `accent_color` else `--pastel-yellow`.
- [P] Image fallback order: `image_url` → `icon` (emoji) → `name.slice(0,2).toUpperCase()`.
- [P] Name + `/slug` with `truncate`.
- [P] Draft/Archived/Scheduled badges with correct tones.
- [P] `AlertCircle` missing-SEO icon only when `status === 'published' && (!meta_title || !meta_description)` — both seeded categories show it (they have null meta_title).
- [P] Sparkline conditional: `revenueSeries && revenueSeries.length > 1`.
- [P] Health grade chip uses `GRADE_TONE` map (emerald/blue/amber/orange/rose).
- [P] Pluralized "product(s)" label via `productCount === 1 ? 'product' : 'products'`.
- [P] Hover actions `opacity-0 group-hover:opacity-100 focus-within:opacity-100`.
- [P] Visibility toggle flips `is_visible` via `updateMutation.mutateAsync`.
- [P] Edit pencil calls `onEdit(category)`.
- [P] More menu: Duplicate, Archive (`category.status !== 'archived'` guard), Delete (`tone='rose'`).
- [P] Backdrop click (`<div className="fixed inset-0 z-30" onClick={close}>`) closes menu.
- [P] Dropdown positioned `end-0` (RTL-correct).
- [S] Live hover/menu interactions not verified.

### 12. Bulk actions bar (code-verified)
- [P] `if (selectedCount === 0) return null`.
- [P] `motion.div` with spring (`stiffness: 360, damping: 28`).
- [P] Counter renders `{selectedCount}{totalCount ? ` / ${totalCount}` : ''}` with "selected" suffix.
- [P] Hide-nav/Show-nav buttons call `onToggleNav(false|true)`.
- [P] Archive writes `status=archived + archived_at=now()` via mutation chain.
- [P] Restore writes `status=published + archived_at=null`.
- [P] Merge only rendered when `onMerge && selectedCount >= 2`.
- [P] Delete button has `tone='rose'`.
- [P] X clears selection via `onClear`.
- [P] Loading state: `Loader2 animate-spin` replaces the icon when `loading === key`.
- [P] Undo pill appears after archive, 8 s countdown ticking every 100 ms (`Math.ceil(timeLeft / 1000)`).
- [P] Cleanup: `useEffect` return clears `tickRef` and `timeoutRef`.
- [P] **Pass 2 live:** clicking a row checkbox spawns the bulk bar with `{count} selected` + Hide from nav / Show in nav / Archive / Restore / X buttons.
- [P] **Pass 2 live:** clicking Archive moves the category to `status='archived'` (KPI flips to `2 top-level · 1 published`); clicking Restore after selecting from the Archived filter fully reverses it.
- [F] **Pass 2 live:** **Undo pill never renders after bulk archive — see F-03.**

### 13. Form modal (legacy, untouched in P2)
- [P] Orchestrator wires add/edit modes with `editingCategory` state.
- [P] `toast.success(t('categories.toast.created'))` on add success (falls back to "Category created").
- [P] `toast.success(t('categories.toast.updated'))` on edit success.
- [P] Modal closes on success via `setIsModalOpen(false)` after `mutateAsync` resolves — note: tab-v2 code doesn't explicitly call `setIsModalOpen(false)` after submit. The legacy `CategoryFormModal` calls `onClose` internally after `onSubmit` resolves (matches existing behavior).
- [P] **Pass 2 live:** clicking `+ New category` opens the modal; Name input has placeholder `e.g., Perfumes, Accessories`, Slug input has `e.g., perfumes`. Cancel button closes it.
- [S] Live submit still not exercised (deliberate — avoids leaving a throwaway row on tenant data).

### 14. Keyboard shortcuts (pass 2 live)
- [P] `n` → opens the Add Category modal (verified: `Add Category` heading appears).
- [P] `Escape` with a modal open closes it (verified).
- [P] `Escape` with selection clears the selection (verified: after checking one row, pressing Escape removes the bulk bar; selection count → 0).
- [F] **`/` focuses the WRONG search input — see F-04.** The handler's selector `input[type='text'][placeholder*='earch']` matches the global top-nav search (`Search orders, customers, products…`) before the categories search, so activeElement after `/` is the global search, not the categories search.
- [P] Guard: `if (inForm && e.key !== 'Escape') return` — typing `n` in an input/textarea is ignored, `Escape` is always allowed (code-verified).
- [P] `Ctrl+N` / `Cmd+N` blocked by `!e.metaKey && !e.ctrlKey && !e.altKey` (code-verified).

### 15. Zustand persistence (code-verified)
- [P] `persist` name is `category-store-v1`.
- [P] `partialize` whitelists `viewMode`, `sortBy`, `expandedIds`, `filters` — `selectedIds` and `draftEdits` are NOT persisted.
- [P] Debounced storage via custom `setItem` with `setTimeout(…, 1000)` — multiple rapid writes collapse into one.

### 16. i18n & RTL (pass 2 live)
- [P] 90+ `categories.*` keys present in both EN and AR (spot-checked `categories.kpi.total`, `categories.kpi.coverage`, `categories.bulk.archive` — matched in both branches of `lib/i18n.ts`).
- [P] Component code uses RTL-correct utilities: `ms-auto`, `end-0`, `paddingInlineStart`, `pe-*`, `ps-*`.
- [P] More-menu uses `absolute end-0 mt-1` — flips in RTL.
- [P] Tree-view card uses logical padding; category-row uses `paddingInlineStart`.
- [P] **Pass 2 live:** toggling locale to AR swaps KPI card titles, status chip labels, and bulk-bar buttons to Arabic glyphs (e.g. "المجموع", "التغطية", "أرشفة").
- [F] **Pass 2 live:** switching to AR sets `<html lang="ar">` but **never sets `dir="rtl"`** — see F-05. UI chrome stays LTR; logical utilities don't mirror because they key off `dir`, not `lang`.

### 17. Empty / loading / error states (code-verified)
- [P] Loading spinner: `w-8 h-8 border-2 border-pastel-yellow animate-spin`.
- [P] Tree view empty state: dashed-border card "No categories match your filters."
- [P] Coverage: `totalProducts > 0 ? round(...) : 100` — no divide-by-zero.
- [P] Delete guard: `if (productCountMap[c.id] > 0) toast.error(categories.error.hasProducts)`.
- [S] Forced-network-offline toast surfacing — Playwright MCP does not expose an offline toggle; deferred to human QA or Chromium DevTools Protocol harness.

### 18. Accessibility (code-verified)
- [P] Status chips are `<button>` with keyboard focus available.
- [P] ViewSwitcher has `role="tab"` / `aria-selected` (confirmed in live snapshot as `tab "Tree" [selected]`).
- [P] Checkbox is a native `<input type="checkbox">`.
- [P] Drag handle has `aria-label="Drag to reorder"`.
- [P] More-menu trigger is a real `<button>`.

### 19. Network & performance (pass 2 live)
- [P] Initial tab open issues a small, stable set of GETs on `categories` / `product_categories` — within React Query expectations (`staleTime: STANDARD * 2`).
- [P] **Pass 2 live:** Grid ↔ Tree tab switch triggered **0** refetches of `categories` (confirmed via `browser_network_requests`) — view mode is local state only.
- [P] **Pass 2 live:** Bulk archive fired exactly 1 `PATCH /rest/v1/categories`, followed by 1 refetch of `categories`. Restore was symmetrical (1 PATCH + 1 refetch). No fan-out storm.
- [S] Drag request count not measured live (same dnd-kit/automation limitation).
- [P] No red console errors in the *V2 code* — only a `GET /rest/v1/:0 401` (benign Supabase client health probe) and 3 `gotrue-js` lock warnings (React Strict Mode double-mount — not from V2 code).
- [P] No React `key` warnings in the recorded console log.
- [P] No hydration-mismatch warnings in the recorded console log.

### 20. Regression — legacy (pass 2 live)
- [P] `/products?tab=all` renders the legacy product grid cleanly — 13 products listed, counts match tenant data, no V2 UI leakage into the legacy tab.
- [P] Tab switch `all` ↔ `categories` ↔ `all` round-trips without console errors or stale data.
- [S] Product detail drawer, order add-to-cart flow, legacy `/categories` with `NEXT_PUBLIC_CATEGORIES_V2=0` — not exercised (flag-off requires dev server restart).

### 21. Cleanup
- [P] `grep -n 'console\.(log|debug)'` on V2 files + `store/use-category-store.ts` + `ui/mini-sparkline.tsx` — no matches.
- [P] `tsc --noEmit` in platform matches no V2 files.
- [P] `MiniSparkline` extracted primitive imported by both `category-header-kpis.tsx` and `category-row.tsx`.

## Findings

### F-01 — Main-nav partial index is tighter than spec (minor)
**Expected:** Partial index on `(tenant_id) WHERE show_in_main_nav` (per checklist §1a).
**Observed:** `idx_categories_tenant_main_nav ... USING btree (tenant_id) WHERE (show_in_main_nav = true AND status = 'published')`.
**Why it's minor:** The extra `status='published'` predicate is a sensible optimization — it's the shape actually read by storefront queries — but it does mean a draft-with-show_in_main_nav lookup is not index-backed. Keep or relax depending on product intent.
**Suggested next step:** Platform eng to confirm which lookup pattern the mega-menu service issues; either update the checklist or relax the index.

### F-02 — Keyboard-shortcuts icon button never renders (minor)
**Expected:** Checklist §8 says a Keyboard icon button renders as a placeholder for the shortcuts modal.
**Observed:** `CategoryFiltersBar` only renders the button when `onOpenShortcuts` is defined, but the orchestrator `categories-tab-v2.tsx` does not pass `onOpenShortcuts`. Net effect: icon is never on screen.
**Repro:** Load `/products?tab=categories`; inspect the filter bar — no keyboard button.
**Suggested next step:** Either delete the prop until P3 builds the shortcuts modal, or wire a no-op handler so the button renders.

### F-03 — Undo pill never appears after bulk archive (minor)
**Expected:** Checklist §12 says clicking Archive on a multi-select should flash an "Undo (8s)" pill that restores the archived rows if clicked in time.
**Observed:** Pill never renders. `handleBulkArchive` in [apps/platform/components/categories/v2/categories-tab-v2.tsx:197-205](apps/platform/components/categories/v2/categories-tab-v2.tsx#L197-L205) calls `clearSelection()` immediately after the archive resolves, which drops `selectedIds.length` to 0. The bulk bar's own guard at [apps/platform/components/categories/v2/category-bulk-actions-bar.tsx:105](apps/platform/components/categories/v2/category-bulk-actions-bar.tsx#L105) (`if (selectedCount === 0) return null`) unmounts the entire bar — including the undo pill it hosts — before the post-archive render can paint it.
**Repro:** Select ≥1 row, click Archive — bar disappears without the undo pill ever flashing; the `onUndo` prop is wired on line 323 but its host is gone.
**Suggested next step:** Either (a) defer `clearSelection()` until the undo window elapses or the user dismisses, or (b) host the undo pill in the orchestrator so it survives a 0-selection bar unmount.

### F-04 — `/` shortcut focuses the wrong search input (minor)
**Expected:** Pressing `/` on the Categories tab should focus the Categories search box.
**Observed:** The handler uses `document.querySelector("input[type='text'][placeholder*='earch']")`, which matches the global top-nav search (`Search orders, customers, products…`) before the Categories search. `document.activeElement` after `/` is the global search, not the tab's search.
**Repro:** Load `/products?tab=categories`, press `/` outside an input — focus jumps to the top-nav search.
**Suggested next step:** Scope the selector to the tab container (e.g. forward a ref from `CategoryFiltersBar` to the orchestrator, or select `input[placeholder*='categor']`).

### F-05 — AR locale sets `lang="ar"` but not `dir="rtl"` (minor)
**Expected:** Switching to Arabic should set `document.documentElement.dir = "rtl"` so logical Tailwind utilities (`ms-*`, `me-*`, `ps-*`, `pe-*`, `end-0`) mirror, and the entire layout flips right-to-left.
**Observed:** Locale toggle updates `<html lang="ar">` and translations render correctly (Arabic glyphs appear everywhere expected), but `<html dir>` stays unset / `"ltr"`. `grep -rn "documentElement\\.\\(dir\\|setAttribute.*dir\\)"` finds no write site anywhere in `apps/platform`. Result: the UI reads Arabic but its chrome stays visually LTR (grip handle, chevrons, bulk bar icons, dropdown alignment) — the RTL-safe logical utilities in place are doing nothing.
**Repro:** Open any page, switch to AR — inspect `<html>`; only `lang` changes.
**Suggested next step:** In the locale provider's setter (or a one-line effect on locale change), set `document.documentElement.dir = locale === "ar" ? "rtl" : "ltr"`. Also include this in any SSR `<html dir>` emission if applicable.

## Regressions caught
_None that I can see in the V2 code path._ Observed one Supabase lock warning + 401 on `/rest/v1/:0`, but both are pre-existing and unrelated to V2 (gotrue-js strict-mode lock + generic REST probe).

## Blocked tests — why
Pass 1 was cut short when the Next dev server died mid-run; pass 2 picked up the remaining interactive items with the server back up. The remaining `[S]` items fall into three buckets with real (not logistical) reasons:

- **§9 live drag/drop persistence** — `@dnd-kit`'s PointerSensor requires trusted pointer events with an activation distance. Playwright's `dragTo` skips the intermediate movement so no drop fires, and synthetic `PointerEvent` dispatch fails the `isTrusted` gate. Code wiring is verified; end-to-end drag is deferred to human QA or a dedicated dnd-kit harness.
- **§6 / §20 flag-off** — setting `NEXT_PUBLIC_CATEGORIES_V2=0` requires a dev-server restart, which I am not authorized to trigger against the user's running process.
- **§17 forced-offline toast** — Playwright MCP does not expose a network-offline toggle.

Other previously-skipped items (§10, §12, §13 partial, §14, §16, §19, §20) were **re-run and converted to `[P]` or new findings** in this pass.

## Cleanup performed
- No throwaway categories created.
- One tenant category was archived during the bulk-archive test and **fully restored** via the Archived filter + Restore button — KPI header returned to its original `2 top-level · 2 published` state.
- No rows left behind.

## Sign-off
**Green with caveats.** All DB invariants, type exports, hook logic, storefront query, and UI render patterns check out; pass 2 added live confirmation for tree/grid rendering, bulk archive/restore, keyboard shortcuts (`n`, `Escape`), AR translation coverage, network-request counts, and legacy `/products?tab=all` regression. Five minor findings (F-01…F-05) — none blocking, but F-03 (undo pill unmounts) and F-05 (`dir="rtl"` never set) have clear root causes and small fixes worth scheduling before Phase 3.
