"use client";

import { useMemo } from "react";
import type { Order } from "@/lib/supabase";
import { normalizeGovernorate } from "@/lib/governorate-normalize";
import { addDaysToDayKey, baghdadDayKey, baghdadDayStart } from "@/lib/order-window";

export interface AgingBucket {
    id: "fresh" | "aging" | "stale" | "stuck";
    label: string;
    range: string;
    minDays: number;
    maxDays: number | null;
    count: number;
    value: number;
    tone: "emerald" | "amber" | "orange" | "rose";
}

export interface StuckOrder {
    id: string;
    order_id: string;
    sequence_number?: number;
    customer_name: string;
    phone: string;
    city?: string;
    price: number;
    status: Order["status"];
    created_at: string;
    shipped_at: string;
    days_in_transit: number;
    delivery_company?: Order["delivery_company"];
}

export interface GovernorateCollection {
    code: string;
    attempted: number;
    delivered: number;
    rate: number;
    delivered_value: number;
    at_risk_value: number;
}

export interface CashPositionResult {
    // Headline cash figures
    cashCollected: number;        // delivered+paid
    cashInTransit: number;        // in_transit orders
    cashConfirmed: number;        // confirmed (not yet shipped)
    cashAtRisk: number;           // stuck 15+ days in transit
    netProjection: number;        // cashCollected + (in-transit × historical delivery rate)
    historicalDeliveryRate: number;

    // Pipeline counts
    inTransitCount: number;
    confirmedCount: number;
    stuckCount: number;

    // Aging distribution for in-transit orders
    aging: AgingBucket[];
    oldestStuckDays: number;

    // Drill-down list — stuck orders sorted by age desc
    stuckOrders: StuckOrder[];

    // Governorate collection rates
    byGovernorate: GovernorateCollection[];

