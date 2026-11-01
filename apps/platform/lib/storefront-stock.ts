/**
 * products.storefront_stock — the count the public store shows and sells
 * against; null means the store shows real stock minus reserved. Read by
 * apps/storefront/lib/storefront-stock.ts.
 */

/** The editor's text input as the column value: empty → null (follow real stock), never negative. */
export function parseStorefrontStock(raw: string): number | null {
    const trimmed = raw.trim();
    if (trimmed === "") return null;
    const n = Number.parseInt(trimmed, 10);
    if (Number.isNaN(n)) return null;
    return Math.max(0, n);
}
