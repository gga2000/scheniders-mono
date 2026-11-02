"use client";

import { bucketsBetween, periodBucket } from "@/lib/finance/buckets";
import { useMemo } from "react";
import type { Order } from "@/lib/supabase";
import { normalizePhoneForSearch } from "@/lib/order-utils";
import type { DateInterval } from "./use-finance-overview";
import type { Granularity } from "./use-finance-period";

export interface CustomerSummary {
    phone: string;
    name: string;
    city?: string;
    orders_count: number;
    revenue: number;
    aov: number;
    first_order_at: string;
    last_order_at: string;
    days_since_last_order: number;
    is_repeat: boolean;
    is_new_in_period: boolean;
    rejection_count: number;
    rejection_rate: number;
}

export interface CustomersFinanceSummary {
    total_customers: number;
    new_customers: number;
    returning_customers: number;
    repeat_rate_pct: number;
    avg_ltv: number;
    median_ltv: number;
    avg_aov: number;
    new_revenue: number;
    returning_revenue: number;
    new_revenue_share_pct: number;
    revenue_concentration_top10_pct: number;  // % of revenue from top 10 customers
}

export interface LTVBucket {
    label: string;
    min: number;
    max: number;
    count: number;
    share_pct: number;
    revenue: number;
}

export interface AcquisitionMixPoint {
    bucket: string;
    bucketTs: number;
    new_revenue: number;
    returning_revenue: number;
    new_orders: number;
    returning_orders: number;
}

export interface DormantCustomer extends CustomerSummary {
    risk_tone: "amber" | "rose";
}

export interface CohortCell {
    cohort_key: string;       // YYYY-MM (when customer was acquired)
    cohort_label: string;
    period_offset: number;    // months since acquisition
    customers: number;
    revenue: number;
}

export interface FinanceCustomersResult {
    summary: CustomersFinanceSummary;
    ltvBuckets: LTVBucket[];
    topSpenders: CustomerSummary[];
    dormantHighValue: DormantCustomer[];
    acquisitionMix: AcquisitionMixPoint[];
}

const REVENUE_STATUSES = new Set(["delivered", "completed"]);

/**
 * One row of `customer_aggregates`: a customer's lifetime totals, keyed by the
 * normalized phone. The finances page only loads the orders of the picked period,
 * so lifetime figures (first order, total spent, order count) cannot be rebuilt
 * from them: a regular whose earlier orders fall outside the window would read as new.
 */
export interface CustomerAggregate {
    customer_phone: string;
    latest_name: string | null;
    latest_city: string | null;
    total_orders: number;
    total_spent: number;
    first_order_date: string | null;
    last_order_date: string | null;
    cancelled_count: number;
    rejected_count: number;
}

function daysSince(iso: string | null, now: number): number {
    const t = iso ? new Date(iso).getTime() : 0;
    return t ? Math.max(0, Math.floor((now - t) / 86400000)) : 9999;
}

