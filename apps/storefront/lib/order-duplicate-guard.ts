// =====================================================================
// Storefront soft duplicate guard — the TypeScript half
// =====================================================================
// create_storefront_order (migration 20261021142000) returns an existing
// order instead of inserting when this tenant already has a live order from
// the same phone, placed inside the window, that holds every product this
// one pays for. LF baseline: 68 of 129 same-phone repeats within 48h landed
// inside 10 minutes; 34 orders were cancelled as duplicates.
// =====================================================================

/** Minutes after an order during which the same phone ordering the same
 *  products again is answered with that order (spec 2026-10-21 §2). */
export const DUPLICATE_ORDER_WINDOW_MINUTES = 10;

/** True when create_storefront_order answered with an order its duplicate
 *  guard matched — neither a new insert nor an idempotency replay. */
export function isDuplicateGuardRow(row: Record<string, unknown> | null): boolean {
  return row?.duplicate_guard === true;
}
