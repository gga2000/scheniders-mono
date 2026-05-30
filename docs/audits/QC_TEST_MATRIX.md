# QC Quarantine — Senior Engineer Test Matrix

**Scope:** Every interactive surface, state, guardrail, animation, and a11y contract in [apps/platform/components/products/qc-quarantine-tab.tsx](apps/platform/components/products/qc-quarantine-tab.tsx) and the 19 files in [apps/platform/components/products/qc/](apps/platform/components/products/qc/).

**Route under test:** `http://localhost:3000/products?tab=quarantine`

**Legend:** ✅ pass · ❌ fail · ⚠️ partial / needs manual follow-up · ⏭️ skipped (blocked by data / environment)

---

## A. Shell, mount, and baseline

| # | Case | Expectation | Result |
|---|------|-------------|--------|
| A1 | Navigate to `/products?tab=quarantine` | Quarantine tab mounts, no unhandled JS errors in console | |
| A2 | `document.documentElement.dir` | Must equal `"ltr"` (LTR-only app) | |
| A3 | Initial sub-tab | Defaults to Pending | |
| A4 | Initial view mode | Defaults to Table | |
| A5 | KPI header visible above filter bar | 6 stat cards render in a grid | |
| A6 | Insights banner renders only when insights exist | Banner hidden if no recurring/trend/overdue insights | |
| A7 | Console has zero uncaught exceptions on mount | No `Error:` messages at error level | |
| A8 | No RTL resubscribe error from `use-inventory-qc.ts` | Prior "cannot add postgres_changes after subscribe" must not reappear | |

## B. KPI Header ([qc-kpi-header.tsx](apps/platform/components/products/qc/qc-kpi-header.tsx))

| # | Case | Expectation | Result |
|---|------|-------------|--------|
| B1 | Pending card value | Equals count of `pending_inspection + in_inspection` items | |
| B2 | Value at Risk card | Equals Σ `(product.cost × quantity)` for pending items | |
| B3 | Write-off Rate card | % of last-30d resolved items with status `written_off` | |
| B4 | Avg Resolution card | Hours from `created_at` → `resolved_at` averaged over last 30d | |
| B5 | Overdue card | Count of items >7d old still pending/in_inspection | |
| B6 | Top Reason card | Most common `reason_category` in last 7d | |
| B7 | Each card shows 7-day sparkline SVG | `<svg>` children on each card | |
| B8 | Hover animates `y: -2` | Card lifts via framer-motion | |
| B9 | Tap animates `scale: 0.98` | Card briefly shrinks | |
| B10 | Click behavior | Documented as clickable; verify no navigation occurs unless wired | |

## C. Sub-Tabs ([qc-sub-tabs.tsx](apps/platform/components/products/qc/qc-sub-tabs.tsx))

| # | Case | Expectation | Result |
|---|------|-------------|--------|
| C1 | 4 tabs render: Pending / In Inspection / Resolved / Analytics | All labels i18n-translated | |
| C2 | Active tab has animated pill background | `layoutId="qc-tab-active"` shared transition | |
| C3 | Pending tab shows count badge | Matches `pending + in_inspection` | |
| C4 | In Inspection tab count | Matches `in_inspection` only | |
| C5 | Resolved tab count | Matches `restocked + written_off + returned_to_supplier` | |
| C6 | Analytics tab has no count | Only label | |
| C7 | Switching to Analytics hides filter bar | Filter bar not visible | |
| C8 | Switching to Analytics hides bulk bar | Bulk bar not visible even with selected ids | |
| C9 | Tab switch clears selection | Selected items reset on change | |
| C10 | Tab switch resets focus cursor | `focusedIndex` → null | |

## D. Filter Bar ([qc-filter-bar.tsx](apps/platform/components/products/qc/qc-filter-bar.tsx))

