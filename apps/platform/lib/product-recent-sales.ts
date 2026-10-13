import { z } from "zod";

/** Window the new-order product picker ranks "top sellers" over. */
export const RECENT_SALES_WINDOW_DAYS = 30;

/**
 * Orders that never became a sale: abandoned checkouts and cancelled/rejected
 * orders. They are excluded so the ranking reflects what customers actually took.
 */
export const NON_SALE_STATUSES = ["pending_checkout", "cancelled", "rejected"] as const;

/** One line of `orders.items` (jsonb) — only the fields the fold reads. */
const orderLineSchema = z.object({
    product_id: z.string().nullish(),
    sku: z.string().nullish(),
    name: z.string().nullish(),
    quantity: z.coerce.number().nullish(),
});

export type RecentSaleLine = z.infer<typeof orderLineSchema>;

/** Parse the `items` column of each order row, dropping anything malformed. */
export function linesFromOrderItems(rows: Array<{ items: unknown }>): RecentSaleLine[] {
    const lines: RecentSaleLine[] = [];
    for (const row of rows) {
        if (!Array.isArray(row.items)) continue;
        for (const raw of row.items) {
            const parsed = orderLineSchema.safeParse(raw);
            if (parsed.success) lines.push(parsed.data);
        }
    }
    return lines;
}

const key = (value: string | null | undefined) => (value ?? "").trim().toLowerCase();

/**
 * Units sold per product id. A line is attributed by product_id when it names a
 * catalogue product, else by SKU, else by name (the same fallbacks get_product_sales
 * uses for lines that predate product_id).
 */
export function foldUnitsSold(
    lines: RecentSaleLine[],
    products: Array<{ id: string; sku?: string | null; name: string }>,
): Map<string, number> {
    const ids = new Set(products.map((p) => p.id));
    const bySku = new Map<string, string>();
    const byName = new Map<string, string>();
    for (const p of products) {
        if (key(p.sku)) bySku.set(key(p.sku), p.id);
        byName.set(key(p.name), p.id);
    }

    const units = new Map<string, number>();
    for (const line of lines) {
        const qty = line.quantity && line.quantity > 0 ? line.quantity : 0;
        if (!qty) continue;
        const id =
            (line.product_id && ids.has(line.product_id) ? line.product_id : undefined) ??
            (key(line.sku) ? bySku.get(key(line.sku)) : undefined) ??
            byName.get(key(line.name));
        if (id) units.set(id, (units.get(id) ?? 0) + qty);
    }
    return units;
}

/**
 * Recent top sellers first (most units desc), then everything else in its original
 * order. Stable: ties and unsold products keep the order they came in.
 */
export function sortByRecentSales<T extends { id: string }>(products: T[], units: Map<string, number>): T[] {
    return products
        .map((product, index) => ({ product, index, sold: units.get(product.id) ?? 0 }))
        .sort((a, b) => b.sold - a.sold || a.index - b.index)
        .map(({ product }) => product);
}
