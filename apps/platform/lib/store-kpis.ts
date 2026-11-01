import { isSaleOrder } from "@/lib/order-revenue";
import type { Order } from "@/types/order";

export type KpiOrderRow = Pick<Order, "status" | "is_return" | "price">;

/** Orders sold and their value: refused, cancelled, abandoned and return rows are not sales. */
export function summarizeSales(rows: readonly KpiOrderRow[]): { orderCount: number; revenue: number } {
    const sales = rows.filter(isSaleOrder);
    return {
        orderCount: sales.length,
        revenue: sales.reduce((sum, o) => sum + (o.price ?? 0), 0),
    };
}