| # | Case | Expectation | Result |
|---|------|-------------|--------|
| D1 | Search input visible with placeholder | i18n `qc.filter.searchPlaceholder` | |
| D2 | Typing filters by product name | List narrows to matches | |
| D3 | Typing filters by SKU | List narrows to matches | |
| D4 | Typing filters by reason text | List narrows to matches | |
| D5 | Typing filters by order_id | Matches within joined order | |
| D6 | Typing filters by rma_number | Matches returns with RMA | |
| D7 | Search clear X button | Resets search string | |
| D8 | Search input has `data-qc-search="true"` | Used by `/` shortcut to focus | |
| D9 | Advanced filters toggle | Panel collapses/expands (AnimatePresence) | |
| D10 | Reason chip multi-select | Clicking each chip toggles; multiple allowed | |
| D11 | Age bucket single-select | Only one of all/fresh/aging/stale/critical active | |
| D12 | Photos filter single-select | one of all/yes/no | |
| D13 | Value min/max inputs | Accept number; null allowed | |
| D14 | Active filter count badge | Shows count 1–4 when filters set | |
| D15 | Clear All button | Resets to `DEFAULT_QC_FILTERS` | |
| D16 | View switcher 3-way | Table / Cards / Kanban active state | |
| D17 | Filtered-count vs total-count display | Shows "Showing X of Y" or equivalent | |

## E. Table View ([qc-table-view.tsx](apps/platform/components/products/qc/qc-table-view.tsx))

| # | Case | Expectation | Result |
|---|------|-------------|--------|
| E1 | Header columns render via i18n | Product/Reason/Qty/Value/Age/Status/Order/Entered/Actions | |
| E2 | Header checkbox | Toggles select-all for filtered rows | |
| E3 | Header checkbox indeterminate | When some (not all) are selected | |
| E4 | Row checkbox toggles selection | Click doesn't propagate to row | |
| E5 | Row click opens detail drawer | `onOpenDetail(item)` | |
| E6 | Aging chip renders per row | Correct color for bucket (0-2d emerald, 3-6d amber, 7-13d orange, 14+d rose) | |
| E7 | Value column shows `cost × quantity` | Right-aligned number | |
| E8 | Quick resolve buttons visible on pending | Restock / Write-off / Return | |
| E9 | Quick resolve buttons hidden on resolved tab | `showResolutionActions=false` | |
| E10 | Focused row shows amber ring | `focusedId === item.id` | |
| E11 | Row stagger animation | opacity/y delay `min(idx*0.02, 0.3)` | |

## F. Card Grid ([qc-card-grid.tsx](apps/platform/components/products/qc/qc-card-grid.tsx))

| # | Case | Expectation | Result |
|---|------|-------------|--------|
| F1 | Cards render in responsive grid | `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` | |
| F2 | Card image renders (or fallback) | From `item.product.image_url` | |
| F3 | Image has `draggable={false}` | Prevents native drag | |
| F4 | Selection checkbox top-left | Toggle without opening drawer | |
| F5 | Aging chip top-right | Compact variant | |
| F6 | Desktop hover shows action buttons | Restock / Write-off / Return fade in | |
| F7 | Desktop hover disabled on mobile | `md:flex` on quick-actions | |
| F8 | Card click opens detail drawer | | |
| F9 | Focused card shows amber ring | | |
| F10 | Mobile swipe right → reveal restock | Emerald reveal grows with x | |
| F11 | Mobile swipe left → reveal write-off | Rose reveal grows with -x | |
| F12 | Swipe threshold triggers action | `max(cardWidth * 0.40, 80)` or velocity > 500px/s | |
| F13 | Swipe below threshold snaps back | `dragSnapToOrigin` | |
| F14 | `whileHover` disabled on mobile | Only desktop `y:-3` | |

## G. Kanban View ([qc-kanban-view.tsx](apps/platform/components/products/qc/qc-kanban-view.tsx))

| # | Case | Expectation | Result |
|---|------|-------------|--------|
| G1 | Columns render for each status | pending, in_inspection, restocked, written_off, returned | |
| G2 | Column header shows count | Matches items per status | |
| G3 | Cards draggable via HTML5 DnD | `draggable=true`, sets `text/plain` | |
| G4 | Drop on another column | Calls `onMoveStatus(item, toStatus)` | |
| G5 | Column drag-over visual | Dashed border, amber bg | |
| G6 | Card click opens drawer | | |
| G7 | Shared layout reorder | `layout` prop on card | |
| G8 | Focused card ring | | |
| G9 | Empty column shows placeholder | `qc.kanban.noItems` | |

