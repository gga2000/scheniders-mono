/**
 * Parse the employee's reply to the product picker and resolve it to one of the
 * catalog products.
 *
 * Accepted syntax (case-insensitive, trims whitespace):
 *   "3"             → product at index 3, quantity 1
 *   "3 x 2"         → product 3, quantity 2 ("x", "*", or "X")
 *   "3*2", "3 2"    → same
 *   "ويفر"          → fuzzy match by name, quantity 1
 *   "ويفر x 2"      → fuzzy match by name, quantity 2
 */

export interface CatalogProduct {
    id: string;
    name: string;
    price: number;
}

export interface ProductMatch {
    product: CatalogProduct;
    quantity: number;
}

const QTY_SPLIT = /[\s xX*×]+/;

function parseQuantity(raw: string | undefined): number {
    if (!raw) return 1;
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 1) return 1;
    return Math.min(n, 99); // sanity cap
}

/**
 * Crude fuzzy match: case-insensitive substring; if multiple match, prefer
 * the one whose name starts with the query, then the shortest name.
 */
function fuzzyByName(query: string, products: CatalogProduct[]): CatalogProduct | null {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    const candidates = products.filter((p) => p.name.toLowerCase().includes(q));
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => {
        const aStarts = a.name.toLowerCase().startsWith(q) ? 0 : 1;
        const bStarts = b.name.toLowerCase().startsWith(q) ? 0 : 1;
        if (aStarts !== bStarts) return aStarts - bStarts;
        return a.name.length - b.name.length;
    });
    return candidates[0];
}

export function matchProductReply(
    reply: string,
    products: CatalogProduct[]
): ProductMatch | null {
    const text = reply.trim();
    if (!text) return null;

    const parts = text.split(QTY_SPLIT).filter(Boolean);
    const head = parts[0];
    const qty = parseQuantity(parts[1]);

    // Numeric form: head is a 1-based index into products
    const asNumber = parseInt(head, 10);
    if (Number.isFinite(asNumber) && String(asNumber) === head) {
        const idx = asNumber - 1;
        if (idx >= 0 && idx < products.length) {
            return { product: products[idx], quantity: qty };
        }
        return null;
    }

    // Otherwise: fuzzy match by name. Use the full text minus any trailing
    // "x N" so multi-word product names still match.
    const nameQuery = parts.length > 1 && /^\d+$/.test(parts[parts.length - 1])
        ? parts.slice(0, -1).join(" ")
        : text;
    const product = fuzzyByName(nameQuery, products);
    if (!product) return null;
    return { product, quantity: qty };
}
