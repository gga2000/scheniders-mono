"use client";

import { useMemo } from "react";
import type { Order, Product } from "@/lib/supabase";
import type { Expense } from "@/types/expense";
import type { Granularity } from "./use-finance-period";

export interface DateInterval {
    start: Date;
    end: Date;
}

interface BucketPoint {
    bucket: string; // yyyy-mm-dd or yyyy-Www or yyyy-mm
    ts: number;
    revenue: number;
    delivered_revenue: number;
    orders: number;
    delivered: number;
    product_cost: number;
    delivery_cost: number;
    discount: number;
    expenses: number;
    profit: number;
}

export type Dimension = "day" | "channel" | "city" | "product" | "paymentMethod";

export interface FinanceOverviewResult {
    // Scalar KPIs for current period
    gross_revenue: number;
    net_revenue: number; // excludes rejected + returns
    delivered_revenue: number;
    refund_value: number;
    product_cost: number;
    delivery_cost: number;
    discount: number;
    expenses: number;
    marketing_cost: number;
    gross_profit: number;
    net_profit: number;
    margin_pct: number;
    orders_count: number;
    delivered_count: number;
    aov: number;
    delivery_rate: number;

    // Cash view
    cash_realized: number; // delivered & paid orders
    cash_float: number; // confirmed/in-transit (COD floating)

    // Time series
    series: BucketPoint[];
    compareSeries: BucketPoint[]; // same shape, previous/YoY period

    // Compare scalars
    prev_gross_revenue: number;
    prev_net_profit: number;
    prev_orders_count: number;
    prev_delivered_count: number;
    prev_aov: number;
    prev_cash_realized: number;

    // Breakdowns
    by_channel: Array<{ key: string; label: string; revenue: number; orders: number; profit: number }>;
    by_city: Array<{ key: string; label: string; revenue: number; orders: number; profit: number; delivered: number }>;
    by_product: Array<{ key: string; label: string; revenue: number; units: number; profit: number; margin: number }>;
    by_payment: Array<{ key: string; label: string; revenue: number; orders: number }>;

    // Top movers
    top_gainer_product: { name: string; delta: number; revenue: number } | null;
    top_loser_product: { name: string; delta: number; revenue: number } | null;
    top_gainer_channel: { name: string; delta: number; revenue: number } | null;
    top_loser_channel: { name: string; delta: number; revenue: number } | null;
}

function bucketKey(d: Date, granularity: Granularity): { key: string; ts: number } {
    const dd = new Date(d);
    dd.setHours(0, 0, 0, 0);
    if (granularity === "day") {
        const key = dd.toISOString().split("T")[0];
        return { key, ts: dd.getTime() };
    }
    if (granularity === "week") {
        const day = dd.getDay();
        const diff = (day + 6) % 7;
        const monday = new Date(dd);
        monday.setDate(dd.getDate() - diff);
        const key = monday.toISOString().split("T")[0];
        return { key, ts: monday.getTime() };
    }
    if (granularity === "quarter") {
        const q = Math.floor(dd.getMonth() / 3);
        const firstOfQuarter = new Date(dd.getFullYear(), q * 3, 1);
        return { key: `${dd.getFullYear()}-Q${q + 1}`, ts: firstOfQuarter.getTime() };
    }
    if (granularity === "year") {
        const firstOfYear = new Date(dd.getFullYear(), 0, 1);
        return { key: `${dd.getFullYear()}`, ts: firstOfYear.getTime() };
    }
    const y = dd.getFullYear();
    const m = String(dd.getMonth() + 1).padStart(2, "0");
    const firstOfMonth = new Date(y, dd.getMonth(), 1);
    return { key: `${y}-${m}`, ts: firstOfMonth.getTime() };
}

function withinInterval(date: Date, i: DateInterval): boolean {
    return date >= i.start && date <= i.end;
}

