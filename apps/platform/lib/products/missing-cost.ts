import type { Product } from "@/types/product";

/** A cost the shop has entered: null, missing and 0 all mean "not entered yet". */
const entered = (cost: number | null | undefined): cost is number => typeof cost === "number" && cost > 0;

/**
 * Whether a product has pieces on the shelf with no cost entered: the products the
 * Finances stock card counts as "without a cost" (finance_summary_core's
 * missing_cost_products). A variant without its own cost uses the product's cost;
 * a product with variants keeps its pieces on the variants. Archived products and
 * products that are not physical are not on the shelf.
 */
export function hasStockWithoutCost(product: Pick<Product, "product_type" | "is_archived" | "cost" | "stock_quantity" | "variants">): boolean {
    if (product.is_archived || product.product_type !== "physical") return false;
    const variants = product.variants ?? [];
    if (variants.length === 0) return (product.stock_quantity ?? 0) > 0 && !entered(product.cost);
    return variants.some((v) => (v.stock_quantity ?? 0) > 0 && !entered(v.cost) && !entered(product.cost));
}
