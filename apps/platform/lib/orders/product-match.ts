import type { Order } from "@/types/order";

// =============================================
// PRODUCT FILTER
//
// The product chip row and the product filter share this rule, so a chip's
// count is the length of the list it opens. The filter has always been a
// case-insensitive substring match ("X" also opens orders of "X Y"), while the
// tally counted exact names, so overlapping names showed a smaller number than
// the list they opened. The tally now counts with the filter's own rule.
// =============================================

/** True when one of the order's items' names contains `product` (case-insensitive). */
export function orderMatchesProduct(o: Pick<Order, "items">, product: string): boolean {
    const needle = product.toLowerCase();
    return o.items?.some((item) => typeof item.name === "string" && item.name.toLowerCase().includes(needle)) === true;
}

/**
 * The product chips for a view: every distinct item name, with
 * `count === rows.filter(r => orderMatchesProduct(r, name)).length`.
 * Most orders first, then by name.
 */
export function countProductsInView(rows: readonly Pick<Order, "items">[]): { name: string; count: number }[] {
    const names = new Set<string>();
    // Each order once per lowercase name, however many line items carry it.
    const exact = new Map<string, number>();
    const rowNames: Set<string>[] = [];
    for (const row of rows) {
        const lower = new Set<string>();
        for (const item of row.items ?? []) {
            if (typeof item.name !== "string" || item.name === "") continue;
            names.add(item.name);
            lower.add(item.name.toLowerCase());
        }
        for (const n of lower) exact.set(n, (exact.get(n) ?? 0) + 1);
        rowNames.push(lower);
    }

    const distinctLower = [...exact.keys()];
    const result: { name: string; count: number }[] = [];
    for (const name of names) {
        const needle = name.toLowerCase();
        const matching = distinctLower.filter((d) => d.includes(needle));
        let count: number;
        if (matching.length === 1) {
            // Only its own name contains it: the exact tally is the substring count.
            count = exact.get(matching[0]) ?? 0;
        } else {
            // Overlapping names: count each order once if any of its names match.
            const set = new Set(matching);
            count = 0;
            for (const lower of rowNames) {
                for (const n of lower) {
                    if (set.has(n)) { count++; break; }
                }
            }
        }
        result.push({ name, count });
    }

    return result.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
