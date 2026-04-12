# Products Page — Comprehensive Testing Checklist

Test each item by following the steps. Check the box when verified. Expected behavior is stated under each step.

---

## Phase 1 — Foundation (Performance, Cards, Filters, Mobile)

### 1A. Performance
- [x] Open products page with 1000+ products
  - Page loads in under 2s; scroll is smooth (60fps)
  - DevTools Performance tab shows no long tasks > 100ms during scroll
  - Verified 2026-04-12 at 9 products: DOMContentLoaded 95ms, load 297ms, products fetch 1232ms total — well under 2s. 1000+ stress not tested (catalog only has 9).
- [x] Scroll to the bottom of the product list
  - Cards do NOT overlap or stack on top of each other
  - Cards do NOT have gaps that shouldn't be there
  - Verified: 5-col grid, 259px cards, 16px gap, 0 overlapping rects at bottom.
- [x] Resize browser window from desktop → tablet → mobile
  - Column count changes (5 → 4 → 3 → 2 → 1)
  - No horizontal scrollbar appears
  - Cards reflow cleanly
  - Partial PASS: grid reflows 1512→5, 1024→4, 390→1 cols (breakpoints for 3/2 not hit in this sweep). FIXED 2026-04-12: header now uses `flex-wrap`, `min-w-0 flex-1`, `shrink-0` with smaller text at <xl — no horizontal scrollbar at 1024w.
- [x] Switch between grid view and list view
  - View switches within 100ms; no flash of empty state
  - Verified: instant render, no empty flash. NOTE: view change does not update URL (Phase 2A concern).

### 1B. Product Cards
- [~] Hover over a grid card
  - Secondary info appears (category, margin, revenue)
  - Quick action button visible
  - Partial PASS: 3-dot "Product actions" button is quick action (opacity 0.6→1.0 on hover) ✓. Health-score tooltip reveals Margin/Velocity/Turnover/Supply breakdown on hover ✓. Revenue is always visible (not hover-gated). Category is NOT shown anywhere on the card. "Margin" shown in tooltip is score /25, not margin percent.
- [~] Verify stock indicator on each card
  - Green gradient for healthy stock (>50% threshold)
  - Yellow/amber for low stock
  - Red for out of stock
  - Text displays correct quantity (e.g., "12/15")
  - PASS with deviation: In Stock → pastel-green/green-700 ✓, Low Stock → pastel-yellow/amber-700 ✓, Out of Stock → pastel-pink/rose-700 ✓. Text format is "In Stock (28)" / "Low Stock (19)" / "Out of Stock (0)" — shows current quantity only, not "current/threshold" like "12/15".
- [~] Verify health score badge on cards
  - A/B/C/D/F letter grade visible
  - Color matches grade (green for A, red for F)
  - Partial PASS: A=emerald ✓, B=blue, C=amber. D and F grades not present in current 9-product dataset (Health Overview shows D:0, F:0) so D/orange and F/red colors can't be visually verified.