export function useFinanceCustomers(
    orders: Order[],
    aggregates: CustomerAggregate[],
    range: DateInterval,
    granularity: Granularity,
): FinanceCustomersResult {
    return useMemo(() => {
        const start = range.start.getTime();
        const end = range.end.getTime();
        const now = Date.now();

        // Lifetime profile per customer, from the aggregates.
        const customerMap = new Map<string, CustomerSummary>();
        for (const a of aggregates) {
            const ordersCount = Number(a.total_orders) || 0;
            const revenue = Number(a.total_spent) || 0;
            const first = a.first_order_date ? new Date(a.first_order_date).getTime() : 0;
            const rejections = (Number(a.rejected_count) || 0) + (Number(a.cancelled_count) || 0);
            customerMap.set(a.customer_phone, {
                phone: a.customer_phone,
                name: a.latest_name || "—",
                city: a.latest_city ?? undefined,
                orders_count: ordersCount,
                revenue,
                aov: ordersCount > 0 ? revenue / ordersCount : 0,
                first_order_at: a.first_order_date ?? "",
                last_order_at: a.last_order_date ?? "",
                days_since_last_order: daysSince(a.last_order_date, now),
                is_repeat: ordersCount > 1,
                is_new_in_period: first >= start && first <= end,
                rejection_count: rejections,
                rejection_rate: ordersCount > 0 ? (rejections / ordersCount) * 100 : 0,
            });
        }

        // The aggregate view refreshes on a schedule, so a customer whose first order is newer
        // than the last refresh has no row yet. They are new, and their profile is what the
        // window shows of them.
        const windowOrders: Array<{ order: Order; phone: string }> = [];
        const derived = new Set<string>();
        for (const o of orders) {
            const phone = normalizePhoneForSearch(o.phone);
            // Refund and return rows are money going back, not orders the customer placed.
            if (!phone || o.is_return) continue;
            const created = o.created_at ? new Date(o.created_at).getTime() : 0;
            if (created < start || created > end) continue;
            windowOrders.push({ order: o, phone });

            let c = customerMap.get(phone);
            if (!c) {
                c = {
                    phone,
                    name: o.customer_name || "—",
                    city: o.city,
                    orders_count: 0,
                    revenue: 0,
                    aov: 0,
                    first_order_at: o.created_at,
                    last_order_at: o.created_at,
                    days_since_last_order: 0,
                    is_repeat: false,
                    is_new_in_period: true,
                    rejection_count: 0,
                    rejection_rate: 0,
                };
                customerMap.set(phone, c);
                derived.add(phone);
            }
            if (!derived.has(phone)) continue;
            c.orders_count += 1;
            if (REVENUE_STATUSES.has(o.status)) c.revenue += Number(o.price) || 0;
            if (o.status === "rejected" || o.status === "cancelled") c.rejection_count += 1;
            if (new Date(c.first_order_at).getTime() > created) c.first_order_at = o.created_at;
            if (new Date(c.last_order_at).getTime() < created) c.last_order_at = o.created_at;
        }
        for (const phone of derived) {
            const c = customerMap.get(phone);
            if (!c) continue;
            c.aov = c.orders_count > 0 ? c.revenue / c.orders_count : 0;
            c.is_repeat = c.orders_count > 1;
            c.rejection_rate = c.orders_count > 0 ? (c.rejection_count / c.orders_count) * 100 : 0;
            c.days_since_last_order = daysSince(c.last_order_at, now);
        }

        const allCustomers = Array.from(customerMap.values());

        // Customers who placed an order in the period.
        const activeInPeriod = Array.from(new Set(windowOrders.map((w) => w.phone)))
            .map((phone) => customerMap.get(phone))
            .filter((c): c is CustomerSummary => c !== undefined);

        // Period-window revenue split: new vs returning
        let newRevenue = 0;
        let returningRevenue = 0;
        let newOrders = 0;
        let returningOrders = 0;
        for (const { order: o, phone } of windowOrders) {
            if (!REVENUE_STATUSES.has(o.status)) continue;
            const c = customerMap.get(phone);
            if (!c) continue;
            const price = Number(o.price) || 0;
            if (c.is_new_in_period) {
                newRevenue += price;
                newOrders += 1;
            } else {
                returningRevenue += price;
                returningOrders += 1;
            }
        }

        const totalCustomers = activeInPeriod.length;
        const newCustomers = activeInPeriod.filter((c) => c.is_new_in_period).length;
        const returningCustomers = totalCustomers - newCustomers;
        const repeatRatePct = totalCustomers > 0 ? (returningCustomers / totalCustomers) * 100 : 0;
        const periodRevenue = newRevenue + returningRevenue;
        const avgAov = (newOrders + returningOrders) > 0 ? periodRevenue / (newOrders + returningOrders) : 0;
        const avgLtv = activeInPeriod.length > 0
            ? activeInPeriod.reduce((s, c) => s + c.revenue, 0) / activeInPeriod.length
            : 0;
        const sortedLtv = activeInPeriod.map((c) => c.revenue).sort((a, b) => a - b);
        const medianLtv = sortedLtv.length === 0 ? 0
            : sortedLtv.length % 2 === 1
                ? sortedLtv[(sortedLtv.length - 1) / 2]
                : (sortedLtv[sortedLtv.length / 2 - 1] + sortedLtv[sortedLtv.length / 2]) / 2;

        // Revenue concentration: top 10 customers' share
        const topByRev = [...allCustomers].sort((a, b) => b.revenue - a.revenue);
        const totalLifetimeRevenue = allCustomers.reduce((s, c) => s + c.revenue, 0);
        const top10Revenue = topByRev.slice(0, 10).reduce((s, c) => s + c.revenue, 0);
        const concentration = totalLifetimeRevenue > 0 ? (top10Revenue / totalLifetimeRevenue) * 100 : 0;

        const summary: CustomersFinanceSummary = {
            total_customers: totalCustomers,
            new_customers: newCustomers,
            returning_customers: returningCustomers,
            repeat_rate_pct: repeatRatePct,
            avg_ltv: avgLtv,
            median_ltv: medianLtv,
            avg_aov: avgAov,
            new_revenue: newRevenue,
            returning_revenue: returningRevenue,
            new_revenue_share_pct: periodRevenue > 0 ? (newRevenue / periodRevenue) * 100 : 0,
            revenue_concentration_top10_pct: concentration,
        };

        // LTV histogram on currently-active customers
        const ltvBuckets = buildLtvBuckets(activeInPeriod);

        // Top spenders (lifetime) — only those with >= 1 revenue
        const topSpenders = topByRev.filter((c) => c.revenue > 0).slice(0, 12);

        // Dormant high-value: revenue > median, no order in last 60 days
        const dormantThreshold = Math.max(medianLtv, 1);
        const dormantHighValue: DormantCustomer[] = allCustomers
            .filter((c) => c.revenue >= dormantThreshold && c.days_since_last_order >= 45 && c.days_since_last_order < 365)
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 10)
            .map((c) => ({
                ...c,
                risk_tone: c.days_since_last_order >= 90 ? "rose" : "amber",
            }));

        // Acquisition mix time series within period
        const acquisitionMix = buildAcquisitionMix(windowOrders, customerMap, range, granularity);

        return {
            summary,
            ltvBuckets,
            topSpenders,
            dormantHighValue,
            acquisitionMix,
        };
    }, [orders, aggregates, range.start, range.end, granularity]);
}

