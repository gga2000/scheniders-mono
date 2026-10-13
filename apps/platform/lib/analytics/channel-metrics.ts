// =============================================
// AD-CHANNEL PERFORMANCE
//
// `calculateSourcePerformance` groups by `orders.source`, which answers "which
// system sent this order" — and every paid order answers "lightfunnels". This
// groups by the ad network the customer actually clicked, so the budget question
// ("is Instagram or TikTok carrying us?") has an answer on the reports page.
//
// The rows come from a dedicated server query over the report's date range
// (hooks/use-channel-performance.ts), not from the shared orders list: that list
// is a date window of the book, so aggregating it would silently report whatever
// happened to be loaded.
// =============================================

import { z } from "zod";

/**
 * Money is counted only where it landed: delivered/completed, the same rule
 * `get_dashboard_metrics` uses for revenue.
 */
const REALIZED_STATUSES = new Set(["delivered", "completed"]);

/** One order as the channel query returns it. `price` is absent for viewers without money access. */
export const channelFactSchema = z.object({
    ad_channel: z.string().nullable(),
    status: z.string(),
    price: z.number().nullable().optional(),
});
export type ChannelFact = z.infer<typeof channelFactSchema>;

export const CHANNEL_FACT_COLUMNS = "ad_channel,status";
export const CHANNEL_FACT_COLUMNS_WITH_PRICE = "ad_channel,status,price";

export interface ChannelPerformanceRow {
    /** Normalized channel, or null for the unattributed bucket. */
    channel: string | null;
    orders: number;
    /** delivered + completed */
    delivered: number;
    rejected: number;
    /** Revenue from delivered/completed orders; null when the viewer may not see money. */
    realizedRevenue: number | null;
    /**
     * delivered ÷ (delivered + rejected) — the dashboard's delivery-rate rule,
     * so an order still in the pipeline neither helps nor hurts. Null until
     * something has resolved.
     */
    deliveryRate: number | null;
    /** Realized revenue per order, so a channel of few big orders is not buried. */
    revenuePerOrder: number | null;
    /** Share of ALL orders in range (attributed + unattributed), 0–100. */
    share: number;
    /** 1-based rank among attributed channels; 0 for the unattributed bucket. */
    rank: number;
}

export interface ChannelPerformanceSummary {
    /** Attributed channels, ranked by realized revenue (then order count). */
    channels: ChannelPerformanceRow[];
    /**
     * Orders with no ad channel — capture gaps, manual entries, imports. Shown
     * as its own honest bucket rather than dropped (which would overstate each
     * channel's share) or folded into a network (which would misstate it).
     */
    unattributed: ChannelPerformanceRow | null;
    totalOrders: number;
    /** Null when the viewer may not see money. */
    totalRealizedRevenue: number | null;
    /** Share of orders that carry a channel, 0–100. */
    attributedShare: number;
}

interface Accumulator {
    orders: number;
    delivered: number;
    rejected: number;
    revenue: number;
}

function finish(
    channel: string | null,
    acc: Accumulator,
    total: number,
    includeMoney: boolean,
): Omit<ChannelPerformanceRow, "rank"> {
    const resolved = acc.delivered + acc.rejected;
    return {
        channel,
        orders: acc.orders,
        delivered: acc.delivered,
        rejected: acc.rejected,
        realizedRevenue: includeMoney ? acc.revenue : null,
        deliveryRate: resolved > 0 ? (acc.delivered / resolved) * 100 : null,
        revenuePerOrder: includeMoney ? (acc.orders > 0 ? acc.revenue / acc.orders : 0) : null,
        share: total > 0 ? (acc.orders / total) * 100 : 0,
    };
}

/**
 * Per-channel totals over orders the server already scoped to the report's
 * range (tenant, created_at window, not archived/deleted/returns).
 *
 * `includeMoney` is false for viewers without financial access; their rows were
 * fetched without `price`, and every money field comes back null.
 */
export function calculateChannelPerformance(
    facts: ChannelFact[],
    includeMoney: boolean,
): ChannelPerformanceSummary {
    const byChannel = new Map<string, Accumulator>();
    const none: Accumulator = { orders: 0, delivered: 0, rejected: 0, revenue: 0 };

    for (const fact of facts) {
        const key = fact.ad_channel?.trim() || null;
        let acc = none;
        if (key !== null) {
            acc = byChannel.get(key) ?? { orders: 0, delivered: 0, rejected: 0, revenue: 0 };
            byChannel.set(key, acc);
        }
        acc.orders += 1;
        if (REALIZED_STATUSES.has(fact.status)) {
            acc.delivered += 1;
            acc.revenue += Number(fact.price) || 0;
        } else if (fact.status === "rejected") {
            acc.rejected += 1;
        }
    }

    const total = facts.length;
    const channels = [...byChannel.entries()]
        .map(([channel, acc]) => ({ acc, row: finish(channel, acc, total, includeMoney) }))
        // Ranked by money landed, not by volume: a channel with twice the orders
        // and half the delivery rate is not the better buy. Without money access
        // the revenue ties at zero and order count decides.
        .sort((a, b) => b.acc.revenue - a.acc.revenue || b.acc.orders - a.acc.orders)
        .map(({ row }, index) => ({ ...row, rank: index + 1 }));

    const attributedOrders = total - none.orders;
    const totalRevenue = [...byChannel.values()].reduce((sum, acc) => sum + acc.revenue, 0) + none.revenue;

    return {
        channels,
        unattributed: none.orders > 0 ? { ...finish(null, none, total, includeMoney), rank: 0 } : null,
        totalOrders: total,
        totalRealizedRevenue: includeMoney ? totalRevenue : null,
        attributedShare: total > 0 ? (attributedOrders / total) * 100 : 0,
    };
}