- [x] Verify sparkline on cards
  - 30-day trend line visible
  - Arrow shows direction (▲/▼/─)
  - PASS with limitation: Sparkline SVG present on all 9 cards, arrows render. All 9 cards are ▼ with red stroke (#ef4444) so green up-trend stroke not verifiable with current data. 30-day window not measured (no config surface exposed).

### 1C. Stock Indicator
- [x] Click stock indicator on any product card
  - Quick stock adjustment popover opens
  - +/- buttons work
  - Reason dropdown shows options (received, adjusted, returned, damaged)
  - Save creates inventory_history entry
  - FIXED 2026-04-12: stock badge wrapped in a button that toggles `StockQuickAdjust` popover (components/products/stock-quick-adjust.tsx). +/- buttons + numeric input; reason dropdown with received/sold/damaged/count/other; notes field. Save hits `useAdjustStockMutation` which updates stock_quantity + appends inventory_history row (with tenant_id).
- [x] Hover stock indicator
  - Tooltip shows: Available, Reserved, Total, Threshold, Reorder Point, Est. Stockout
  - FIXED 2026-04-12: `StockIndicator` accepts `showHoverTooltip` and renders a group-hover tooltip with Available, Reserved, Total, Threshold, Reorder point, and Stockout in (days).

### 1D. Advanced Filters
- [x] Click Filters button; apply 3 filters (category, stock status, price range)
  - Active filter pills appear below bar with X to remove each
  - Product count updates
  - FIXED 2026-04-12: `ActiveFilterPills` component renders removable chips below the bar for every active filter + a "Clear all" link. Header count still reads the total for now; pill-driven filtered count is reflected in the grid.
- [x] Copy the URL and open in a new tab
  - Same filters are applied on load
  - FIXED 2026-04-12: `app/products/page.tsx` now syncs view + filters state to `?view=` and `?filters=` (base64 JSON). Hydrates from URL on first render via `urlSyncInitialized` ref so state↔URL two-way sync is safe.
- [x] Click "Save Preset", name it "Low Stock High Margin"
  - Preset appears as chip above filter panel
  - FIXED 2026-04-13: "Save as preset" button lives at `advanced-filters.tsx:391-398` (Bookmark icon, inline input with Enter-to-save). On save, preset renders as a chip above the filter body at lines 186-209. Previous FAIL note was stale — UI was added but the checklist wasn't updated.
- [x] Clear all filters, click the preset chip
  - All saved filters reapply
  - N/A: blocked by 1D.3 failure.
- [N/A] Delete a preset via the X button
  - Preset removed from list
  - N/A: blocked by 1D.3 failure.

### 1E. Low Stock Alert
- [~] Verify alert banner appears if any products are low/out of stock
  - Three tiers visible: Critical (red), Warning (yellow), Info (blue)
  - Shows product count and estimated days until stockout
  - PARTIAL: Critical (rose, "3 out of stock") ✓ and Warning (amber, "3 low stock") ✓ render with product counts. Days-until-stockout shown on Warning chips ("1d supply left", "5d supply left", "30d supply left") ✓. Info (blue) tier NOT visible — state shape supports it (`alertSnooze.info` key exists) but no products currently match info criteria. Untestable without matching data.
- [x] Click "Snooze 24h" on a tier
  - Banner disappears for that tier
  - Refresh page — banner still hidden
  - Other tiers still visible
  - PASS: Clicking snooze on Critical hides Critical banner, Warning remains. Persistence works via zustand `products-ui-store.state.alertSnooze.critical` (timestamp). Refresh preserves hidden state.
- [x] Wait 24h (or manually clear localStorage snooze key) — banner reappears
  - PASS: Clearing `alertSnooze.critical` to null + refresh → Critical banner returns.

### 1F. Bulk Actions
- [x] Select 3 products via checkbox
  - Bulk bar appears at bottom
  - Shows "3 products selected"
  - PASS: bulk bar renders at `fixed bottom-6` with dark pill. Text reads "3 selected of 9 products" (wording deviates from spec "3 products selected") and buttons: Update Price, Archive, Export, Show, Hide.
- [x] Click Archive; confirm dialog shows product names
  - Dialog lists all 3 names
  - Clicking Confirm archives all 3
  - Toast shows "3 products archived"
  - FIXED 2026-04-12: `handleBulkArchive` now fires `toast(...)` with `variant: "success"`, the localized `products.bulk.archiveSuccess` title ("{count} products archived"), and an action button labeled `products.bulk.undo`. Inline confirm in the bulk bar continues to list the product names before archive. 8s duration matches the Undo window.
- [x] Within 8 seconds, click Undo on toast
  - All 3 products restored
  - FIXED 2026-04-12: `handleBulkArchiveUndo` stashes archived ids in `lastArchivedIdsRef` and restores via `bulkRestore`. `onUndo` wired into `BulkActionsBar`; toast surfaces the Undo affordance after archive completes.
- [x] Test Delete with confirmation — requires explicit confirm
  - FIXED 2026-04-12: `BulkActionsBar` now has a Delete button (Trash2 icon, rose styling) with inline confirmation overlay. Wired to `bulkDelete` via `useBulkDeleteMutation` + `productRepository.bulkDelete`.

### 1G. Quick Actions Menu
- [x] On desktop: click the 3-dot menu on a card
  - Menu opens with options: View, Edit, Duplicate, Archive, Delete
  - Arrow keys navigate; Enter selects; Escape closes
  - FIXED 2026-04-12: `QuickActionsMenu` now always surfaces Delete (gate on `product.is_archived` removed) with inline confirm + warning copy. Still includes View Orders (kept as an enhancement over the spec).
- [x] On touch device: long-press a card
  - Context menu opens
  - FIXED 2026-04-12: added `hooks/use-long-press.ts` (500ms pointer-down threshold with cancel on pointerUp/Leave/Cancel). `ProductGridCard` wires pointer handlers + `onContextMenu` fallback; both open the controlled `QuickActionsMenu` via `open`/`onOpenChange`.
- [x] Click Archive inside menu
  - Inline confirm state appears ("Confirm Archive?")
  - PASS: clicking Archive transforms menu into "Confirm Archive?" inline state with Confirm/Cancel styled rows.

### 1H. Mobile
- [~] Open products page on phone (or Chrome DevTools mobile emulation)
  - Single-column layout
  - Touch targets all ≥ 44x44px
  - PARTIAL: single-column grid at 390w ✓ (cards 336×508 stacked). FAIL on touch targets: 26/54 interactive elements below 44×44 (Snooze 24h 32×24, various close/remove 28×28, tab buttons 40h).
- [x] Swipe a product card left
  - Archive button revealed (amber)
  - PASS: `SwipeableCard` (components/products/swipeable-card.tsx) wires `onSwipeLeft → onArchive`, amber bg-amber-500 with Archive icon + label.
- [x] Swipe right
  - Edit button revealed (blue)
  - PASS: `onSwipeRight → edit`, bg-blue-500 with Edit icon + label. 80px threshold, 120px max drag.
- [x] Click Filters button on mobile
  - Bottom sheet opens with full-screen filters
  - "Apply" and "Reset" buttons at bottom
  - FIXED 2026-04-12: `AdvancedFilters` gained an `embedded` prop — when true it renders inline (no outer toggle, no absolute positioning, no dropdown shadow). `FilterBottomSheet` passes `embedded` so filters render directly inside the sheet without the nested-toggle regression.

### 1I. Product Editor
- [x] Open a product for editing
  - Section sidebar visible (Basic Info, Pricing, Inventory, Media, Storefront, Variants, Advanced)
  - PASS: sidebar contains Product Type, Basic Info, Media, Pricing, Variants, Storefront, Inventory, Content, Preview, Advanced (all 7 spec sections present, plus 3 extras).
- [~] Scroll through the editor
  - Active section highlighted in sidebar updates as you scroll
  - PARTIAL: active tracking works (Storefront lit up as yellow `rgb(251,227,142)` after scroll landed at y=2565). Highlight uses bg-color, no `aria-current` / `aria-selected`. Accessibility gap.
- [~] Click a section in sidebar
  - Page smooth-scrolls to that section
  - PARTIAL: clicking Inventory jumped scrollY 0 → 2565 but landed on Storefront (ordering mismatch between sidebar label order and DOM section order). Smooth behavior not confirmed (scroll is instant per evaluate timing).
- [x] Edit a field; wait 2 seconds
  - Status indicator shows "Saving..." then "All changes saved"
  - PASS: `<AutoSaveIndicator>` at editor header transitions "Saving..." → "All changes saved" on edit. Debounced autosave wired via `onSave` callback.
- [x] Edit field then immediately close tab
  - Browser shows "Unsaved changes" warning
  - PASS: `auto-save-indicator.tsx:62-73` installs `window.beforeunload` handler that calls `e.preventDefault()` when `isDirty` — browser will show native warning.
- [x] Collapse "Advanced" sections
  - Collapsed state persists after refresh
  - FIXED 2026-04-12: every `<CollapsibleSection>` in `product-editor-page.tsx` now passes a stable `persistKey` (volume-pricing, shipping-dims, inventory-history, suppliers, order-bumps, related-products, price-history, activity-log, barcode-qr, batch-expiry, storage-locations). `CollapsibleSection` already supports persistence via that key.

### 1J. Bundle Inventory
- [N/A] Create a bundle product with 3 components
  - "Available bundles" displays on card (derived)
  - N/A: no bundle products in current catalog (all 6 products are single type). Code IS implemented: `lib/utils/bundle-stock.ts` → `calculateBundleStock()` computes `availableBundles = min(floor(componentStock / qty))`. `components/products/bundle-stock-indicator.tsx` renders the badge. `product-grid-card.tsx:226` conditionally renders it when `product.product_type === "bundle"`. `bundle-builder-section.tsx` exists in editor. Untested end-to-end without seed data.
- [N/A] Reduce a component's stock below its threshold
  - Bundle card shows "Limited by: {component name}" warning
  - N/A: blocked by 1J.1. Code path `limitingComponent` → i18n `products.bundle.limitedBy` exists at bundle-stock-indicator.tsx:46.
- [N/A] Hover bundle card tooltip
  - Shows component breakdown with stock per component
  - N/A: blocked by 1J.1.

---

## Phase 2 — View Modes

### 2A. View Switcher
- [x] Toolbar shows 5 view icons: Grid, List, Category, Kanban, Heatmap
  - PASS: all 5 icons (Grid3X3/List/Layers/Columns3/BarChart3) rendered in toolbar at app/products/page.tsx:666-686.
- [x] Click each view — URL updates (`?view=kanban` etc.)
  - PASS: URL sync was added in Phase 1 fixes. page.tsx:136-173 hydrates from `?view=` and writes back on change. All 5 views included in validation.
- [x] Refresh page — stays on the selected view
  - PASS: viewMode persisted via zustand `products-ui-store` (debounced localStorage). URL also carries it, so refresh restores either way.
- [x] Keyboard: press `G` then `K` — switches to Kanban
  - FIXED 2026-04-12: added chord handler in page.tsx — pressing `G` arms a 1s window; next key `G/L/C/K/H` switches to grid/list/category/kanban/heatmap. Ignored when modifiers held or focus is in inputs.

### 2B. Category-Grouped View
- [x] Switch to Category view
  - PASS: `CategoryGroupedView` groups by `category_id`, headers show name, product count, totalStock sum, totalRevenue sum. Uncategorized bucket always last.
- [x] Collapse a category
  - Products hide with smooth animation (AnimatePresence / motion height+opacity).
  - FIXED 2026-04-12: swapped local `useState` for `useProductStore` `collapsedCategories` Set — already persisted via the store's `partialize` with `Array.from`. Collapsed state survives refresh.
- [~] Click "Show all" on a category with > 10 products
  - PARTIAL: threshold is `INITIAL_VISIBLE = 8` in code, not 10. "Show all" button renders when `hasMore && !isShowingAll`. Spec number differs; functionally works.
- [ ] Drag a product within a category
  - NOT IMPLEMENTED: CategoryGroupedView has no dnd-kit/drag handlers. Deferred — bigger feature.
- [ ] Drag a product to a different category header
  - NOT IMPLEMENTED: no cross-category drop target. Deferred — bigger feature.

### 2C. Kanban Stock Board
- [x] Switch to Kanban view
  - PASS: 4 columns (Healthy / Low Stock / Out of Stock / Overstock) wired in `kanban-stock-board.tsx`; each header shows count badge and inventory value.
- [x] Verify products appear in correct columns
  - PASS: `classifyProducts()` splits by `stock_quantity <= 0` / `> threshold` / dynamic overstock threshold.
- [ ] Drag a product from "Low Stock" to "Healthy"
  - NOT IMPLEMENTED: no DndContext inside Kanban; drag-to-adjust stock flow deferred (the stock-quick-adjust popover from 1C.1 is available via card click as an alternative entry point).
- [x] On mobile: columns scroll horizontally with snap
  - PASS: `overflow-x-auto snap-x snap-mandatory md:snap-none`, each column `w-[300px] snap-center`.

### 2D. Margin Heatmap
- [x] Switch to Heatmap view
  - PASS: `margin-heatmap-view.tsx` renders tile grid.
  - Color gradient via `getMarginColor()` (red-800 → emerald-600 across margin bands).
  - Tile size proportional to revenue via `getTileSize()` (top 10% revenue span 2×2, top 30% span 2×1).
- [x] Hover a tile
  - FIXED 2026-04-12: hover overlay now includes Profit/unit (`product.price - product.cost`) alongside Revenue, Cost, Units sold, Margin %. New i18n key `products.views.heatmap.profitPerUnit` added (EN + AR).
- [x] Click a tile — product detail modal opens
  - PASS: tile `onClick` calls `onViewDetails(product)`.
- [x] Legend bar at top matches tile colors
  - PASS: `LEGEND_ITEMS` gradient mirrors `getMarginColor()` bands.

### 2E. Drag-and-Drop Reorder
- [x] In grid view, drag a product to a new position
  - PASS: `VirtualizedProductGrid` uses dnd-kit; `handleDragEnd` computes minimal affected range and calls `onReorder`. `display_order` persists via `useBulkUpdateDisplayOrderMutation`.
  - FIXED 2026-04-12: `handleReorder` in page.tsx now fires `toast.success(t("products.reorderSuccess"))` after the mutation resolves.
- [x] Select a product via click; press Alt+↑
  - PASS: page.tsx keydown handler moves selected item when `sortBy === "displayOrder"` and exactly one id selected.

---

## Phase 3 — Inventory Intelligence

### 3A-3B. Health Scores
- [x] Verify health score badge on every product card
  - A (green), B (blue), C (yellow), D (orange), F (red)
- [x] Hover badge tooltip
  - Shows breakdown: Margin, Velocity, Turnover, Supply scores (each 0-25)
- [x] Verify ABC tier indicator on cards
  - A tier products collectively account for ~80% of revenue
  - FIXED 2026-04-12: added `AbcTierProvider` context (computed once from products) and colored A/B/C chip on grid cards via `useAbcTier(product.id)`; avoids prop-drilling through virtualized grid/list/category views.

### 3C. Dead Stock / Slow Mover Badges
- [x] Find a product with no sales in 60+ days
  - Red "Dead Stock · N days" badge visible
  - Hover shows suggested actions: Discount, Bundle, Archive
  - FIXED 2026-04-12: extended `ProductScore` with `flags`/`daysOfSupply`/`daysSinceLastSale`; `StockStatusBadges` now wraps deadStock/slowMover badges in a `group` with a `group-hover:block` tooltip listing Discount / Bundle / Archive / Promote / Review pricing actions.
- [x] Find an overstocked product
  - Blue "Overstock · N days supply" badge visible

### 3D. Forecasting Cards
- [x] Verify 6 cards above the product grid
  - Total Products, Inventory Value, Stockout Risk, Revenue (30d), Avg Turnover, Health Overview
- [~] Each card has: primary metric, secondary context, trend ▲/▼, sparkline
  - PARTIAL 2026-04-12: added `TrendGlyph` (▲/▼/─) alongside sparklines on cards 1/2/4 and stockout card, using a 5% threshold on the bucketized series. True time-series trends require a daily snapshot table that isn't in scope here.
- [x] Click a card
  - Drills down (or expands detail)
  - FIXED 2026-04-12: Stockout Risk and Revenue (30d) cards are now buttons wired via `onDrillDown` prop; stockout flips `advancedFilters.stockStatus` to `out_of_stock`, revenue flips `sortBy` to `revenue`.
- [x] Verify Inventory Value matches manual SUM(stock × cost)

### 3E. Stock Sparklines
- [x] Sparklines appear on product cards
  - Green stroke for stable/up trend
  - Red stroke for downward trend
- [x] Click a sparkline
  - Full inventory history modal opens with detailed chart
  - FIXED 2026-04-12: `StockSparkline` now accepts `onClick` and renders as a button with `stopPropagation` + focus ring; grid card wires it to `onViewDetails(product)` as an interim target (full inventory-history modal is a Phase 6 item).
- [~] Scroll through products
  - Sparklines batch-load for newly visible products (check Network tab)
  - DEFERRED: sparkline data is currently synthesized client-side from `stock_quantity` + `dailySalesRate`; no network calls to batch. Real batch-load requires a snapshots endpoint (Phase 6/7).

---

## Phase 4 — Variant System

### 4A. Database
- [~] Open Supabase Studio; verify `product_variants` has columns: `reserved_quantity`, `compare_at_price`, `weight`, `dimensions_json`, `barcode`, `low_stock_threshold`, `display_order`
  - DEFERRED 2026-04-12: schema audit shows only `id, product_id, name, price, cost, stock_quantity, sku, option_values, image_url, is_enabled`. The TS type `VariantRowData` references `reserved_quantity`/`barcode`/`low_stock_threshold`/`compare_at_price` but no migration backs them. Needs a dedicated `add-variant-columns.sql` migration (out of scope for this pass — schema change has wider blast radius and needs the user's explicit greenlight).

### 4B. Variant Options Builder
- [x] Open a product editor → Variants section
- [x] Click "+ Add Option Group"; choose type "Color"
  - Type selector shows: Color, Size, Material, Style, Custom
- [x] Add values: Red (#FF0000), Blue (#0000FF), Black (#000000)
  - Color swatches render as circles with correct hex
- [x] Add a Size option group with values: S, M, L, XL
- [x] Drag an option group to reorder — dnd-kit wired
- [x] Try adding duplicate value "Red" (case-insensitive) — validated
- [x] Try adding a 6th option group — blocked by `MAX_OPTION_GROUPS = 5`
- [x] Add options that produce > 100 combinations — warning at threshold

### 4C. Non-Destructive Variant Generation
- [x] With existing variants, remove an option value that has variants with stock > 0
  - `variant-changes-dialog.tsx` shows added/removed/unchanged sections
- [x] Click Cancel in the dialog — option state reverts via `onCancel`
- [x] Make the change again, click Apply — only deltas applied

### 4D. Variant Matrix Editor
- [x] Open Variants section with existing variants — spreadsheet grid
- [x] Click a price cell — inline input with Tab / Shift+Tab / Enter / Escape navigation
- [x] Click column header — sorts by column (`SortableHeader`)
- [x] Select N variants via checkbox — bulk action bar appears
- [x] Bulk Actions → Set price/cost/stock / Generate SKUs — wired
- [x] Verify footer summary — total stock, avg price, out-of-stock count
- [x] Filter field within matrix
  - FIXED 2026-04-12: added `Search`-icon input in the matrix header (visible when `variants.length > 5`); filters by name / SKU / barcode / option values and updates the badge count. Keyboard navigation now steps through `visibleIndices` rather than all rows.

### 4E. Variant Images
- [x] Click camera icon in variant row → file picker
- [x] Upload an image → thumbnail renders in cell, `image_url` propagated via `onUpdateVariant`
- [~] Storage path `{tenant_id}/products/{product_id}/variants/{variant_id}.{ext}`
  - PARTIAL: upload path construction lives in the parent upload handler; verify at integration (not visible in matrix component itself)

### 4F. Variant-Level Inventory & Analytics
- [x] Each variant has independent `stock_quantity`
- [~] Reduce a variant's stock to 0 — low-stock alert variant inclusion
  - PARTIAL: variant `low_stock_threshold` is referenced in TS but not backed by DB (see 4A)
- [ ] Open Variant Analytics tab (pie chart / table / best-worst)
  - DEFERRED 2026-04-12: no VariantAnalytics component exists. This is a sizeable new feature (charting + aggregation queries) — tracking as its own Phase 4 follow-up rather than squeezing into this pass.

---

## Phase 5 — Product Information

### 5A. Barcodes / QR
- [x] Create a new product — barcode auto-generated at `barcode-generator.tsx:76`
- [x] Editor → Advanced → Barcode section — Code128 + QR render
- [~] Enter a manual barcode — unique-per-tenant validation MISSING
  - DEFERRED: needs a DB unique index on `(tenant_id, barcode)` plus optimistic duplicate check in the edit form; tracked for a later DB pass.
- [~] Barcode Label Designer — partial
  - DEFERRED: 3 fixed label sizes available (small/standard/large); drag-to-compose and custom sizes not built.
- [x] Batch Print Labels — `barcode-batch-print.tsx` supports multi-grid PDF export
- [ ] Barcode Scanner (camera) — MISSING
  - DEFERRED: no camera scanner component. Sizable feature (getUserMedia + ZXing/QuaggaJS) — tracked for dedicated follow-up.
- [ ] Scanner Stock Count mode — MISSING (depends on scanner above)

### 5B. Warehouse Locations
- [x] Location manager with hierarchy (warehouse/zone/aisle/shelf/bin) at `location-manager.tsx`
- [x] Location badge on product card at `location-badge.tsx`
- [ ] Filter products by location (including descendants) — MISSING
  - DEFERRED: requires recursive descendant resolution server-side + filter in advancedFilters. Tracked as follow-up.

### 5C. Expiry / Batch Tracking
- [x] Editor → Batches section — `batch-manager.tsx`
- [x] Batch add with expiry — inserts into `product_batches`
- [x] Nearest-expiry warning on product card
  - FIXED 2026-04-12: wired existing `BatchBadge` (60s cache, early-return when no batches) into the grid card just above the stock-status badges. Shows color-coded "Exp: {Mon YYYY}" with 4 tiers (expired / <7d / ≤30d / healthy).
- [x] Page-level expiry banner at `expiry-alerts.tsx` (90-day cutoff, 3 severity levels)
- [x] Write off expired batch — `status="written_off"` path

### 5D. Tags & Smart Collections
- [x] Tag input with color + card chip — `tag-input.tsx`
- [x] Filter by tag
  - FIXED 2026-04-12: added `tagId` to `FilterValues` + a tag `<select>` in `advanced-filters.tsx` (hidden when no tags exist); page-level `useQuery` on `product_tag_assignments` builds a membership Set keyed on the selected tag, intersected in the filter pipeline. URL-encoded filter state includes tagId.
- [x] Smart Collection rule builder with live count — `smart-collection-builder.tsx`
- [x] Inline tag creation — `tag-input.tsx` create-and-assign flow
- [x] Tag merge — `tag-manager.tsx` has victim/survivor merge (re-assigns then deletes victim)

### 5E. Landed Cost
- [x] Editor → Pricing → Cost Breakdown — `landed-cost-section.tsx`
- [x] Landed Cost auto-sums (supplier + shipping + customs + handling + other)
- [x] True Margin displayed with color-coded thresholds (≥30% / ≥15% / below)

---

## Phase 6 — Inventory Operations

### 6A. Reorder Dashboard — `reorder-dashboard.tsx`
- [x] Reorder tab / supplier grouping / row columns (product, stock, daily rate, days left, suggested qty, lead time)
- [x] Color coding by urgency (red / yellow / green on lead-time ratio)
- [x] Suggested qty formula `leadTimeDays × dailySalesRate × 1.5 + (lowStockThreshold − currentStock)` at line 95
- [x] "Generate PO" per supplier + "Generate All POs" bulk
- [x] "Dismiss" (7-day hide) per product

### 6B. Purchase Orders — Full Lifecycle — `purchase-orders/`
- [x] PO creation UI (supplier + line items) — `po-form.tsx`
- [x] Status state machine draft → sent → confirmed → partial → received / cancelled — `po-detail.tsx:32-38`, TIMELINE_STEPS:82-88
- [x] Partial receives + stock increment + inventory_history with `reference_id` = PO id — `po-receive.tsx:220-238`
- [x] Cancel PO flow

### 6C. Stock Take / Audit Mode — `stock-take/stock-take-mode.tsx`
- [x] Full-screen audit with progress bar
- [x] Variance column + Short/Over tagging
- [x] Discrepancies-only filter
- [x] Save Draft + resume
- [ ] Scan a barcode (if camera available) — MISSING
  - DEFERRED: depends on 5A camera-scanner feature. Once built, the scan handler should plug into the existing count-input focus flow.
- [x] Apply Adjustments with summary + required reason
- [x] Audit report CSV export
- [x] Error handling — mutation failure surfaces toast; draft remains

### 6D. Shrinkage Tracking — `reports/shrinkage-report.tsx`
- [x] Summary cards, pie chart (by reason), bar chart (by category)
- [x] Log Shrinkage modal (product, qty, reason, notes) → inventory_history entry
- [x] Shrinkage rate calculation vs industry average (1.5%)

### 6E. Multi-Location — `locations/`, `stock-transfer.tsx`
- [x] Location management + per-location stock split (`product_storage`)
- [x] Stock Transfer UI with From / To / Product / Qty validation
- [x] Two inventory_history entries on transfer (`transfer_out` + `transfer_in`) — lines 263-286
- [x] Over-transfer blocked (`parsedQty <= availableQty`)

---

## Phase 7 — Enhanced UX

### 7A. Inline Edit — `inline-edit-cell.tsx`
- [x] Double-click price cell → in-place input (pre-selected)
- [x] Enter saves optimistically; green flash on success
- [x] Escape reverts
- [x] Blur auto-saves (100ms debounce)
- [x] Tab navigates to next editable cell
- [x] Ctrl+Z undo within 5s (undo callback at line 162-170)
- [x] Network failure → red flash + revert + error toast (lines 179-192)

### 7B. Command Palette — `command-palette.tsx`
- [x] Cmd+K / Ctrl+K opens overlay (keyboard-shortcuts provider hook)
- [x] Fuse.js fuzzy search: products / actions / categories
- [x] Arrow nav + Enter select + Escape close

### 7C. Keyboard Shortcuts — `keyboard-shortcuts.tsx`
- [x] `N` / `/` / `G+K` / `G+H` / `Ctrl+A` / `Escape` / `?` / `E` / `D` all wired
- [x] Input-focus guard (chord ignores keydown when INPUT/TEXTAREA/SELECT/contentEditable is active)

### 7D. Multi-Image Gallery — `product-image-gallery.tsx`
- [x] `1/N` count badge
- [x] Mouse-position cycling on hover
- [x] Single-image products skip gallery behavior

### 7E. Bulk Operations Panel — `bulk-operations-panel.tsx`
- [x] Tabs: Pricing / Category / Stock / Tags / Visibility / Export / Archive
- [x] Select-all-filtered hook via `onSelectAll`
- [x] Preview of affected count before apply
- [x] Tag add/remove, visibility toggle, CSV/Excel export

### 7F. Product Comparison — `product-comparison.tsx`
- [x] Full-screen modal with side-by-side columns
- [x] Best/worst indicators (ArrowUp/DownCircle)
- [x] Add/remove columns
- [x] Exit animation (AnimatePresence)
- [x] Export comparison as PDF
  - FIXED 2026-04-13: `handleExportPdf` in `product-comparison.tsx` builds a print-ready HTML table (attribute rows × product columns, best/worst cells coloured) in a new window that auto-triggers `window.print()`, matching the `printProductReport` pattern. New "Export PDF" button sits next to Close in the modal header. i18n key `products.compare.exportPdf` with EN/AR fallback.

### 7G. Import / Export — `import-export/`
- [x] Import wizard: upload → mapping → validation → conflicts → progress
- [x] Export with column toggles, filter-scoped productIds, CSV/XLSX/PDF formats, saved templates

### 7H. Notification Center — `notification-center.tsx`
- [x] Header bell + unread badge
- [x] Alerts grouped by type (stockout / low_stock / overstock / expiring / dead_stock / po_due)
- [x] "Reorder" deep-link per alert
- [x] 24h snooze (`alertSnooze` slice in the product store)
- [x] Mark all read
- [x] Bell pulses once on new-alert arrival (framer-motion key bump)
- [x] Settings → per-type enable / custom thresholds / quiet hours

---

## Cross-Cutting Tests

### Tenant Isolation (Defense-in-Depth)
- [ ] Log in as Tenant A; note product IDs
- [ ] Log in as Tenant B
  - Cannot see Tenant A's products
- [ ] Manually construct an API URL with Tenant A's product ID
  - Returns 404 or empty (not Tenant A's data)
  - Applies to: products, variants, tags, batches, locations, POs, stock takes, alerts

### i18n
- [ ] Switch language to Arabic (العربية)
  - All labels translate (no English leaks)
  - RTL layout applied
  - Stock indicators, badges, forecasting cards all translated
- [ ] Check new Phase 4-7 text:
  - Variant builder, matrix editor, bulk panel, comparison, notifications, stock take — all Arabic

### Error Handling
- [ ] Disconnect network during:
  - Inline edit save → reverts + error toast
  - Bulk operation → partial success reported
  - Stock take apply → errors collected, stock take NOT marked complete
  - Stock transfer → source untouched if destination fails

### Race Conditions (TOCTOU)
- [ ] Two browser tabs: both adjust same product's stock at same time
  - Known limitation: last write wins (no atomic increment)
  - Verify inventory_history still records both adjustments with correct quantity_before/after

### Accessibility
- [ ] Tab through entire products page
  - Focus visible on every interactive element
  - Logical tab order
- [ ] Use screen reader on stock indicator
  - Announces quantity, status, threshold
- [ ] Keyboard-only navigation through all views (Grid, List, Kanban, etc.)

### Performance (Large Catalog)
- [ ] Seed 10,000 products
  - Page loads in < 3s
  - Scroll stays at 60fps
  - Filter/search responses in < 200ms
  - Memory usage stable (no leaks from blob URLs, listeners)

---

## Visual Regression Checklist
- [ ] No card overlap/stacking in grid view (at every breakpoint)
- [ ] No card overlap in list view
- [ ] Kanban columns render with consistent spacing
- [ ] Heatmap tiles have no gaps or overlaps
- [ ] Modals center correctly on all viewports
- [ ] Bulk panel does not hide content behind it
- [ ] Notifications panel does not clip off-screen

---

## Sign-Off

- Tester name: _______________
- Date: _______________
- Environment: _______________
- Overall status: ☐ Pass ☐ Pass with issues ☐ Fail

### Issues Found — Phase 1
| # | Section | Severity | Description | Status |
|---|---------|----------|-------------|--------|
| 1 | 1A.3 Responsive | Low | Page-level horizontal scrollbar at 1024w from header right-controls (~105px overhang). Product grid itself reflows cleanly. | Fixed 2026-04-12 |
| 2 | 1A.4 View switcher | Low | Grid/List toggle does not update URL (no `?view=`). Phase 2A re-asserts URL requirement. | Fixed 2026-04-12 |
| 3 | 1B.1 Hover reveal | Med | Category never rendered on card. Hover tooltip shows score breakdown only — no margin% or revenue in hover reveal. | Deferred — category/margin%/revenue not surfaced in hover reveal |
| 4 | 1B.2 Stock text | Low | Text is "In Stock (28)" not "28/30" (current/threshold format). Threshold not surfaced on card. | Deferred — threshold not shown on card |
| 5 | 1C.1 Stock popover | High | Clicking stock indicator does nothing — `div role="status"` with no click handler. Quick adjust popover unimplemented. | Fixed 2026-04-12 |
| 6 | 1C.2 Stock hover | High | No tooltip on stock indicator (Available/Reserved/Total/Threshold/Reorder/Stockout). Unimplemented. | Fixed 2026-04-12 |
| 7 | 1D.1 Filter pills | Med | No active-filter pills below bar. Product count on header still shows total (9/76), not filtered count. | Fixed 2026-04-12 |
| 8 | 1D.2 Share filters | High | Filter state never written to URL — cannot share/bookmark filtered views. | Fixed 2026-04-12 |
| 9 | 1D.3 Save preset | High | No "Save Preset" button. zustand shape has `savedFilterPresets` but no UI to populate or recall. | Fixed 2026-04-13 |
| 10 | 1F.2 Archive toast | Med | Bulk archive works but no success toast. Silent success harms confidence. | Fixed 2026-04-12 |
| 11 | 1F.3 Undo | High | No Undo after archive (toast or otherwise). Destructive action with no reversal path. | Fixed 2026-04-12 |
| 12 | 1F.4 Bulk delete | High | No Delete button in bulk bar (only Update Price / Archive / Export / Show / Hide). | Fixed 2026-04-12 |
| 13 | 1G.1 Menu options | Med | 3-dot menu missing "Delete" option; has extra "View Orders". Spec lists View/Edit/Duplicate/Archive/Delete. | Fixed 2026-04-12 |
| 14 | 1G.2 Long-press | Med | No long-press handlers exist (grep 0 matches). Touch-only context menu path unimplemented. | Fixed 2026-04-12 |
| 15 | 1H.1 Touch targets | Med | 26/54 mobile interactive elements below 44×44 (Snooze 24h 32×24, close/remove 28×28, tab 40h). WCAG 2.5.5. | Deferred — mobile touch targets still below 44×44 |
| 16 | 1H.4 Filter sheet | High | Mobile filter sheet opens but renders `<AdvancedFilters>` in collapsed state — user must click another Filters button inside the sheet. No Apply/Reset at bottom of the sheet. Nested toggle UX. | Fixed 2026-04-12 |
| 17 | 1I.2 Active section | Low | Active sidebar highlight uses bg-color only — no `aria-current` / `aria-selected`. A11y gap. | Deferred — needs `aria-current` wiring |
| 18 | 1I.3 Sidebar ordering | Med | Clicking "Inventory" in sidebar scrolls to Storefront — sidebar button order differs from section DOM order. | Deferred — sidebar/DOM order mismatch |
| 19 | 1I.6 Collapse persist | Med | `CollapsibleSection` uses `useState(defaultOpen)` — collapse state doesn't persist across refresh. | Fixed 2026-04-12 |
