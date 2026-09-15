// =============================================
// AD-CHANNEL PERFORMANCE
//
// `calculateSourcePerformance` groups by `orders.source`, which answers "which
// system sent this order" — and every paid order answers "lightfunnels". This
// groups by the ad network the customer actually clicked, so the question the
// budget decision depends on ("is Instagram or TikTok carrying us?") has an
// answer on the reports page rather than only as a filter on the orders list.
// =============================================

import type { Order } from "@/lib/supabase";
import type { DateRange } from "@/hooks/use-reports-metrics";
import { channelLabel, type AdChannel } from "@/lib/ad-attribution";

/** Money is only counted where it actually arrived — the rule the finance pages use. */
const REALIZED_STATUSES = new Set(["delivered", "completed"]);
/** An order that reached the courier, whatever happened after. */
const COMMITTED_STATUSES = new Set(["confirmed", "in_transit", "delivered", "completed"]);

export interface ChannelPerformanceMetrics {
    channel: string;
    label: string;
    orders: number;
    confirmed: number;
    delivered: number;
    /** Revenue from delivered/completed orders only. */
    realizedRevenue: number;
    /** Value of everything the channel brought in, settled or not. */
    grossValue: number;
    /** delivered ÷ confirmed — how much of what it books actually lands. */
    deliveryRate: number;
    /** Realized revenue per order, so a channel of few big orders is not buried. */
    revenuePerOrder: number;
    /** Share of all attributed orders in range, 0–100. */
    share: number;
    rank: number;
}

/**
 * Per-channel totals for orders created inside `dateRange`.
 *
 * Orders with no channel are left out rather than bucketed as "other": most of
 * them are seeded rows, returns, or orders that predate attribution, and folding
 * those into a real network's row would misstate it. Returns are excluded too —
 * a refund is not a second acquisition.
 */
export function calculateChannelPerformance(
    orders: Order[],
    dateRange: DateRange,
): ChannelPerformanceMetrics[] {
    const byChannel = new Map<string, ChannelPerformanceMetrics>();
    let attributedTotal = 0;

    for (const order of orders) {
        if (!order.ad_channel || order.is_return) continue;

        const created = new Date(order.created_at);
        if (isNaN(created.getTime()) || created < dateRange.from || created > dateRange.to) continue;

        const row = byChannel.get(order.ad_channel) ?? {
            channel: order.ad_channel,
            label: channelLabel({ channel: order.ad_channel as AdChannel, source: order.ad_channel })
                ?? order.ad_channel,
            orders: 0,
            confirmed: 0,
            delivered: 0,
            realizedRevenue: 0,
            grossValue: 0,
            deliveryRate: 0,
            revenuePerOrder: 0,
            share: 0,
            rank: 0,
        };

        const value = Number(order.price) || 0;
        row.orders += 1;
        row.grossValue += value;
        if (COMMITTED_STATUSES.has(order.status)) row.confirmed += 1;
        if (REALIZED_STATUSES.has(order.status)) {
            row.delivered += 1;
            row.realizedRevenue += value;
        }

        byChannel.set(order.ad_channel, row);
        attributedTotal += 1;
    }

    return [...byChannel.values()]
        .map(row => ({
            ...row,
            deliveryRate: row.confirmed > 0 ? (row.delivered / row.confirmed) * 100 : 0,
            revenuePerOrder: row.orders > 0 ? row.realizedRevenue / row.orders : 0,
            share: attributedTotal > 0 ? (row.orders / attributedTotal) * 100 : 0,
        }))
        // Ranked by money landed, not by volume: a channel with twice the orders
        // and half the delivery rate is not the better buy.
        .sort((a, b) => b.realizedRevenue - a.realizedRevenue || b.orders - a.orders)
        .map((row, index) => ({ ...row, rank: index + 1 }));
}
