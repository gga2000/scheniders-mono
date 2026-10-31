import type { Order, OrderItem } from "@/types/order";

/**
 * Profit for a period, on the Products page's "sold = delivered" rule: a sale
 * counts on the day it was delivered (delivered_at, else completed_at, else
 * created_at for old rows), a refund on the day the money went back. Used by
 * Claude's profit_report, so its numbers follow one written-down definition.
 *
 *   revenue        order price of delivered / completed sales (items after
 *                  the order discount; delivery fees excluded, the courier
 *                  keeps those). Per-product revenue is the line total, before
 *                  an order-level discount, so products can add up to more.
 *   refunds        money paid back on refund rows (abs(price))
 *   product cost   units sold × the variant's cost, else the product's cost
 *   gross profit   revenue − product cost
 *   net profit     gross profit − refunds − expenses
 *
 * Returned goods that went back into stock are not added back, so a period
 * with many restocked refunds reads slightly low.
 */

export type ProfitOrder = Pick<Order, "status" | "is_return" | "price" | "items">;

export type CostedProduct = { id: string; name: string; sku: string | null; cost: number | null };
export type CostedVariant = { id: string; product_id: string; cost: number | null };
export type ProfitExpense = { category: string; amount: number };

export type ProductProfit = {
    key: string;
    name: string;
    units: number;
    revenue: number;
    /** Null when no cost is set, so the profit is unknown rather than the revenue. */
    profit: number | null;
};

export type ProfitSummary = {
    orders: number;
    units: number;
    revenue: number;
    refunds: number;
    refundCount: number;
    productCost: number;
    grossProfit: number;
    expenses: number;
    expensesByCategory: Array<{ category: string; amount: number }>;
    netProfit: number;
    /** Net profit as a share of revenue, in percent; null with no revenue. */
    marginPct: number | null;
    /** Sold products with no cost set: their units count as free in productCost. */
    missingCost: Array<{ name: string; units: number }>;
    products: ProductProfit[];
};

const SOLD = new Set<Order["status"]>(["delivered", "completed"]);

const isRefund = (o: ProfitOrder) => Boolean(o.is_return) || o.status === "refund_delivered";

function lineQty(item: OrderItem): number {
    return Math.max(0, Math.round(Number(item.quantity) || 0));
}

export function summarizeProfit(
    orders: readonly ProfitOrder[],
    products: readonly CostedProduct[],
    variants: readonly CostedVariant[],
    expenses: readonly ProfitExpense[],
): ProfitSummary {
    const byId = new Map(products.map((p) => [p.id, p]));
    const bySku = new Map(products.filter((p) => p.sku).map((p) => [(p.sku as string).toLowerCase(), p]));
    const byName = new Map(products.map((p) => [p.name.trim().toLowerCase(), p]));
    const variantCost = new Map(variants.map((v) => [v.id, v.cost]));

    /** Order lines name their product by id; old rows only carry a SKU or a name. */
    const productOf = (item: OrderItem) =>
        (item.product_id ? byId.get(item.product_id) : undefined) ??
        (item.sku ? bySku.get(item.sku.toLowerCase()) : undefined) ??
        (item.name ? byName.get(item.name.trim().toLowerCase()) : undefined);

    const lines = new Map<string, ProductProfit & { costKnown: boolean; cost: number }>();
    let orderCount = 0;
    let units = 0;
    let revenue = 0;
    let refunds = 0;
    let refundCount = 0;

    for (const o of orders) {
        if (isRefund(o)) {
            if (o.status !== "refund_delivered") continue;
            refunds += Math.abs(o.price ?? 0);
            refundCount += 1;
            continue;
        }
        if (!SOLD.has(o.status)) continue;
        orderCount += 1;
        revenue += o.price ?? 0;
        for (const item of o.items ?? []) {
            const qty = lineQty(item);
            if (qty === 0) continue;
            const product = productOf(item);
            const unitCost =
                (item.variant_id ? variantCost.get(item.variant_id) : null) ?? product?.cost ?? null;
            const key = product?.id ?? `name:${(item.name ?? "Unknown").trim().toLowerCase()}`;
            const line = lines.get(key) ?? {
                key,
                name: product?.name ?? item.name ?? "Unknown",
                units: 0,
                revenue: 0,
                profit: null,
                costKnown: true,
                cost: 0,
            };
            const lineRevenue = (Number(item.price) || 0) * qty;
            line.units += qty;
            line.revenue += lineRevenue;
            if (unitCost && unitCost > 0) line.cost += unitCost * qty;
            else line.costKnown = false;
            lines.set(key, line);
            units += qty;
        }
    }

    let productCost = 0;
    const missingCost: ProfitSummary["missingCost"] = [];
    const productRows: ProductProfit[] = [];
    for (const line of lines.values()) {
        productCost += line.cost;
        if (!line.costKnown) missingCost.push({ name: line.name, units: line.units });
        productRows.push({
            key: line.key,
            name: line.name,
            units: line.units,
            revenue: line.revenue,
            profit: line.costKnown ? line.revenue - line.cost : null,
        });
    }

    const categories = new Map<string, number>();
    let expenseTotal = 0;
    for (const e of expenses) {
        const amount = Number(e.amount) || 0;
        expenseTotal += amount;
        categories.set(e.category, (categories.get(e.category) ?? 0) + amount);
    }

    const grossProfit = revenue - productCost;
    const netProfit = grossProfit - refunds - expenseTotal;
    return {
        orders: orderCount,
        units,
        revenue,
        refunds,
        refundCount,
        productCost,
        grossProfit,
        expenses: expenseTotal,
        expensesByCategory: [...categories.entries()]
            .map(([category, amount]) => ({ category, amount }))
            .sort((a, b) => b.amount - a.amount),
        netProfit,
        marginPct: revenue > 0 ? (netProfit / revenue) * 100 : null,
        missingCost: missingCost.sort((a, b) => b.units - a.units),
        products: productRows.sort((a, b) => b.revenue - a.revenue),
    };
}