## H. Bulk Bar ([qc-bulk-bar.tsx](apps/platform/components/products/qc/qc-bulk-bar.tsx))

| # | Case | Expectation | Result |
|---|------|-------------|--------|
| H1 | Bar appears when selection > 0 | Bottom-centered, spring-in | |
| H2 | Count badge shows `selectedIds.length` | Amber pill | |
| H3 | First click on Restock shows confirmation | "Restock X items?" + Proceed/Cancel | |
| H4 | First click on Write-off shows confirmation | | |
| H5 | First click on Return shows confirmation | | |
| H6 | Cancel returns to default state | | |
| H7 | Proceed triggers bulk mutation | Loader spins on that action | |
| H8 | Success toast appears with `{count}` | e.g. "3 items restocked" | |
| H9 | Undo button appears in toast | Labeled `qc.bulk.undo` | |
| H10 | Clicking Undo within 5s restores | `bulkRevert` called, items flip back | |
| H11 | Undo after 5s is no-op | Token expired, silent | |
| H12 | Multiple sequential actions keep tokens separate | Each toast's Undo is scoped | |
| H13 | Export button downloads CSV | `qc-export-{timestamp}.csv`, success toast | |
| H14 | Print Labels opens popup | Thermal-sized 58×40mm | |
| H15 | Popup blocked shows error toast | `qc.toast.popupBlocked` | |
| H16 | X clears selection | Bar fades out | |
| H17 | Analytics tab hides bulk bar | Even with selection | |

## I. Detail Drawer ([qc-detail-drawer.tsx](apps/platform/components/products/qc/qc-detail-drawer.tsx))

| # | Case | Expectation | Result |
|---|------|-------------|--------|
| I1 | Drawer slides in from right | Spring animation | |
| I2 | Backdrop click closes | | |
| I3 | Close X closes | Has aria-label | |
| I4 | Escape key closes | | |
| I5 | Status badge renders | Correct color/label | |
| I6 | Product hero shows image / SKU / cost / margin | | |
| I7 | "Start Inspection" button visible only when pending_inspection | Transitions to in_inspection on click | |
| I8 | Reason category picker 6 chips | Selecting updates `reason_category` | |
| I9 | Reason success toast | `qc.detail.reasonUpdated` | |
| I10 | Checklist tasks render per category | Correct count (5 for most, 2–3 for other) | |
| I11 | Checklist state is local-only | Does not persist across reopen | |
| I12 | Notes textarea | Editable, shows saved value | |
| I13 | Save Notes disabled when unchanged | Enables on dirty | |
| I14 | Save Notes triggers success toast | `qc.detail.notesSaved` | |
| I15 | RMA + Credit fields visible in return section | | |
| I16 | Attempting Return without RMA shows warning | `qc.detail.rmaRequired` | |
| I17 | Valid Return flow | Success toast + drawer closes | |
| I18 | Activity log renders events | status_changed / created | |
| I19 | Activity entries show icon + timestamp | | |
| I20 | Footer Resolve buttons hidden for resolved items | | |

## J. Photo Uploader ([qc-photo-uploader.tsx](apps/platform/components/products/qc/qc-photo-uploader.tsx))

| # | Case | Expectation | Result |
|---|------|-------------|--------|
| J1 | Drop zone renders inside drawer | Dashed border | |
| J2 | Click drop zone opens file dialog | | |
| J3 | Drag-over highlights zone | `dragging` state | |
| J4 | Dropping files triggers upload | Spinner, then toast | |
| J5 | Upload toast plural/singular | `qc.photo.uploaded` vs `uploadedSingle` | |
| J6 | Gallery grid shows thumbnails | 3×N layout | |
| J7 | Thumbnail click opens lightbox | | |
| J8 | Lightbox prev/next arrows | | |
| J9 | Lightbox click closes | | |
| J10 | Lightbox Delete removes photo | `qc.photo.removed` toast | |
| J11 | Remove failure toast | `qc.photo.removeFailed` | |
| J12 | Upload failure toast | `qc.photo.uploadFailed` | |