function buildLtvBuckets(customers: CustomerSummary[]): LTVBucket[] {
    if (customers.length === 0) return [];
    const revenues = customers.map((c) => c.revenue).filter((v) => v > 0);
    if (revenues.length === 0) return [];

    // Iraq market scale — IQD: bucket boundaries in thousands
    const ranges: Array<{ label: string; min: number; max: number }> = [
        { label: "< 25K", min: 0, max: 25_000 },
        { label: "25–50K", min: 25_000, max: 50_000 },
        { label: "50–100K", min: 50_000, max: 100_000 },
        { label: "100–250K", min: 100_000, max: 250_000 },
        { label: "250–500K", min: 250_000, max: 500_000 },
        { label: "500K–1M", min: 500_000, max: 1_000_000 },
        { label: "1M+", min: 1_000_000, max: Number.POSITIVE_INFINITY },
    ];

    const buckets: LTVBucket[] = ranges.map((r) => ({
        label: r.label,
        min: r.min,
        max: r.max,
        count: 0,
        share_pct: 0,
        revenue: 0,
    }));

    for (const c of customers) {
        if (c.revenue <= 0) continue;
        for (const b of buckets) {
            if (c.revenue >= b.min && c.revenue < b.max) {
                b.count += 1;
                b.revenue += c.revenue;
                break;
            }
        }
    }

    const totalCount = buckets.reduce((s, b) => s + b.count, 0);
    for (const b of buckets) {
        b.share_pct = totalCount > 0 ? (b.count / totalCount) * 100 : 0;
    }

    return buckets;
}

function buildAcquisitionMix(
    windowOrders: Array<{ order: Order; phone: string }>,
    customerMap: Map<string, CustomerSummary>,
    range: DateInterval,
    granularity: Granularity,
): AcquisitionMixPoint[] {
    const bucketsMap = new Map<string, AcquisitionMixPoint>();

    const ensureBucket = (key: string, ts: number): AcquisitionMixPoint => {
        let b = bucketsMap.get(key);
        if (!b) {
            b = {
                bucket: key,
                bucketTs: ts,
                new_revenue: 0,
                returning_revenue: 0,
                new_orders: 0,
                returning_orders: 0,
            };
            bucketsMap.set(key, b);
        }
        return b;
    };

    // Pre-fill buckets for the period
    for (const { key, ts } of bucketsBetween(range.start, range.end, granularity)) ensureBucket(key, ts);

    for (const { order: o, phone } of windowOrders) {
        if (!o.created_at) continue;
        if (!REVENUE_STATUSES.has(o.status)) continue;
        const c = customerMap.get(phone);
        if (!c) continue;
        const price = Number(o.price) || 0;
        const { key, ts } = periodBucket(new Date(o.created_at), granularity);
        const b = ensureBucket(key, ts);
        if (c.is_new_in_period) {
            b.new_revenue += price;
            b.new_orders += 1;
        } else {
            b.returning_revenue += price;
            b.returning_orders += 1;
        }
    }

    return Array.from(bucketsMap.values()).sort((a, b) => a.bucketTs - b.bucketTs);
}
