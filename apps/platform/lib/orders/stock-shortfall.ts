import type { Order } from "@/types/order";
import type { Product } from "@/types/product";

/** One product (or variant) the held confirm needs more of than is free. */
export interface StockShortfall {
    key: string;
    name: string;
    isOpenBox: boolean;
    /** Units the orders being confirmed add. */
    need: number;
    /** Free to sell before this confirm. Below zero is already oversold. */
    left: number;
}

/** What the check reads from an order; a draft in Create order has no id yet. */
export type StockCheckOrder = Pick<Order, "status" | "items"> & { is_return?: boolean | null };

/**
 * Statuses that already hold stock: confirmed reserves, in transit / delivered
 * / completed have left the shelf (inv_phase in the reserve-model migration).
 * Re-confirming one of these takes nothing more.
 */
const HOLDS_STOCK = new Set<Order["status"]>(["confirmed", "in_transit", "delivered", "completed"]);

/**
 * What confirming these orders would take beyond what is free: new stock left
 * is on hand minus confirmed; open-box left is open_box_quantity, which
 * confirmed open-box orders already took. Lines without a product, filler and
 * supply products are skipped: they have no stock to run out of.
 */
export function findStockShortfalls(
    orders: readonly StockCheckOrder[],
    products: readonly Product[],
): StockShortfall[] {
    const byId = new Map(products.map(p => [p.id, p]));
    const need = new Map<string, { name: string; isOpenBox: boolean; qty: number; left: number }>();

    for (const order of orders) {
        if (order.is_return || HOLDS_STOCK.has(order.status)) continue;
        for (const item of order.items ?? []) {
            const product = item.product_id ? byId.get(item.product_id) : undefined;
            if (!product || product.is_filler || product.is_supply) continue;
            const qty = Math.max(0, Math.round(Number(item.quantity) || 0));
            if (qty === 0) continue;
            const variant = item.variant_id ? product.variants?.find(v => v.id === item.variant_id) : undefined;
            if (item.variant_id && !variant) continue;
            const stock = variant ?? product;
            const isOpenBox = !!item.is_open_box;
            const left = isOpenBox
                ? (stock.open_box_quantity ?? 0)
                : (stock.stock_quantity ?? 0) - (stock.reserved_quantity ?? 0);
            const key = `${variant?.id ?? product.id}:${isOpenBox ? "ob" : "new"}`;
            const base = product.short_name?.trim() || product.name;
            const name = variant ? `${base} · ${variant.name}` : base;
            const prev = need.get(key);
            need.set(key, { name, isOpenBox, qty: (prev?.qty ?? 0) + qty, left });
        }
    }

    return [...need.entries()]
        .filter(([, n]) => n.qty > n.left)
        .map(([key, n]) => ({ key, name: n.name, isOpenBox: n.isOpenBox, need: n.qty, left: n.left }));
}