## K. Keyboard Shortcuts ([qc-keyboard-shortcuts.tsx](apps/platform/components/products/qc/qc-keyboard-shortcuts.tsx))

| # | Case | Expectation | Result |
|---|------|-------------|--------|
| K1 | `/` focuses search input | Even when not focused | |
| K2 | `?` (or Shift+/) opens shortcuts help | | |
| K3 | Pressing `?` again closes help | | |
| K4 | Escape closes help | | |
| K5 | `J` moves focus down | First press → index 0 | |
| K6 | `ArrowDown` equivalent to J | | |
| K7 | `K` moves focus up | | |
| K8 | `ArrowUp` equivalent to K | | |
| K9 | Focus index clamps at 0 and length-1 | | |
| K10 | `X` toggles select of focused item | | |
| K11 | `Esc` clears selection | Only when selection > 0 | |
| K12 | `R` bulk restocks selected | Only when selection > 0 | |
| K13 | `W` bulk writes off selected | | |
| K14 | `E` bulk return — opens drawer if RMA needed | Doesn't silently bulk-resolve | |
| K15 | Shortcut ignored in text inputs | typing `R` in search doesn't restock | |
| K16 | Shortcut ignored in textareas | e.g. Notes field | |
| K17 | Shortcuts disabled when drawer open | No keydown reacts | |
| K18 | Shortcuts disabled on Analytics tab | | |
| K19 | Shortcuts disabled when help open | | |
| K20 | Ctrl/Meta/Alt combos ignored | e.g. Cmd+R reloads normally | |

## L. Shortcuts Help ([qc-shortcuts-help.tsx](apps/platform/components/products/qc/qc-shortcuts-help.tsx))

| # | Case | Expectation | Result |
|---|------|-------------|--------|
| L1 | Modal has `role="dialog"` + `aria-modal="true"` | | |
| L2 | Modal has `aria-labelledby="qc-shortcuts-title"` | | |
| L3 | 4 sections render: Navigation / Selection / Actions / General | | |
| L4 | Each row shows `<kbd>` chip + description | | |
| L5 | Backdrop click closes | | |
| L6 | Z-index above drawer (60/61) | | |

## M. Analytics Tab ([qc-analytics-tab.tsx](apps/platform/components/products/qc/qc-analytics-tab.tsx))

| # | Case | Expectation | Result |
|---|------|-------------|--------|
| M1 | Intake line/area chart renders | 14/30/90d | |
| M2 | Resolution donut (restock/writeoff/return) | Color-coded legend | |
| M3 | Top quarantined products bar chart | Horizontal bars | |
| M4 | Top reasons bar chart | | |
| M5 | Resolution time histogram | Buckets: <4h, 4–12h, 12–24h, 1–3d, 3–7d, >7d | |
| M6 | Inspector leaderboard table | Count + avg time per user | |
| M7 | Write-off $ MoM card | | |
| M8 | Charts load without Recharts errors | Console clean | |

## N. Insights Banner ([qc-insights-banner.tsx](apps/platform/components/products/qc/qc-insights-banner.tsx))

| # | Case | Expectation | Result |
|---|------|-------------|--------|
| N1 | Max 3 cards visible | | |
| N2 | Recurring product card when SKU has ≥3 hits in 14d | Flame icon | |
| N3 | Intake trend card when MoM ≥30% | TrendingUp icon | |
| N4 | Overdue card when items >7d exist | AlertTriangle icon | |
| N5 | Dismiss X hides card | Doesn't reappear within session | |
| N6 | Drill-down arrow routes to product filter | When productId provided | |
| N7 | Banner hidden when no insights | No empty container | |

## O. Empty & Error States

| # | Case | Expectation | Result |
|---|------|-------------|--------|
| O1 | All-clear state when pending = 0 | Sparkle animation, success tone | |
| O2 | No-matches state when filters exclude all | "Clear filters" CTA works | |
| O3 | No-resolved state on resolved tab with 0 items | | |
| O4 | Error state on fetch failure | Retry button calls `refetch()` | |
| O5 | Skeleton loaders replace spinner during initial fetch | KPI + view-specific skeleton | |

