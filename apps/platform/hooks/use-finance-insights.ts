"use client";

import { useMemo } from "react";
import { useLanguage } from "@/hooks/use-language";
import type { FinanceOverviewResult } from "./use-finance-overview";

export type InsightSeverity = "info" | "positive" | "warning" | "critical";

/**
 * A finding about the period. The hook decides *what* is true and the banner
 * words it: `finances.insight.<id>.title|detail|suggestion` in the active
 * language, filled from `vars`.
 */
export interface Insight {
    id: string;
    severity: InsightSeverity;
    vars: Record<string, string | number>;
    metric?: { labelKey: string; value: string; labelVar?: string };
    hasSuggestion: boolean;
}

/** The words around an amount; the hook fills them from the active language. */
export interface MoneyUnits {
    iqd: string;
    thousand: string;
    million: string;
}

const EN_UNITS: MoneyUnits = { iqd: "IQD", thousand: "K", million: "M" };

export function formatIQD(n: number, units: MoneyUnits = EN_UNITS): string {
    const abs = Math.abs(n);
    const sign = n < 0 ? "-" : "";
    if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}${units.million} ${units.iqd}`;
    if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(0)}${units.thousand} ${units.iqd}`;
    return `${n.toLocaleString("en-US")} ${units.iqd}`;
}

function pct(curr: number, prev: number): number {
    if (prev === 0) return curr === 0 ? 0 : 100;
    return ((curr - prev) / Math.abs(prev)) * 100;
}

const SEVERITY_RANK: Record<InsightSeverity, number> = { critical: 0, warning: 1, positive: 2, info: 3 };

