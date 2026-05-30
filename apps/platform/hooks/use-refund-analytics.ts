"use client";

import { useMemo } from "react";
import type { Order } from "@/lib/supabase";
import { normalizeGovernorate, governorateLabel } from "@/lib/governorate-normalize";

export interface RefundReasonRow {
    reason: string;
    count: number;
    value: number;
}

export interface RefundOrderRow {
    id: string;
    order_id: string;
    customer_name: string;
    phone: string;
    city?: string;
    price: number;
    status: string;
    is_return: boolean;
    items: number;
    reason?: string;
    refunded_at: string;
    days_since: number;
}

export interface RefundProductRow {
    name: string;
    units: number;
    value: number;
    orders: number;
}

export interface RefundDailyPoint {
    date: string;
    label: string;
    value: number;
    count: number;
}

export interface RefundAnalyticsResult {
    totalValue: number;
    totalCount: number;
    avgRefundValue: number;
    refundRate: number;
    refundRatePrev: number;
    valueDelta: number;
    valuePrev: number;
    pendingReturns: number;
    pendingReturnsValue: number;
    failedReturns: number;
    daily: RefundDailyPoint[];
    reasons: RefundReasonRow[];
    products: RefundProductRow[];
    orders: RefundOrderRow[];
    byCity: Array<{ city: string; count: number; value: number }>;
}

function ageInDays(date: string, now: number): number {
    const t = new Date(date).getTime();
    if (Number.isNaN(t)) return 0;
    return Math.max(0, Math.floor((now - t) / (24 * 3600 * 1000)));
}

function normalizeReason(raw: string): string {
    const trimmed = (raw || "").trim();
    if (!trimmed) return "Unspecified";
    // Take first line, then first sentence-ish chunk, capped at 60 chars.
    const firstLine = trimmed.split(/\r?\n/)[0].trim();
    const firstChunk = firstLine.split(/[.،,;:|]/)[0].trim() || firstLine;
    if (firstChunk.length <= 60) return firstChunk;
    return firstChunk.slice(0, 57).trim() + "…";
}

function isRefund(o: Order): boolean {
    return Boolean(o.is_return) ||
        o.status === "refund_delivered" ||
        o.status === "refund_failed" ||
        o.status === "return_pending";
}