## P. Realtime + Data Integrity ([use-inventory-qc.ts](apps/platform/hooks/use-inventory-qc.ts))

| # | Case | Expectation | Result |
|---|------|-------------|--------|
| P1 | Channel subscribes without console errors | No "cannot add postgres_changes after subscribe" | |
| P2 | Unique channel name per effect run | Contains timestamp + random suffix | |
| P3 | Cleanup on unmount | `removeChannel` called | |
| P4 | INSERT from another session | Toast fires, list invalidates | |
| P5 | INSERT known ID (dedup) | No toast | |
| P6 | UPDATE silent reconciliation | No toast, list refreshes | |
| P7 | DELETE silent reconciliation | No toast, list refreshes | |
| P8 | Resolve mutation updates `products.stock_quantity` | Integration behavior | |
| P9 | Bulk revert restores stock for write_off/return | | |

## Q. i18n

| # | Case | Expectation | Result |
|---|------|-------------|--------|
| Q1 | EN strings render in English | Header, tabs, filters, toasts | |
| Q2 | Switching language updates `<html lang>` only | `dir` stays `ltr` | |
| Q3 | AR strings render in Arabic | All QC namespaces translated | |
| Q4 | Interpolation `{count}` works in bulk toasts | | |
| Q5 | No raw i18n keys visible (e.g. `qc.bulk.undo`) | | |

## R. Responsive / Mobile

| # | Case | Expectation | Result |
|---|------|-------------|--------|
| R1 | 375×812 (iPhone) — card grid default | Single column | |
| R2 | Swipe-right on card restocks | Emerald reveal + resolve | |
| R3 | Swipe-left on card writes off | Rose reveal + resolve | |
| R4 | Bulk bar repositions on mobile | Doesn't clip viewport | |
| R5 | KPI cards wrap gracefully | No overflow | |
| R6 | Drawer goes fullscreen on mobile | Or adapts width | |

## S. A11y

| # | Case | Expectation | Result |
|---|------|-------------|--------|
| S1 | All buttons reachable by Tab | | |
| S2 | Focus visible on kbd nav | Amber ring | |
| S3 | Color contrast AA on status dots | | |
| S4 | Modal focus trap in shortcuts help | | |
| S5 | Screen-reader labels on icon-only buttons | `aria-label` present | |

---

# Playwright Execution Log

Executed 2026-04-14 on `localhost:3000/products?tab=quarantine` at 1512×810 (desktop) and 375×812 (mobile). QC fixtures: 18 quarantined items across فيوجن / فيوجن 2 / ايدنتتي (IQD 351,450 at risk).

## Pass / Fail Summary

