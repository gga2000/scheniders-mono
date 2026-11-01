import type { PrintBatch } from "@/lib/supabase";

/** Pure batch maths for the Reports page; the hook only fetches. */

export interface BatchMetrics {
    id: string;
    name: string;
    createdAt: Date;
    orderCount: number;
    totalValue: number;
    cities: string[];
    /** delivered / (delivered + rejected), the same rule as every other Reports rate. */
    deliveryRate: number;
    rejectionRate: number;
    delivered: number;
    rejected: number;
    avgDeliveryTime: number; // hours
    status: "pending" | "in_progress" | "completed" | "mixed";
}

export interface BatchAnalyticsSummary {
    totalBatches: number;
    totalOrders: number;
    totalValue: number;
    avgOrdersPerBatch: number;
    avgBatchValue: number;
    /** Pooled over every outcome in the period, so a 2-order batch does not weigh like a 200-order one. */
    avgDeliveryRate: number;
    topCities: { city: string; count: number }[];
    batchesByDay: { date: string; count: number; value: number }[];
}

/**
 * `statuses` holds only live orders (deleted ones and abandoned carts are not fetched), so an id
 * missing from it is left out of the batch's counts instead of reading as an unfinished order.
 */
export function calculateBatchMetrics(
    batches: PrintBatch[],
    statuses: ReadonlyMap<string, string>
): BatchMetrics[] {
    return batches.map(batch => {
        const liveIds = (batch.order_ids || []).filter(id => statuses.has(id));
        let delivered = 0;
        let rejected = 0;
        for (const id of liveIds) {
            const status = statuses.get(id);
            if (status === "delivered" || status === "completed") delivered++;
            if (status === "rejected") rejected++;
        }
        const decided = delivered + rejected;
        const total = liveIds.length;

        let status: BatchMetrics["status"] = "pending";
        if (delivered === total && total > 0) status = "completed";
        else if (delivered > 0 && rejected > 0) status = "mixed";
        else if (delivered > 0 || rejected > 0) status = "in_progress";

        return {
            id: batch.id,
            name: batch.name,
            createdAt: new Date(batch.created_at),
            orderCount: batch.order_count,
            totalValue: batch.total_value || 0,
            cities: batch.cities || [],
            deliveryRate: decided > 0 ? (delivered / decided) * 100 : 0,
            rejectionRate: decided > 0 ? (rejected / decided) * 100 : 0,
            delivered,
            rejected,
            avgDeliveryTime: 0,
            status,
        };
    });
}

export function summarizeBatches(batches: BatchMetrics[]): BatchAnalyticsSummary {
    const totalBatches = batches.length;
    const totalOrders = batches.reduce((sum, b) => sum + b.orderCount, 0);
    const totalValue = batches.reduce((sum, b) => sum + b.totalValue, 0);
    const delivered = batches.reduce((sum, b) => sum + b.delivered, 0);
    const rejected = batches.reduce((sum, b) => sum + b.rejected, 0);

    const cityCount: Record<string, number> = {};
    batches.forEach(b => {
        b.cities.forEach(city => {
            cityCount[city] = (cityCount[city] || 0) + b.orderCount / b.cities.length;
        });
    });
    const topCities = Object.entries(cityCount)
        .map(([city, count]) => ({ city, count: Math.round(count) }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

    const byDay: Record<string, { count: number; value: number }> = {};
    batches.forEach(b => {
        const day = b.createdAt.toISOString().split("T")[0];
        if (!byDay[day]) byDay[day] = { count: 0, value: 0 };
        byDay[day].count++;
        byDay[day].value += b.totalValue;
    });
    const batchesByDay = Object.entries(byDay)
        .map(([date, data]) => ({ date, ...data }))
        .sort((a, b) => a.date.localeCompare(b.date));

    return {
        totalBatches,
        totalOrders,
        totalValue,
        avgOrdersPerBatch: totalBatches > 0 ? totalOrders / totalBatches : 0,
        avgBatchValue: totalBatches > 0 ? totalValue / totalBatches : 0,
        avgDeliveryRate: delivered + rejected > 0 ? (delivered / (delivered + rejected)) * 100 : 0,
        topCities,
        batchesByDay,
    };
}
