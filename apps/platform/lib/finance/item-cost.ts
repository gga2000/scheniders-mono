import type { OrderItem } from "@/types/order";
import type { Product } from "@/types/product";

export type CostLine = Pick<OrderItem, "name" | "sku" | "product_id" | "variant_id" | "quantity">;

export interface ItemCost {
    /** Total cost of the line in IQD; 0 when no cost is on file. */
    cost: number;
    /** False when no product or variant cost was found, so `cost` is a floor, not a value. */
    known: boolean;
}

const UNKNOWN: ItemCost = { cost: 0, known: false };

/**
 * The cost of one order line.
 *
 * Matches by id first (variant, then product), because a renamed product or a
 * duplicate name matches the wrong row. SKU and name are the fallback for old
 * lines written before items carried ids. A cost of 0 or none counts as
 * unknown so reports can say profit is overstated instead of silently
 * treating the item as free.
 */
export function resolveItemCost(item: CostLine, products: readonly Product[]): ItemCost {
    const qty = item.quantity || 0;
    const product =
        (item.product_id && products.find((p) => p.id === item.product_id)) ||
        (item.variant_id && products.find((p) => p.variants?.some((v) => v.id === item.variant_id))) ||
        (item.sku && products.find((p) => p.sku?.toLowerCase() === item.sku?.toLowerCase())) ||
        (item.name && products.find((p) => p.name.toLowerCase() === item.name?.toLowerCase())) ||
        undefined;
    if (!product) return UNKNOWN;

    const variant = item.variant_id ? product.variants?.find((v) => v.id === item.variant_id) : undefined;
    const unit = variant?.cost || product.cost;
    return unit ? { cost: unit * qty, known: true } : UNKNOWN;
}

/**
 * Unit cost of each line of every delivered order, frozen when the order was
 * delivered (order id -> one entry per `items` line, null = no cost was on file).
 */
export type CostSnapshots = ReadonlyMap<string, readonly (number | null)[]>;

/**
 * The cost of line `index` of `order`.
 *
 * The frozen unit cost wins, so a later edit of a product's cost never
 * re-prices an order that is already delivered. A line with no snapshot (an
 * order without one, or a line that had no cost on file then) falls back to the
 * cost on file now.
 */
export function resolveOrderLineCost(
    order: { id: string },
    index: number,
    item: CostLine,
    products: readonly Product[],
    snapshots?: CostSnapshots,
): ItemCost {
    const frozen = snapshots?.get(order.id)?.[index];
    if (typeof frozen === "number" && frozen > 0) return { cost: frozen * (item.quantity || 0), known: true };
    return resolveItemCost(item, products);
}