| Area | Result | Notes |
|---|---|---|
| Shell, mount, KPI header render | PASS | 6 cards, sparkline, top-reason chip all present |
| Sub-tabs (Pending / In Insp / Resolved / Analytics) | PASS | Counts decrement/increment after resolve; Analytics charts render |
| View switcher (Table / Cards / Kanban) | PASS | Layout swaps; state preserves across switches |
| Filter bar + pills + clear | PASS | Reason / age / value filters all reduce row count; pills dismiss individually |
| Table quick actions — Restock | PASS | Row removed, Pending 18→17, Resolved 12→13, Value IQD 351,450→340,800 (−10,650 ✓) |
| Table quick actions — Write off | PASS | Row removed, Pending 17→16, Resolved 13→14, Value −31,950 ✓, Write-off rate 38%→43% |
| Table quick actions — Return to supplier | PASS (opens drawer) | RTS opens detail drawer rather than resolving directly — correct, needs RMA# |
| Detail drawer — open via row click | PASS | Hero, recurring banner, reason chips, photo uploader, checklist, notes, audit log |
| Detail drawer — close via backdrop | PASS | Backdrop click dismisses |
| Detail drawer — Escape to close | **FAIL** | Pressing Esc does not close drawer (a11y convention violated) |
| Detail drawer — checklist toggle | PASS | Click flips chip to emerald-checked state |
| Detail drawer — notes textarea | PASS | Accepts input, value persists during drawer session |
| Detail drawer — reason chip change | **FAIL** | Click does not visibly update selected chip (mutation may run but UI snaps back — stale `item` prop in parent) |
| Detail drawer — Start inspection | PASS | Moves item from Pending → In Inspection (tab 4→5) |
| Bulk bar — appears on selection | PASS | "N selected" with Restock / Write off / Return / Export / Labels |
| Bulk bar — Restock with confirm | PASS | Inline "Confirm restock of 3 items? Yes, proceed / Cancel" prompt; confirm removed 3 rows, Pending 16→13, Resolved 14→17 |
| Bulk bar — undo toast | **FAIL** | No undo toast appears after bulk resolve (plan requires Undo surface) |
| Keyboard — `j` / `k` row navigation | PASS | Amber ring moves down / up |
| Keyboard — `x` toggle select | PASS | Bulk bar updates to "1 selected" |
| Keyboard — `/` focus search | PASS | Focuses the QC search input |
| Keyboard — `?` shortcuts help | PARTIAL | Button works; `?` key suppressed because search input was focused (working as designed, but no keybind alternative) |
| Insights banner — dismiss X | PASS | Overdue SLA banner removed on click |
| Insights banner — drill-down chevron | **UX ISSUE** | Dumps raw product UUID (`c092ad91-…`) into search input; filters correctly but reads as cryptic string instead of product name |
| i18n EN ↔ AR toggle | PASS | All labels switch; layout stays LTR per user requirement |
| RTL — `<html dir>` stays `ltr` | PASS | Verified after i18n revert; memory saved |
| Mobile viewport 375×812 — card grid | PASS | Cards stack, KPIs 2-col, filters collapse |
| Mobile — drawer fullscreen | PASS | Takes full width under 768px |
| Realtime subscription (Supabase) | PASS | No "cannot add postgres_changes after subscribe" error after channel-name uniqueness fix |

## Findings (bug/UX tickets)

1. **[BUG — a11y]** Escape key does not close the detail drawer. Expected: Esc closes. Fix: add `onKeyDown` handler or Radix Dialog wrapper in [qc-detail-drawer.tsx](apps/platform/components/products/qc/qc-detail-drawer.tsx).
2. **[BUG — state sync]** Reason-category chip click in drawer does not visibly update selected chip. `handleReasonChange` at [qc-detail-drawer.tsx:137](apps/platform/components/products/qc/qc-detail-drawer.tsx#L137) calls `updateReasonCategory` correctly, but drawer derives `reasonCat` from `item?.reason_category` which does not refresh until parent re-renders with new item prop. Add local optimistic state or subscribe to the mutated item.
3. **[REGRESSION — missing feature]** Plan specifies "Toasts for every action with undo where reversible" and `bulkRevertMutation` exists in [use-inventory-qc.ts:280](apps/platform/hooks/use-inventory-qc.ts#L280), but no undo toast is surfaced after bulk restock/write-off. Wire the bulkRevert call into a Sonner action toast.
4. **[UX]** Insights drill-down writes raw product UUID into the search input. Should either (a) filter via a product-id filter chip showing the product name, or (b) write the product's display name, not the UUID.
5. **[UX — guardrail missing]** Plan calls for "require photo or note for write-offs above a $ threshold." A IQD 31,950 write-off (well above typical threshold) resolved silently with no confirmation. Add threshold gate before firing `resolveQuarantine(written_off)`.
6. **[UX]** Keyboard `?` shortcut is suppressed whenever a text input is focused (by design in `isTypingTarget`). This means after using `/` to focus search, the only way to open help is to click the `?` button. Consider allowing `Shift+?` outside text inputs, or adding a second keybinding like `h`.
7. **[DATA]** Search box matches raw `reason` free-text field, not localized category labels. Typing "Damaged" returns 0 results even though the "Damaged" chip filter works. Suggest: search also scans reason_category label.

## Known-working coverage

Shell, KPI header, sub-tabs, view switcher, filter bar + pills, table quick actions (Restock/Write-off), drawer open/close (backdrop), checklist toggle, notes input, Start inspection, bulk bar selection + confirm + resolve, keyboard j/k/x and `/`, insights dismiss, i18n toggle, LTR enforcement, mobile responsive layout, Supabase realtime channel.
