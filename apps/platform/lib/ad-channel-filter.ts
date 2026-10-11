// =============================================
// AD-CHANNEL FILTER
//
// `orders.source` says "lightfunnels" for every paid order; `orders.ad_channel`
// says which network the customer actually clicked (lib/ad-attribution.ts). These
// are the predicate the orders list filters by and the per-channel tally its chip
// row shows — kept together so the chip's count and the list it opens cannot
// disagree.
// =============================================

import type { Order } from "@/types/order";
import { channelLabel, type AdChannel } from "./ad-attribution";

/** Revenue counted only where the money is real — the same rule the finance pages use. */
const REALIZED_STATUSES = new Set<Order["status"]>(["delivered", "completed"]);

export interface ChannelStat {
    channel: string;
    label: string;
    orders: number;
    /** Delivered/completed money only. */
    revenue: number;
}

export interface ChannelSummary {
    /** Channels present in the given orders, most orders first. */
    stats: ChannelStat[];
    /** Orders that carry a channel (the sum of `stats[].orders`). */
    attributed: number;
    /** Every order the summary was taken over, attributed or not. */
    total: number;
}

/** True when the order belongs to the selected channel; no selection matches everything. */
export function orderMatchesAdChannel(order: Pick<Order, "ad_channel">, channel: string | undefined | null): boolean {
    if (!channel) return true;
    return order.ad_channel === channel;
}

/**
 * Orders and realized revenue per ad channel.
 *
 * Every order carrying a channel is counted — returns included — because the
 * count is a promise about the list the chip opens, and that list shows them.
 * A return is never revenue, though: its row may copy the original's channel,
 * and crediting the network for it would count one sale twice.
 */
export function summarizeAdChannels(orders: readonly Order[]): ChannelSummary {
    const byChannel = new Map<string, ChannelStat>();
    let attributed = 0;

    for (const order of orders) {
        if (!order.ad_channel) continue;

        const existing = byChannel.get(order.ad_channel) ?? {
            channel: order.ad_channel,
            label: channelLabel({ channel: order.ad_channel as AdChannel, source: order.attribution?.source })
                ?? order.ad_channel,
            orders: 0,
            revenue: 0,
        };

        existing.orders += 1;
        if (!order.is_return && REALIZED_STATUSES.has(order.status)) {
            existing.revenue += Number(order.price) || 0;
        }
        byChannel.set(order.ad_channel, existing);
        attributed += 1;
    }

    return {
        stats: [...byChannel.values()].sort((a, b) => b.orders - a.orders || a.channel.localeCompare(b.channel)),
        attributed,
        total: orders.length,
    };
}
