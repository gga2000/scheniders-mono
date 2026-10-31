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
