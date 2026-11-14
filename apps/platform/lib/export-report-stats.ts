import type { Order } from "@/types/order";
import { isRealizedRevenue } from "@/lib/order-revenue";

type StatsOrder = Pick<Order, "status" | "is_return" | "price" | "delivery_fee" | "city" | "governorate_code" | "payment_status"> & {
    is_test?: boolean | null;
};

export interface ExportReportStats {
    total: number;
    byStatus: Record<string, number>;
    /** Money earned: delivered and completed orders only, never returns or tests. */
    totalRevenue: number;
    /** Orders whose price is in totalRevenue. */
    realizedOrders: number;
    /** The delivery fee charged on those same orders. */
    totalDeliveryFees: number;
    delivered: number;
    rejected: number;
    deliveryRate: number;
    rejectionRate: number;
    /** Revenue per earned order. */
    avgOrderValue: number;
    byCity: { city: string; total: number; delivered: number; rejected: number; revenue: number; deliveryRate: number }[];
    byPayment: Record<string, { count: number; revenue: number }>;
}

/**
 * The numbers on the PDF and Excel exports. Both files used to add up the
 * price of every order in the range, so a month with 30 refused and 10
 * cancelled orders out of 100 reported 2.5M revenue for 1.5M earned, and
 * "Net revenue" took the delivery charge off twice when an order carried both
 * delivery_fee and delivery_cost. Revenue now follows lib/order-revenue.ts,
 * the same rule as Finances and the dashboard.
 */
export function exportReportStats(orders: readonly StatsOrder[]): ExportReportStats {
    const byStatus: Record<string, number> = {};
    const byCityMap: Record<string, { total: number; delivered: number; rejected: number; revenue: number }> = {};
    const byPayment: Record<string, { count: number; revenue: number }> = {};
    let totalRevenue = 0;
    let realizedOrders = 0;
    let totalDeliveryFees = 0;

    for (const order of orders) {
        byStatus[order.status] = (byStatus[order.status] || 0) + 1;
        const realized = isRealizedRevenue(order);
        const earned = realized ? Number(order.price) || 0 : 0;
        if (realized) {
            totalRevenue += earned;
            realizedOrders++;
            totalDeliveryFees += Number(order.delivery_fee) || 0;
        }

        const city = order.city || order.governorate_code || "Unknown";
        const c = (byCityMap[city] ??= { total: 0, delivered: 0, rejected: 0, revenue: 0 });
        c.total++;
        c.revenue += earned;
        if (order.status === "delivered" || order.status === "completed") c.delivered++;
        if (order.status === "rejected") c.rejected++;

        const pay = (byPayment[order.payment_status || "pending"] ??= { count: 0, revenue: 0 });
        pay.count++;
        pay.revenue += earned;
    }

    const delivered = (byStatus["delivered"] || 0) + (byStatus["completed"] || 0);
    const rejected = byStatus["rejected"] || 0;
    const shipped = delivered + rejected;
    const byCity = Object.entries(byCityMap)
        .map(([city, data]) => ({
            city,
            ...data,
            deliveryRate: data.delivered + data.rejected > 0 ? (data.delivered / (data.delivered + data.rejected)) * 100 : 0,
        }))
        .sort((a, b) => b.total - a.total);

    return {
        total: orders.length,
        byStatus,
        totalRevenue,
        realizedOrders,
        totalDeliveryFees,
        delivered,
        rejected,
        deliveryRate: shipped > 0 ? (delivered / shipped) * 100 : 0,
        rejectionRate: shipped > 0 ? (rejected / shipped) * 100 : 0,
        avgOrderValue: realizedOrders > 0 ? totalRevenue / realizedOrders : 0,
        byCity,
        byPayment,
    };
}
