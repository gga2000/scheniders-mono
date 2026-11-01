"use client";

import { bucketsBetween, periodBucket } from "@/lib/finance/buckets";
import { useMemo } from "react";
import type { Order, Product } from "@/lib/supabase";
import type { DateInterval } from "./use-finance-overview";
import type { Granularity } from "./use-finance-period";
import { isRefundRow, refundPaidAt, reportDate } from "@/lib/refunds/refund-reporting";
import { isRealizedRevenue, isSaleOrder } from "@/lib/order-revenue";
import { resolveItemCost } from "@/lib/finance/item-cost";
import { addDaysToDayKey, baghdadDayKey, baghdadDayStart } from "@/lib/order-window";

export interface RevenueDecomposition {
    revCurr: number;
    revPrev: number;
    ordersCurr: number;
    ordersPrev: number;
    aovCurr: number;
    aovPrev: number;
    deltaRev: number;
    deltaOrders: number;
    deltaAov: number;
    volumeEffect: number;   // ΔOrders × aovPrev
    priceEffect: number;    // ΔAov × ordersCurr
    mixResidual: number;    // reconciliation residual (usually 0)
}

export interface MarginHeatmapCell {
    product: string;
    bucket: string;
    bucketTs: number;
    revenue: number;
    units: number;
    cogs: number;
    margin_pct: number;
}

export interface MarginHeatmap {
    products: Array<{ name: string; total_revenue: number; total_margin_pct: number }>;
    granularity: Granularity;
    /** Labelled by the view, so they follow the app language. */
    buckets: Array<{ key: string; ts: number }>;
    cells: MarginHeatmapCell[];
}

export interface ChannelPnLRow {
    key: string;
    label: string;
    revenue: number;
    orders: number;
    product_cost: number;
    /** Delivered revenue minus product cost. Courier bills are expenses, so delivery is not subtracted per channel (same walk as the Overview). */
    gross_profit: number;
    margin_pct: number;         // gross_profit / delivered revenue
}

export interface RefundsImpact {
    refund_value: number;
    refund_count: number;
    refund_rate_pct: number;    // refunds / (gross + refunds) as orders
    top_refunded: Array<{ name: string; count: number; value: number }>;
    daily: Array<{ date: string; value: number }>;
}

export interface FinanceRevenueResult {
    decomposition: RevenueDecomposition;
    heatmap: MarginHeatmap;
    channels: ChannelPnLRow[];
    refunds: RefundsImpact;
}

const CHANNEL_LABELS: Record<string, string> = {
    whatsapp: "WhatsApp",
    lightfunnels: "Lightfunnels",
    meta: "Meta Ads",
    tiktok: "TikTok",
    delivery_import: "Delivery",
    shop: "Shop",
    other: "Direct / Other",
};

function within(d: Date, i: DateInterval): boolean {
    return d >= i.start && d <= i.end;
}