    // 30-day cash-realized series for timeline chart
    cashSeries: Array<{ date: string; ts: number; collected: number; float: number }>;
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;

function ageInDays(isoDate: string | undefined, now: number): number {
    if (!isoDate) return 0;
    const then = new Date(isoDate).getTime();
    if (Number.isNaN(then)) return 0;
    return Math.max(0, Math.floor((now - then) / MS_PER_DAY));
}

/**
 * When the order entered its current status. Real history when we have it;
 * otherwise `updated_at`, which any later edit resets, so it can understate age.
 */
function statusReference(o: Order, inTransitSince?: ReadonlyMap<string, string>): string {
    return inTransitSince?.get(o.id) || o.updated_at || o.created_at;
}

/**
 * `collectedWindow` limits "Collected" (and the projection built on it) to cash
 * that landed inside it, by delivery day. Without it the figure covers every
 * order that was loaded. Everything else here is the live position and never
 * depends on the window.
 */
export function useCashPosition(
    orders: Order[],
    inTransitSince?: ReadonlyMap<string, string>,
    collectedWindow?: { start: Date; end: Date },
): CashPositionResult {
    const windowStart = collectedWindow?.start;
    const windowEnd = collectedWindow?.end;
    return useMemo(() => {
        // Refund and return rows are money going back to the customer. They are
        // not sales in flight, so no cash figure, aging bucket, or delivery rate
        // may count them (a live return row in transit read as -44,750 IQD).
        const sales = orders.filter((o) => !o.is_return);
        const now = Date.now();
        // The chart covers the last 30 Baghdad days, whatever the viewer's own time zone.
        const firstDay = addDaysToDayKey(baghdadDayKey(now), -29);
        const earliest = new Date(baghdadDayStart(firstDay));

        let cashCollected = 0;
        let cashInTransit = 0;
        let cashConfirmed = 0;
        let deliveredAttempts = 0;
        let totalAttempts = 0;

        const buckets: Record<AgingBucket["id"], { count: number; value: number }> = {
            fresh: { count: 0, value: 0 },
            aging: { count: 0, value: 0 },
            stale: { count: 0, value: 0 },
            stuck: { count: 0, value: 0 },
        };

        const stuckList: StuckOrder[] = [];
        const govMap = new Map<string, { attempted: number; delivered: number; delivered_value: number; at_risk_value: number }>();
        const daily = new Map<string, { collected: number; float: number }>();

        let oldestStuckDays = 0;

        for (const o of sales) {
            const value = o.price || 0;
            const gov = normalizeGovernorate(o.governorate_code || o.city);

            // Delivery attempt rate
            if (o.status === "delivered" || o.status === "completed") {
                deliveredAttempts++;
                totalAttempts++;
            } else if (o.status === "rejected" || o.status === "no_response") {
                totalAttempts++;
                // Bucket failed attempts so collection-by-city ratios reflect true success.
                const g = govMap.get(gov) || { attempted: 0, delivered: 0, delivered_value: 0, at_risk_value: 0 };
                g.attempted++;
                govMap.set(gov, g);
            }

            // Cash realized
            if (o.status === "delivered" || o.status === "completed") {
                const ref = new Date(o.delivered_at || o.updated_at || o.created_at);
                if (!windowStart || !windowEnd || (ref >= windowStart && ref <= windowEnd)) cashCollected += value;
                if (ref >= earliest) {
                    const key = baghdadDayKey(ref);
                    const entry = daily.get(key) || { collected: 0, float: 0 };
                    entry.collected += value;
                    daily.set(key, entry);
                }
                const g = govMap.get(gov) || { attempted: 0, delivered: 0, delivered_value: 0, at_risk_value: 0 };
                g.attempted++;
                g.delivered++;
                g.delivered_value += value;
                govMap.set(gov, g);
            }

            // In-transit: age bucketing
            if (o.status === "in_transit") {
                cashInTransit += value;
                const days = ageInDays(statusReference(o, inTransitSince), now);

                let bucketId: AgingBucket["id"];
                if (days <= 3) bucketId = "fresh";
                else if (days <= 7) bucketId = "aging";
                else if (days <= 14) bucketId = "stale";
                else bucketId = "stuck";

                buckets[bucketId].count++;
                buckets[bucketId].value += value;

                if (bucketId === "stale" || bucketId === "stuck") {
                    stuckList.push({
                        id: o.id,
                        order_id: o.order_id,
                        sequence_number: o.sequence_number,
                        customer_name: o.customer_name || "Unknown",
                        phone: o.phone,
                        city: o.city,
                        price: value,
                        status: o.status,
                        created_at: o.created_at,
                        shipped_at: statusReference(o, inTransitSince),
                        days_in_transit: days,
                        delivery_company: o.delivery_company,
                    });
                    if (days > oldestStuckDays) oldestStuckDays = days;
                }

                if (bucketId === "stuck") {
                    const g = govMap.get(gov) || { attempted: 0, delivered: 0, delivered_value: 0, at_risk_value: 0 };
                    g.at_risk_value += value;
                    govMap.set(gov, g);
                }

                const ref = new Date(statusReference(o, inTransitSince));
                if (ref >= earliest) {
                    const key = baghdadDayKey(ref);
                    const entry = daily.get(key) || { collected: 0, float: 0 };
                    entry.float += value;
                    daily.set(key, entry);
                }
            }

            // Confirmed (not yet shipped)
            if (o.status === "confirmed") {
                cashConfirmed += value;
            }

            // Rejected/no_response already counted as attempts above (lines 116-117).
            // No additional cash impact — fall through.
        }

        const historicalDeliveryRate = totalAttempts > 0 ? deliveredAttempts / totalAttempts : 0;
        const cashAtRisk = buckets.stuck.value;
        const netProjection = cashCollected + cashInTransit * historicalDeliveryRate;

        const aging: AgingBucket[] = [
            {
                id: "fresh",
                label: "Fresh",
                range: "0–3 days",
                minDays: 0,
                maxDays: 3,
                count: buckets.fresh.count,
                value: buckets.fresh.value,
                tone: "emerald",
            },
            {
                id: "aging",
                label: "Aging",
                range: "4–7 days",
                minDays: 4,
                maxDays: 7,
                count: buckets.aging.count,
                value: buckets.aging.value,
                tone: "amber",
            },
            {
                id: "stale",
                label: "Stale",
                range: "8–14 days",
                minDays: 8,
                maxDays: 14,
                count: buckets.stale.count,
                value: buckets.stale.value,
                tone: "orange",
            },
            {
                id: "stuck",
                label: "At risk",
                range: "15+ days",
                minDays: 15,
                maxDays: null,
                count: buckets.stuck.count,
                value: buckets.stuck.value,
                tone: "rose",
            },
        ];

        const stuckOrders = stuckList.sort((a, b) => b.days_in_transit - a.days_in_transit).slice(0, 50);

        const byGovernorate: GovernorateCollection[] = Array.from(govMap.entries())
            .map(([code, v]) => ({
                code,
                attempted: v.attempted,
                delivered: v.delivered,
                rate: v.attempted > 0 ? (v.delivered / v.attempted) * 100 : 0,
                delivered_value: v.delivered_value,
                at_risk_value: v.at_risk_value,
            }))
            .filter((g) => g.attempted + g.at_risk_value > 0)
            .sort((a, b) => b.delivered_value - a.delivered_value);

        const cashSeries: CashPositionResult["cashSeries"] = [];
        for (let key = firstDay; key <= baghdadDayKey(now); key = addDaysToDayKey(key, 1)) {
            const entry = daily.get(key) || { collected: 0, float: 0 };
            cashSeries.push({ date: key, ts: baghdadDayStart(key), collected: entry.collected, float: entry.float });
        }

        return {
            cashCollected,
            cashInTransit,
            cashConfirmed,
            cashAtRisk,
            netProjection,
            historicalDeliveryRate: historicalDeliveryRate * 100,
            inTransitCount: buckets.fresh.count + buckets.aging.count + buckets.stale.count + buckets.stuck.count,
            confirmedCount: sales.filter((o) => o.status === "confirmed").length,
            stuckCount: buckets.stuck.count,
            aging,
            oldestStuckDays,
            stuckOrders,
            byGovernorate,
            cashSeries,
        };
    }, [orders, inTransitSince, windowStart, windowEnd]);
}