export function useRefundAnalytics(
    orders: Order[],
    period: { start: Date; end: Date },
    previous: { start: Date; end: Date } | null,
): RefundAnalyticsResult {
    return useMemo(() => {
        const now = Date.now();
        const startMs = period.start.getTime();
        const endMs = period.end.getTime();

        let totalValue = 0;
        let totalCount = 0;
        let pendingReturns = 0;
        let pendingReturnsValue = 0;
        let failedReturns = 0;
        let totalShipped = 0;

        const dailyMap = new Map<string, { value: number; count: number }>();
        const reasonMap = new Map<string, { count: number; value: number }>();
        const productMap = new Map<string, { units: number; value: number; orders: number }>();
        const cityMap = new Map<string, { count: number; value: number }>();
        const refundOrders: RefundOrderRow[] = [];

        for (const o of orders) {
            const refTime = new Date(o.updated_at || o.created_at).getTime();
            const inPeriod = refTime >= startMs && refTime <= endMs;
            if (!inPeriod) continue;

            // Track total shipped (denominator for rate) — orders that left warehouse
            if (
                o.status === "delivered" ||
                o.status === "completed" ||
                o.status === "in_transit" ||
                o.status === "rejected" ||
                isRefund(o)
            ) {
                totalShipped++;
            }

            if (!isRefund(o)) continue;

            // Refund orders may store price as negative (cash leaving the business).
            // Treat refund magnitude as positive throughout analytics so charts,
            // sums and "has data" checks work correctly.
            const value = Math.abs(o.price || 0);
            totalValue += value;
            totalCount++;

            if (o.status === "return_pending") {
                pendingReturns++;
                pendingReturnsValue += value;
            }
            if (o.status === "refund_failed") {
                failedReturns++;
            }

            // Daily aggregation
            const refDate = new Date(o.updated_at || o.created_at);
            const dateKey = refDate.toISOString().split("T")[0];
            const day = dailyMap.get(dateKey) || { value: 0, count: 0 };
            day.value += value;
            day.count += 1;
            dailyMap.set(dateKey, day);

            // Reason aggregation — prefer short categorical reasons; fall back to a
            // truncated first line of notes so the UI doesn't render a paragraph.
            const reason = normalizeReason(o.rejection_reason || o.notes || "");
            const r = reasonMap.get(reason) || { count: 0, value: 0 };
            r.count += 1;
            r.value += value;
            reasonMap.set(reason, r);

            // City aggregation — normalize so Arabic / 3-letter / canonical codes
            // collapse into one row per governorate.
            const govKey = normalizeGovernorate(o.governorate_code || o.city);
            const c = cityMap.get(govKey) || { count: 0, value: 0 };
            c.count += 1;
            c.value += value;
            cityMap.set(govKey, c);

            // Product breakdown
            for (const it of o.items || []) {
                const name = it.name || "Unknown";
                const p = productMap.get(name) || { units: 0, value: 0, orders: 0 };
                p.units += it.quantity;
                p.value += Math.abs((it.price || 0) * it.quantity);
                p.orders += 1;
                productMap.set(name, p);
            }

            // Order row
            refundOrders.push({
                id: o.id,
                order_id: o.order_id,
                customer_name: o.customer_name,
                phone: o.phone,
                city: o.city,
                price: value,
                status: o.status,
                is_return: !!o.is_return,
                items: (o.items || []).reduce((s, it) => s + it.quantity, 0),
                reason: o.rejection_reason,
                refunded_at: o.updated_at || o.created_at,
                days_since: ageInDays(o.updated_at || o.created_at, now),
            });
        }

        // Previous-period totals
        let valuePrev = 0;
        let countPrev = 0;
        let totalShippedPrev = 0;
        if (previous) {
            const ps = previous.start.getTime();
            const pe = previous.end.getTime();
            for (const o of orders) {
                const t = new Date(o.updated_at || o.created_at).getTime();
                if (t < ps || t > pe) continue;
                if (
                    o.status === "delivered" ||
                    o.status === "completed" ||
                    o.status === "in_transit" ||
                    o.status === "rejected" ||
                    isRefund(o)
                ) {
                    totalShippedPrev++;
                }
                if (!isRefund(o)) continue;
                valuePrev += Math.abs(o.price || 0);
                countPrev++;
            }
        }

        // Build daily series — fill gaps
        const dayMs = 24 * 3600 * 1000;
        const daily: RefundDailyPoint[] = [];
        for (let t = startMs; t <= endMs; t += dayMs) {
            const d = new Date(t);
            const key = d.toISOString().split("T")[0];
            const entry = dailyMap.get(key) || { value: 0, count: 0 };
            daily.push({
                date: key,
                label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
                value: entry.value,
                count: entry.count,
            });
        }

        const reasons: RefundReasonRow[] = Array.from(reasonMap.entries())
            .map(([reason, v]) => ({ reason, count: v.count, value: v.value }))
            .sort((a, b) => b.value - a.value);

        const products: RefundProductRow[] = Array.from(productMap.entries())
            .map(([name, v]) => ({ name, units: v.units, value: v.value, orders: v.orders }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 10);

        const byCity = Array.from(cityMap.entries())
            .map(([code, v]) => ({ city: governorateLabel(code), count: v.count, value: v.value }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 8);

        refundOrders.sort((a, b) => b.refunded_at.localeCompare(a.refunded_at));

        const refundRate = totalShipped > 0 ? (totalCount / totalShipped) * 100 : 0;
        const refundRatePrev = totalShippedPrev > 0 ? (countPrev / totalShippedPrev) * 100 : 0;

        return {
            totalValue,
            totalCount,
            avgRefundValue: totalCount > 0 ? totalValue / totalCount : 0,
            refundRate,
            refundRatePrev,
            valueDelta: totalValue - valuePrev,
            valuePrev,
            pendingReturns,
            pendingReturnsValue,
            failedReturns,
            daily,
            reasons,
            products,
            orders: refundOrders,
            byCity,
        };
    }, [orders, period.start, period.end, previous]);
}
