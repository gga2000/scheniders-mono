/**
 * Guards for actions that mean "act on everything matching my filter".
 *
 * Shipping with nothing selected, and "Select all N orders", both currently
 * assume the loaded list IS every order matching the filter. That holds only
 * while the page fetches the whole book. Once PERF-1 windows the fetch, those
 * actions would quietly operate on whichever subset happened to load — handing
 * a courier the wrong orders, or selecting fewer than the button advertises.
 */

/**
 * Whether "ship everything visible" is a truthful offer.
 *
 * With an explicit selection the merchant has named the orders, so it is always
 * allowed. Without one, it is only allowed when the loaded list is the complete
 * filtered set.
 */
export function canShipWithoutSelection(args: {
    selectedCount: number;
    ordersAreComplete: boolean;
}): boolean {
    if (args.selectedCount > 0) return true;
    return args.ordersAreComplete;
}

/**
 * Whether to offer "Select all N orders". Hidden when the loaded list is only a
 * window, because N would describe the window rather than the filter.
 */
export function canOfferSelectAll(args: {
    selectedCount: number;
    loadedCount: number;
    pageSelectLimit: number;
    ordersAreComplete: boolean;
}): boolean {
    return (
        args.ordersAreComplete &&
        args.selectedCount < args.loadedCount &&
        args.loadedCount > args.pageSelectLimit
    );
}