function findProductCost(
    item: { name?: string; sku?: string; quantity: number; price: number },
    products: Product[]
): number {
    if (item.sku) {
        const bySku = products.find((p) => p.sku?.toLowerCase() === item.sku?.toLowerCase());
        if (bySku?.cost) return bySku.cost * item.quantity;
    }
    if (item.name) {
        const byName = products.find((p) => p.name.toLowerCase() === item.name?.toLowerCase());
        if (byName?.cost) return byName.cost * item.quantity;
    }
    return 0;
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

const PAYMENT_LABELS: Record<string, string> = {
    cod: "Cash on Delivery",
    prepaid: "Prepaid",
    paid: "Paid",
    partial: "Partial",
    pending: "Pending",
};

export function useFinanceOverview(
    orders: Order[],
    products: Product[],
    expenses: Expense[],
    current: DateInterval,
    previous: DateInterval | null,
    granularity: Granularity
): FinanceOverviewResult {
    return useMemo(() => {
        const toDate = (s: string) => new Date(s);

        const currOrders = orders.filter((o) => withinInterval(toDate(o.created_at), current));
        const prevOrders = previous ? orders.filter((o) => withinInterval(toDate(o.created_at), previous)) : [];
        const currExpenses = expenses.filter((e) => {
            const d = toDate(e.expense_date);
            return withinInterval(d, current);
        });

        const calc = (oList: Order[], eList: Expense[], interval: DateInterval) => {
            let gross = 0;
            let delivered_revenue = 0;
            let refund_value = 0;
            let product_cost = 0;
            let delivery_cost_sum = 0;
            let discount_sum = 0;
            let cash_realized = 0;
            let cash_float = 0;
            let delivered_count = 0;
            const non_rejected: Order[] = [];

            for (const o of oList) {
                const value = o.price || 0;
                const disc = o.discount_amount || 0;
                const dfee = o.delivery_fee || o.delivery_cost || 0;
                discount_sum += disc;
                delivery_cost_sum += dfee;

                if (o.status === "rejected") {
                    // excluded from gross
                    continue;
                }
                if (o.is_return || o.status === "refund_delivered") {
                    refund_value += Math.abs(value);
                    continue;
                }

                non_rejected.push(o);
                gross += value;

                if (o.status === "delivered" || o.status === "completed") {
                    delivered_revenue += value;
                    delivered_count++;
                    if (o.items) {
                        for (const it of o.items) product_cost += findProductCost(it, products);
                    }
                    if (o.payment_status === "paid" || o.payment_status === "cod") {
                        cash_realized += value;
                    }
                }
                if (o.status === "confirmed" || o.status === "in_transit") {
                    cash_float += value;
                }
            }

            const expense_total = eList.reduce((s, e) => s + e.amount, 0);
            const marketing_cost = eList.filter((e) => e.category === "marketing").reduce((s, e) => s + e.amount, 0);

            const gross_profit = delivered_revenue - product_cost;
            const net_profit = gross_profit - delivery_cost_sum - expense_total;
            const margin_pct = delivered_revenue > 0 ? (net_profit / delivered_revenue) * 100 : 0;
            const orders_count = non_rejected.length;
            const aov = orders_count > 0 ? gross / orders_count : 0;
            const TERMINAL = new Set(["delivered", "completed", "rejected", "cancelled", "refund_delivered"]);
            const attempted = oList.filter((o) => TERMINAL.has(o.status as string) || o.is_return).length;
            const delivery_rate = attempted > 0 ? Math.min(100, (delivered_count / attempted) * 100) : 0;

            // time series
            const map = new Map<string, BucketPoint>();
            for (const o of oList) {
                const d = toDate(o.created_at);
                const { key, ts } = bucketKey(d, granularity);
                if (!map.has(key)) {
                    map.set(key, {
                        bucket: key, ts, revenue: 0, delivered_revenue: 0, orders: 0, delivered: 0,
                        product_cost: 0, delivery_cost: 0, discount: 0, expenses: 0, profit: 0,
                    });
                }
                const b = map.get(key)!;
                if (o.status !== "rejected" && !o.is_return) {
                    b.revenue += o.price || 0;
                    b.orders++;
                }
                if (o.status === "delivered" || o.status === "completed") {
                    b.delivered_revenue += o.price || 0;
                    b.delivered++;
                    if (o.items) {
                        for (const it of o.items) b.product_cost += findProductCost(it, products);
                    }
                }
                b.delivery_cost += o.delivery_fee || o.delivery_cost || 0;
                b.discount += o.discount_amount || 0;
            }
            for (const e of eList) {
                const d = toDate(e.expense_date);
                const { key, ts } = bucketKey(d, granularity);
                if (!map.has(key)) {
                    map.set(key, {
                        bucket: key, ts, revenue: 0, delivered_revenue: 0, orders: 0, delivered: 0,
                        product_cost: 0, delivery_cost: 0, discount: 0, expenses: 0, profit: 0,
                    });
                }
                map.get(key)!.expenses += e.amount;
            }
            // fill zero buckets across the interval (nicer charts)
            const cursor = new Date(interval.start);
            cursor.setHours(0, 0, 0, 0);
            const end = new Date(interval.end);
            end.setHours(0, 0, 0, 0);
            while (cursor <= end) {
                const { key, ts } = bucketKey(cursor, granularity);
                if (!map.has(key)) {
                    map.set(key, {
                        bucket: key, ts, revenue: 0, delivered_revenue: 0, orders: 0, delivered: 0,
                        product_cost: 0, delivery_cost: 0, discount: 0, expenses: 0, profit: 0,
                    });
                }
                if (granularity === "day") cursor.setDate(cursor.getDate() + 1);
                else if (granularity === "week") cursor.setDate(cursor.getDate() + 7);
                else if (granularity === "quarter") cursor.setMonth(cursor.getMonth() + 3);
                else if (granularity === "year") cursor.setFullYear(cursor.getFullYear() + 1);
                else cursor.setMonth(cursor.getMonth() + 1);
            }
            const series = Array.from(map.values()).sort((a, b) => a.ts - b.ts);
            for (const s of series) s.profit = s.delivered_revenue - s.product_cost - s.delivery_cost - s.expenses;

            return {
                gross_revenue: gross,
                delivered_revenue,
                refund_value,
                product_cost,
                delivery_cost: delivery_cost_sum,
                discount: discount_sum,
                expenses: expense_total,
                marketing_cost,
                gross_profit,
                net_profit,
                margin_pct,
                orders_count,
                delivered_count,
                aov,
                delivery_rate,
                cash_realized,
                cash_float,
                series,
            };
        };

        const curr = calc(currOrders, currExpenses, current);
        const prev = previous
            ? calc(prevOrders, [], previous)
            : null;

        // Breakdowns on current period
        const byChannel = new Map<string, { revenue: number; orders: number; profit: number }>();
        const byCity = new Map<string, { revenue: number; orders: number; profit: number; delivered: number }>();
        const byProduct = new Map<string, { revenue: number; units: number; profit: number }>();
        const byPayment = new Map<string, { revenue: number; orders: number }>();
        const prevByChannel = new Map<string, number>();
        const prevByProduct = new Map<string, number>();

        for (const o of currOrders) {
            if (o.status === "rejected" || o.is_return) continue;
            const val = o.price || 0;
            // channel
            const ch = o.source || "other";
            const chEntry = byChannel.get(ch) || { revenue: 0, orders: 0, profit: 0 };
            chEntry.revenue += val;
            chEntry.orders++;
            byChannel.set(ch, chEntry);
            // city
            const ci = o.city || o.governorate_code || "Unknown";
            const ciEntry = byCity.get(ci) || { revenue: 0, orders: 0, profit: 0, delivered: 0 };
            ciEntry.revenue += val;
            ciEntry.orders++;
            if (o.status === "delivered") ciEntry.delivered++;
            byCity.set(ci, ciEntry);
            // payment
            const pay = o.payment_status || "pending";
            const payEntry = byPayment.get(pay) || { revenue: 0, orders: 0 };
            payEntry.revenue += val;
            payEntry.orders++;
            byPayment.set(pay, payEntry);
            // product
            for (const it of o.items || []) {
                const key = it.name || "Unknown";
                const cost = findProductCost(it, products) || 0;
                const profit = (it.price || 0) * it.quantity - cost;
                const prod = byProduct.get(key) || { revenue: 0, units: 0, profit: 0 };
                prod.revenue += (it.price || 0) * it.quantity;
                prod.units += it.quantity;
                if (o.status === "delivered") prod.profit += profit;
                byProduct.set(key, prod);
            }
        }

        for (const o of prevOrders) {
            if (o.status === "rejected" || o.is_return) continue;
            const ch = o.source || "other";
            prevByChannel.set(ch, (prevByChannel.get(ch) || 0) + (o.price || 0));
            for (const it of o.items || []) {
                const key = it.name || "Unknown";
                prevByProduct.set(key, (prevByProduct.get(key) || 0) + (it.price || 0) * it.quantity);
            }
        }

        // Attribute channel profit pro-rata from curr.net_profit (approximation)
        const totalRev = Array.from(byChannel.values()).reduce((s, c) => s + c.revenue, 0) || 1;
        const channels = Array.from(byChannel.entries())
            .map(([k, v]) => ({
                key: k,
                label: CHANNEL_LABELS[k] || k,
                revenue: v.revenue,
                orders: v.orders,
                profit: (v.revenue / totalRev) * curr.net_profit,
            }))
            .sort((a, b) => b.revenue - a.revenue);

        const cities = Array.from(byCity.entries())
            .map(([k, v]) => ({
                key: k,
                label: k,
                revenue: v.revenue,
                orders: v.orders,
                delivered: v.delivered,
                profit: (v.revenue / totalRev) * curr.net_profit,
            }))
            .sort((a, b) => b.revenue - a.revenue);

        const productList = Array.from(byProduct.entries())
            .map(([k, v]) => ({
                key: k,
                label: k,
                revenue: v.revenue,
                units: v.units,
                profit: v.profit,
                margin: v.revenue > 0 ? (v.profit / v.revenue) * 100 : 0,
            }))
            .sort((a, b) => b.revenue - a.revenue);

        const payments = Array.from(byPayment.entries())
            .map(([k, v]) => ({ key: k, label: PAYMENT_LABELS[k] || k, revenue: v.revenue, orders: v.orders }))
            .sort((a, b) => b.revenue - a.revenue);

        // Movers
        let topGainerProduct: FinanceOverviewResult["top_gainer_product"] = null;
        let topLoserProduct: FinanceOverviewResult["top_loser_product"] = null;
        for (const p of productList) {
            const prevRev = prevByProduct.get(p.key) || 0;
            const delta = p.revenue - prevRev;
            if (!topGainerProduct || delta > topGainerProduct.delta) {
                topGainerProduct = { name: p.label, delta, revenue: p.revenue };
            }
            if (!topLoserProduct || delta < topLoserProduct.delta) {
                topLoserProduct = { name: p.label, delta, revenue: p.revenue };
            }
        }

        let topGainerChannel: FinanceOverviewResult["top_gainer_channel"] = null;
        let topLoserChannel: FinanceOverviewResult["top_loser_channel"] = null;
        for (const c of channels) {
            const prevRev = prevByChannel.get(c.key) || 0;
            const delta = c.revenue - prevRev;
            if (!topGainerChannel || delta > topGainerChannel.delta) {
                topGainerChannel = { name: c.label, delta, revenue: c.revenue };
            }
            if (!topLoserChannel || delta < topLoserChannel.delta) {
                topLoserChannel = { name: c.label, delta, revenue: c.revenue };
            }
        }

        return {
            gross_revenue: curr.gross_revenue,
            net_revenue: curr.gross_revenue - curr.refund_value,
            delivered_revenue: curr.delivered_revenue,
            refund_value: curr.refund_value,
            product_cost: curr.product_cost,
            delivery_cost: curr.delivery_cost,
            discount: curr.discount,
            expenses: curr.expenses,
            marketing_cost: curr.marketing_cost,
            gross_profit: curr.gross_profit,
            net_profit: curr.net_profit,
            margin_pct: curr.margin_pct,
            orders_count: curr.orders_count,
            delivered_count: curr.delivered_count,
            aov: curr.aov,
            delivery_rate: curr.delivery_rate,
            cash_realized: curr.cash_realized,
            cash_float: curr.cash_float,
            series: curr.series,
            compareSeries: prev?.series || [],
            prev_gross_revenue: prev?.gross_revenue || 0,
            prev_net_profit: prev?.net_profit || 0,
            prev_orders_count: prev?.orders_count || 0,
            prev_delivered_count: prev?.delivered_count || 0,
            prev_aov: prev?.aov || 0,
            prev_cash_realized: prev?.cash_realized || 0,
            by_channel: channels,
            by_city: cities,
            by_product: productList,
            by_payment: payments,
            top_gainer_product: topGainerProduct,
            top_loser_product: topLoserProduct,
            top_gainer_channel: topGainerChannel,
            top_loser_channel: topLoserChannel,
        };
    }, [orders, products, expenses, current, previous, granularity]);
}
