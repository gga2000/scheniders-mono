"use client";

import { useMemo } from "react";
import type { Order, Product } from "@/lib/supabase";
import type { DateInterval } from "./use-finance-overview";
import type { Granularity } from "./use-finance-period";
import { isRefundRow, refundPaidAt, reportDate } from "@/lib/refunds/refund-reporting";
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
    buckets: Array<{ key: string; ts: number; label: string }>;
    cells: MarginHeatmapCell[];
}

export interface ChannelPnLRow {
    key: string;
    label: string;
    revenue: number;
    orders: number;
    product_cost: number;
    delivery_cost: number;
    gross_profit: number;
    net_contribution: number;   // gross_profit - delivery_cost
    margin_pct: number;         // net_contribution / revenue
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

function bucketKey(d: Date, granularity: Granularity): { key: string; ts: number } {
    const dd = new Date(d);
    dd.setHours(0, 0, 0, 0);
    if (granularity === "day" || granularity === "week") {
        const dayKey = baghdadDayKey(d);
        if (granularity === "day") return { key: dayKey, ts: baghdadDayStart(dayKey) };
        const weekday = new Date(`${dayKey}T00:00:00.000Z`).getUTCDay();
        const mondayKey = addDaysToDayKey(dayKey, -((weekday + 6) % 7));
        return { key: mondayKey, ts: baghdadDayStart(mondayKey) };
    }
    if (granularity === "quarter") {
        const q = Math.floor(dd.getMonth() / 3);
        const first = new Date(dd.getFullYear(), q * 3, 1);
        return { key: `${dd.getFullYear()}-Q${q + 1}`, ts: first.getTime() };
    }
    if (granularity === "year") {
        const first = new Date(dd.getFullYear(), 0, 1);
        return { key: `${dd.getFullYear()}`, ts: first.getTime() };
    }
    const y = dd.getFullYear();
    const m = String(dd.getMonth() + 1).padStart(2, "0");
    return { key: `${y}-${m}`, ts: new Date(y, dd.getMonth(), 1).getTime() };
}

function labelBucket(key: string, ts: number, granularity: Granularity): string {
    const d = new Date(ts);
    if (granularity === "day") return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    if (granularity === "week") return `Wk ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
    if (granularity === "quarter") return key;
    if (granularity === "year") return key;
    return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
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
                if (o.status === "rejected") continue;
                if (o.is_return || o.status === "refund_delivered") continue;
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
            if (o.status !== "delivered" && o.status !== "completed") continue;
            if (!o.items) continue;
            const { key, ts } = bucketKey(new Date(o.delivered_at || o.updated_at || o.created_at), granularity);
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
        const stepMs =
            granularity === "day" ? 24 * 3600 * 1000 :
                granularity === "week" ? 7 * 24 * 3600 * 1000 :
                    granularity === "month" ? 0 :
                        granularity === "quarter" ? 0 :
                            0;
        if (stepMs > 0) {
            for (let t = current.start.getTime(); t <= current.end.getTime(); t += stepMs) {
                const { key, ts } = bucketKey(new Date(t), granularity);
                if (!fullBuckets.has(key)) fullBuckets.set(key, { key, ts });
            }
        } else {
            // Month / quarter / year — increment by month boundaries so we don't skip.
            const cursor = new Date(current.start);
            cursor.setHours(0, 0, 0, 0);
            cursor.setDate(1);
            const endTs = current.end.getTime();
            while (cursor.getTime() <= endTs) {
                const { key, ts } = bucketKey(cursor, granularity);
                if (!fullBuckets.has(key)) fullBuckets.set(key, { key, ts });
                if (granularity === "month") cursor.setMonth(cursor.getMonth() + 1);
                else if (granularity === "quarter") cursor.setMonth(cursor.getMonth() + 3);
                else cursor.setFullYear(cursor.getFullYear() + 1);
            }
        }
        // Always include any bucket the data already touched, in case the period boundary trims one.
        for (const b of bucketSet.values()) if (!fullBuckets.has(b.key)) fullBuckets.set(b.key, b);

        const buckets = Array.from(fullBuckets.values())
            .sort((a, b) => a.ts - b.ts)
            .map((b) => ({ key: b.key, ts: b.ts, label: labelBucket(b.key, b.ts, granularity) }));
        const cells = Array.from(cellMap.values()).filter((c) => topProductNames.has(c.product));

        const heatmap: MarginHeatmap = { products: topProducts, buckets, cells };

        // ── Channel P&L ──
        // Margin is computed against delivered_revenue so it's not inflated when
        // most orders are still in transit (where product_cost is unknown).
        const channelMap = new Map<string, {
            revenue: number; orders: number; delivered_revenue: number; delivered_orders: number;
            product_cost: number; delivery_cost: number;
        }>();
        for (const o of curr) {
            if (o.status === "rejected") continue;
            if (o.is_return || o.status === "refund_delivered") continue;
            const ch = o.source || "other";
            const row = channelMap.get(ch) || {
                revenue: 0, orders: 0, delivered_revenue: 0, delivered_orders: 0,
                product_cost: 0, delivery_cost: 0,
            };
            row.revenue += o.price || 0;
            row.orders++;
            row.delivery_cost += o.delivery_fee || o.delivery_cost || 0;
            if (o.status === "delivered" || o.status === "completed") {
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
                const net_contribution = gross_profit - v.delivery_cost;
                return {
                    key: k,
                    label: CHANNEL_LABELS[k] || k,
                    revenue: v.revenue,
                    orders: v.orders,
                    product_cost: v.product_cost,
                    delivery_cost: v.delivery_cost,
                    gross_profit,
                    net_contribution,
                    margin_pct: v.delivered_revenue > 0
                        ? (net_contribution / v.delivered_revenue) * 100
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