export function buildFinanceInsights(data: FinanceOverviewResult, units: MoneyUnits = EN_UNITS): Insight[] {
    const iqd = (n: number) => formatIQD(n, units);
    const out: Insight[] = [];

    // 1. Revenue trajectory
    if (data.prev_gross_revenue > 0) {
        const change = pct(data.gross_revenue, data.prev_gross_revenue);
        const vars = {
            pct: Math.abs(change).toFixed(1),
            from: iqd(data.prev_gross_revenue),
            to: iqd(data.gross_revenue),
        };
        if (change <= -15) {
            out.push({
                id: "revenue_drop", severity: "critical", vars, hasSuggestion: true,
                metric: { labelKey: "finances.insight.metric.revenue", value: `${change.toFixed(1)}%` },
            });
        } else if (change >= 15) {
            out.push({
                id: "revenue_up", severity: "positive", vars, hasSuggestion: true,
                metric: { labelKey: "finances.insight.metric.revenue", value: `+${change.toFixed(1)}%` },
            });
        }
    }

    // 2. Margin health
    if (data.delivered_revenue > 0) {
        const margin = data.margin_pct.toFixed(1);
        const metric = { labelKey: "finances.insight.metric.margin", value: `${margin}%` };
        if (data.margin_pct < 5 && data.net_profit < 0) {
            out.push({
                id: "margin_negative", severity: "critical", hasSuggestion: true, metric,
                vars: {
                    profit: iqd(data.net_profit), cogs: iqd(data.product_cost),
                    refunds: iqd(data.refund_value), expenses: iqd(data.expenses),
                },
            });
        } else if (data.margin_pct > 0 && data.margin_pct < 10) {
            out.push({ id: "margin_thin", severity: "warning", hasSuggestion: true, metric, vars: { margin } });
        } else if (data.margin_pct >= 25) {
            out.push({ id: "margin_strong", severity: "positive", hasSuggestion: false, metric, vars: { margin } });
        }
    }

    // 3. Cash concentration
    if (data.cash_float > data.cash_realized && data.cash_float > 500_000) {
        out.push({
            id: "cash_float_high", severity: "warning", hasSuggestion: true,
            vars: { float: iqd(data.cash_float), realized: iqd(data.cash_realized) },
        });
    }

    // 4. Delivery rate, only on enough volume to mean something.
    if (data.orders_count >= 20) {
        const rate = data.delivery_rate.toFixed(1);
        const metric = { labelKey: "finances.insight.metric.delivery", value: `${rate}%` };
        if (data.delivery_rate < 70) {
            out.push({ id: "delivery_rate_low", severity: "warning", hasSuggestion: false, metric, vars: { rate } });
        } else if (data.delivery_rate >= 90) {
            out.push({ id: "delivery_rate_high", severity: "positive", hasSuggestion: false, metric, vars: { rate } });
        }
    }

    // 5. Mover-level insight
    if (data.top_loser_product && data.top_loser_product.delta < -200_000) {
        out.push({
            id: "product_loser", severity: "warning", hasSuggestion: true,
            vars: { name: data.top_loser_product.name, delta: iqd(data.top_loser_product.delta) },
        });
    }
    if (data.top_gainer_product && data.top_gainer_product.delta > 200_000) {
        out.push({
            id: "product_gainer", severity: "positive", hasSuggestion: true,
            vars: { name: data.top_gainer_product.name, delta: iqd(data.top_gainer_product.delta) },
        });
    }

    // 6. Discount burn
    if (data.gross_revenue > 0 && data.discount / data.gross_revenue > 0.1) {
        out.push({
            id: "discount_high", severity: "warning", hasSuggestion: true,
            vars: { pct: ((data.discount / data.gross_revenue) * 100).toFixed(1), amount: iqd(data.discount) },
        });
    }

    // 7. Marketing return on spend
    if (data.marketing_cost > 0 && data.delivered_revenue > 0) {
        const roas = data.delivered_revenue / data.marketing_cost;
        if (roas < 2) {
            out.push({ id: "roas_low", severity: "warning", hasSuggestion: false, vars: { roas: roas.toFixed(2) } });
        } else if (roas > 5) {
            out.push({ id: "roas_high", severity: "positive", hasSuggestion: false, vars: { roas: roas.toFixed(1) } });
        }
    }

    // 8. Channel concentration: one channel owning most of the revenue is a single point of failure.
    if (data.by_channel.length >= 2 && data.gross_revenue > 100_000) {
        const top = data.by_channel[0];
        const share = (top.revenue / data.gross_revenue) * 100;
        if (share >= 70) {
            out.push({
                id: "channel_concentration", severity: "warning", hasSuggestion: true,
                vars: { name: top.label, share: share.toFixed(0), amount: iqd(top.revenue) },
                metric: { labelKey: "finances.insight.metric.topChannel", value: `${share.toFixed(0)}%` },
            });
        }
    }

    // 9. Product concentration, the same idea per product.
    if (data.by_product.length >= 2 && data.gross_revenue > 100_000) {
        const top = data.by_product[0];
        const share = (top.revenue / data.gross_revenue) * 100;
        if (share >= 50) {
            out.push({
                id: "product_concentration", severity: "warning", hasSuggestion: true,
                vars: { name: top.label, share: share.toFixed(0), amount: iqd(top.revenue) },
                metric: { labelKey: "finances.insight.metric.topProduct", value: `${share.toFixed(0)}%` },
            });
        }
    }

    // 10. Average order value drift: revenue can stay flat while basket size shifts.
    if (data.prev_aov > 0 && data.aov > 0) {
        const change = pct(data.aov, data.prev_aov);
        const vars = { from: iqd(data.prev_aov), to: iqd(data.aov), pct: Math.abs(change).toFixed(1) };
        if (change <= -10) {
            out.push({
                id: "aov_dropped", severity: "warning", hasSuggestion: true, vars,
                metric: { labelKey: "finances.insight.metric.aov", value: `${change.toFixed(1)}%` },
            });
        } else if (change >= 15) {
            out.push({
                id: "aov_grew", severity: "positive", hasSuggestion: false, vars,
                metric: { labelKey: "finances.insight.metric.aov", value: `+${change.toFixed(1)}%` },
            });
        }
    }

    // 11. A sizable city whose delivery rate is far below the others.
    const sizableCities = data.by_city.filter((c) => c.orders >= 5);
    if (sizableCities.length >= 3) {
        const cityRates = sizableCities.map((c) => ({
            label: c.label,
            rate: c.orders > 0 ? (c.delivered / c.orders) * 100 : 0,
            orders: c.orders,
        }));
        const avgRate = cityRates.reduce((s, c) => s + c.rate, 0) / cityRates.length;
        const worst = cityRates.reduce((w, c) => (c.rate < w.rate ? c : w));
        if (avgRate - worst.rate >= 20 && worst.orders >= 5) {
            out.push({
                id: "city_delivery_outlier", severity: "warning", hasSuggestion: true,
                vars: {
                    city: worst.label, gap: (avgRate - worst.rate).toFixed(0), avg: avgRate.toFixed(0),
                    rate: worst.rate.toFixed(0), orders: worst.orders,
                },
                metric: { labelKey: "", labelVar: worst.label, value: `${worst.rate.toFixed(0)}%` },
            });
        }
    }

    // Nothing stood out: say so, so the banner is not empty.
    if (out.length === 0 && data.orders_count > 0) {
        out.push({
            id: "neutral", severity: "info", hasSuggestion: false,
            vars: { orders: data.orders_count, revenue: iqd(data.gross_revenue), margin: data.margin_pct.toFixed(1) },
        });
    }

    // Most actionable first: critical, warning, positive, info.
    return out.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
}

export function useFinanceInsights(data: FinanceOverviewResult): Insight[] {
    const { t } = useLanguage();
    const iqd = t("common.iqd");
    const thousand = t("finances.insight.unitThousand");
    const million = t("finances.insight.unitMillion");
    return useMemo(() => buildFinanceInsights(data, { iqd, thousand, million }), [data, iqd, thousand, million]);
}
