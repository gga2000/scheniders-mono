/**
 * Filler products are catalogue depth — orderable by customers, but not held
 * in main stock. Both operator-facing lists (the products page and the order
 * product picker) keep them out of the way by default so staff reach real
 * stock first.
 *
 * The rule lives here rather than inline in either list because the two must
 * agree, and because the search case is the part that is easy to get wrong:
 * hiding a product whose name the user has just typed makes the list look
 * broken and sends them hunting for something that is right there.
 */

export interface FillerFilterState {
  /** The operator has expanded the filler group. */
  showFiller: boolean;
  /** A search is currently narrowing the list. */
  searching: boolean;
}

/** Whether filler rows belong in the list right now. */
export function fillerIsVisible({ showFiller, searching }: FillerFilterState): boolean {
  return showFiller || searching;
}

/**
 * Drop filler products unless they should be on show. Products that are not
 * filler always pass through untouched.
 */
export function applyFillerVisibility<T extends { is_filler?: boolean | null }>(
  products: readonly T[],
  state: FillerFilterState,
): T[] {
  if (fillerIsVisible(state)) return [...products];
  return products.filter((p) => !p.is_filler);
}

/** How many filler products the group would hold — archived and supplies never count. */
export function countFiller<T extends {
  is_filler?: boolean | null;
  is_supply?: boolean | null;
  is_archived?: boolean | null;
}>(products: readonly T[]): number {
  return products.reduce(
    (n, p) => (p.is_filler && !p.is_supply && !p.is_archived ? n + 1 : n),
    0,
  );
}