export function useFinanceRevenue(
    orders: Order[],
    products: Product[],
    current: DateInterval,
    previous: DateInterval | null,
    granularity: Granularity,
    topProductCount: number = 8,
): FinanceRevenueResult {
    return useMemo(() => {
        // Sales by the day they were placed, refunds by the day they were paid.
        const inInterval = (o: Order, i: DateInterval) => {
            const d = reportDate(o);
            return d !== null && within(d, i);
        };
        const curr = orders.filter((o) => inInterval(o, current));
        const prev = previous ? orders.filter((o) => inInterval(o, previous)) : [];

        // ── Decomposition (non-rejected orders, gross revenue) ──
        const countRevenue = (list: Order[]) => {
            let rev = 0;
            let count = 0;
            for (const o of list) {
                if (!isSaleOrder(o)) continue;
                rev += o.price || 0;
                count++;
            }
            return { rev, count };
        };
        const currAgg = countRevenue(curr);
        const prevAgg = countRevenue(prev);

        const aovCurr = currAgg.count > 0 ? currAgg.rev / currAgg.count : 0;
        const aovPrev = prevAgg.count > 0 ? prevAgg.rev / prevAgg.count : 0;
        const deltaRev = currAgg.rev - prevAgg.rev;
        const deltaOrders = currAgg.count - prevAgg.count;
        const deltaAov = aovCurr - aovPrev;
        const volumeEffect = deltaOrders * aovPrev;
        const priceEffect = deltaAov * currAgg.count;
        const mixResidual = deltaRev - volumeEffect - priceEffect;

        const decomposition: RevenueDecomposition = {
            revCurr: currAgg.rev,
            revPrev: prevAgg.rev,
            ordersCurr: currAgg.count,
            ordersPrev: prevAgg.count,
            aovCurr,
            aovPrev,
            deltaRev,
            deltaOrders,
            deltaAov,
            volumeEffect,
            priceEffect,
            mixResidual,
        };

        // ── Margin heatmap: top-N products × buckets ──
        // Only consider delivered/completed orders (margin is meaningful only on realized revenue)
        const productTotals = new Map<string, { revenue: number; cogs: number; units: number }>();
        const bucketSet = new Map<string, { key: string; ts: number }>();
        const cellMap = new Map<string, MarginHeatmapCell>(); // product|bucket

        for (const o of curr) {
            if (!isRealizedRevenue(o)) continue;
            if (!o.items) continue;
            const { key, ts } = periodBucket(new Date(o.delivered_at || o.updated_at || o.created_at), granularity);
            bucketSet.set(key, { key, ts });

            for (const it of o.items) {
                const name = it.name || "Unknown";
                const unitRev = (it.price || 0) * it.quantity;
                const unitCost = resolveItemCost(it, products).cost;

                const tot = productTotals.get(name) || { revenue: 0, cogs: 0, units: 0 };
                tot.revenue += unitRev;
                tot.cogs += unitCost;
                tot.units += it.quantity;
                productTotals.set(name, tot);

                const cellKey = `${name}|${key}`;
                const cell = cellMap.get(cellKey);
                if (cell) {
                    cell.revenue += unitRev;
                    cell.cogs += unitCost;
                    cell.units += it.quantity;
                    cell.margin_pct = cell.revenue > 0 ? ((cell.revenue - cell.cogs) / cell.revenue) * 100 : 0;
                } else {
                    cellMap.set(cellKey, {
                        product: name,
                        bucket: key,
                        bucketTs: ts,
                        revenue: unitRev,
                        cogs: unitCost,
                        units: it.quantity,
                        margin_pct: unitRev > 0 ? ((unitRev - unitCost) / unitRev) * 100 : 0,
                    });
                }
            }
        }

        const topProducts = Array.from(productTotals.entries())
            .map(([name, v]) => ({
                name,
                total_revenue: v.revenue,
                total_margin_pct: v.revenue > 0 ? ((v.revenue - v.cogs) / v.revenue) * 100 : 0,
            }))
            .sort((a, b) => b.total_revenue - a.total_revenue)
            .slice(0, topProductCount);

        const topProductNames = new Set(topProducts.map((p) => p.name));

        // Walk the period tick-by-tick so the heatmap always shows the full timeline,
        // even if the only delivered order in the range fell on a single day.
        const fullBuckets = new Map<string, { key: string; ts: number }>();
        for (const b of bucketsBetween(current.start, current.end, granularity)) fullBuckets.set(b.key, b);
        // Always include any bucket the data already touched, in case the period boundary trims one.
        for (const b of bucketSet.values()) if (!fullBuckets.has(b.key)) fullBuckets.set(b.key, b);

        const buckets = Array.from(fullBuckets.values())
            .sort((a, b) => a.ts - b.ts)
            .map((b) => ({ key: b.key, ts: b.ts }));
        const cells = Array.from(cellMap.values()).filter((c) => topProductNames.has(c.product));

        const heatmap: MarginHeatmap = { products: topProducts, granularity, buckets, cells };

        // ── Channel P&L ──
        // Margin is computed against delivered_revenue so it's not inflated when
        // most orders are still in transit (where product_cost is unknown).
        const channelMap = new Map<string, {
            revenue: number; orders: number; delivered_revenue: number; delivered_orders: number;
            product_cost: number;
        }>();
        for (const o of curr) {
            if (!isSaleOrder(o)) continue;
            const ch = o.source || "other";
            const row = channelMap.get(ch) || {
                revenue: 0, orders: 0, delivered_revenue: 0, delivered_orders: 0,
                product_cost: 0,
            };
            row.revenue += o.price || 0;
            row.orders++;
            if (isRealizedRevenue(o)) {
                row.delivered_revenue += o.price || 0;
                row.delivered_orders++;
                if (o.items) {
                    for (const it of o.items) row.product_cost += resolveItemCost(it, products).cost;
                }
            }
            channelMap.set(ch, row);
        }

        const channels: ChannelPnLRow[] = Array.from(channelMap.entries())
            .map(([k, v]) => {
                const gross_profit = v.delivered_revenue - v.product_cost;
                return {
                    key: k,
                    label: CHANNEL_LABELS[k] || k,
                    revenue: v.revenue,
                    orders: v.orders,
                    product_cost: v.product_cost,
                    gross_profit,
                    margin_pct: v.delivered_revenue > 0
                        ? (gross_profit / v.delivered_revenue) * 100
                        : 0,
                };
            })
            .sort((a, b) => b.revenue - a.revenue);

        // ── Refunds impact ──
        let refund_value = 0;
        let refund_count = 0;
        const refundByProduct = new Map<string, { count: number; value: number }>();
        const refundDaily = new Map<string, number>();
        for (const o of curr) {
            const paidAt = isRefundRow(o) ? refundPaidAt(o) : null;
            if (!paidAt) continue;
            // Refund prices may be stored as negative (cash leaving). Use magnitude
            // so totals/charts/leaderboards display correct positive volumes.
            const value = Math.abs(o.price || 0);
            refund_value += value;
            refund_count++;
            const key = baghdadDayKey(paidAt);
            refundDaily.set(key, (refundDaily.get(key) || 0) + value);
            for (const it of o.items || []) {
                const name = it.name || "Unknown";
                const row = refundByProduct.get(name) || { count: 0, value: 0 };
                row.count += it.quantity;
                row.value += Math.abs((it.price || 0) * it.quantity);
                refundByProduct.set(name, row);
            }
        }

        const totalFulfilled = currAgg.count + refund_count;
        const refund_rate_pct = totalFulfilled > 0 ? (refund_count / totalFulfilled) * 100 : 0;
        const top_refunded = Array.from(refundByProduct.entries())
            .map(([name, v]) => ({ name, count: v.count, value: v.value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 5);
        const daily = Array.from(refundDaily.entries())
            .map(([date, value]) => ({ date, value }))
            .sort((a, b) => a.date.localeCompare(b.date));

        const refunds: RefundsImpact = {
            refund_value,
            refund_count,
            refund_rate_pct,
            top_refunded,
            daily,
        };

        return { decomposition, heatmap, channels, refunds };
    }, [orders, products, current, previous, granularity, topProductCount]);
}
