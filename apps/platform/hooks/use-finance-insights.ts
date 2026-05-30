"use client";

import { useMemo } from "react";
import type { FinanceOverviewResult } from "./use-finance-overview";

export type InsightSeverity = "info" | "positive" | "warning" | "critical";

export interface Insight {
    id: string;
    severity: InsightSeverity;
    title: string;
    detail: string;
    metric?: { label: string; value: string };
    suggestion?: string;
}

function formatIQD(n: number): string {
    const abs = Math.abs(n);
    if (abs >= 1_000_000) return `${n < 0 ? "-" : ""}${(abs / 1_000_000).toFixed(1)}M IQD`;
    if (abs >= 1_000) return `${n < 0 ? "-" : ""}${(abs / 1_000).toFixed(0)}K IQD`;
    return `${n.toLocaleString()} IQD`;
}

function pct(curr: number, prev: number): number {
    if (prev === 0) return curr === 0 ? 0 : 100;
    return ((curr - prev) / Math.abs(prev)) * 100;
}

export function useFinanceInsights(data: FinanceOverviewResult): Insight[] {
    return useMemo(() => {
        const out: Insight[] = [];

        // 1. Revenue trajectory
        if (data.prev_gross_revenue > 0) {
            const change = pct(data.gross_revenue, data.prev_gross_revenue);
            if (change <= -15) {
                out.push({
                    id: "revenue_drop",
                    severity: "critical",
                    title: "Revenue is down sharply vs. last period",
                    detail: `Gross revenue fell ${Math.abs(change).toFixed(1)}% — from ${formatIQD(data.prev_gross_revenue)} to ${formatIQD(data.gross_revenue)}.`,
                    metric: { label: "Δ Revenue", value: `${change.toFixed(1)}%` },
                    suggestion: "Check channel mix below — most drops concentrate in one source.",
                });
            } else if (change >= 15) {
                out.push({
                    id: "revenue_up",
                    severity: "positive",
                    title: "Revenue is up materially vs. last period",
                    detail: `Gross revenue grew ${change.toFixed(1)}% — from ${formatIQD(data.prev_gross_revenue)} to ${formatIQD(data.gross_revenue)}.`,
                    metric: { label: "Δ Revenue", value: `+${change.toFixed(1)}%` },
                    suggestion: "Identify the channel carrying the growth and double down.",
                });
            }
        }

        // 2. Margin health
        if (data.delivered_revenue > 0) {
            if (data.margin_pct < 5 && data.net_profit < 0) {
                out.push({
                    id: "margin_negative",
                    severity: "critical",
                    title: "You are losing money this period",
                    detail: `Net profit is ${formatIQD(data.net_profit)}. After COGS (${formatIQD(data.product_cost)}), delivery (${formatIQD(data.delivery_cost)}) and expenses (${formatIQD(data.expenses)}), the math doesn't work.`,
                    metric: { label: "Margin", value: `${data.margin_pct.toFixed(1)}%` },
                    suggestion: "Review discount-heavy SKUs and high-delivery-fee cities.",
                });
            } else if (data.margin_pct > 0 && data.margin_pct < 10) {
                out.push({
                    id: "margin_thin",
                    severity: "warning",
                    title: "Margins are thin",
                    detail: `Net margin is ${data.margin_pct.toFixed(1)}%. A small cost spike or return wave could flip you to loss.`,
                    metric: { label: "Margin", value: `${data.margin_pct.toFixed(1)}%` },
                    suggestion: "Look at Products tab — quickly cut the lowest-margin SKUs.",
                });
            } else if (data.margin_pct >= 25) {
                out.push({
                    id: "margin_strong",
                    severity: "positive",
                    title: "Margins are healthy",
                    detail: `Net margin is ${data.margin_pct.toFixed(1)}% — well above the 10–15% typical for COD e-commerce.`,
                    metric: { label: "Margin", value: `${data.margin_pct.toFixed(1)}%` },
                });
            }
        }

        // 3. Cash concentration
        if (data.cash_float > data.cash_realized && data.cash_float > 500_000) {
            out.push({
                id: "cash_float_high",
                severity: "warning",
                title: "A lot of your money is in transit",
                detail: `${formatIQD(data.cash_float)} is tied up in confirmed/in-transit orders vs. ${formatIQD(data.cash_realized)} realized. Collection risk matters here.`,
                suggestion: "Check Cash & COD tab for aging — flag orders older than 7 days.",
            });
        }

        // 4. Delivery rate — orders_count already includes delivered, so just gate
        // on total order volume to keep this signal-driven not noise on tiny periods.
        if (data.orders_count >= 20) {
            if (data.delivery_rate < 70) {
                out.push({
                    id: "delivery_rate_low",
                    severity: "warning",
                    title: "Delivery rate is below target",
                    detail: `Only ${data.delivery_rate.toFixed(1)}% of attempted deliveries succeed. Every failed delivery costs you shipping without revenue.`,
                    metric: { label: "Delivery", value: `${data.delivery_rate.toFixed(1)}%` },
                });
            } else if (data.delivery_rate >= 90) {
                out.push({
                    id: "delivery_rate_high",
                    severity: "positive",
                    title: "Excellent delivery rate",
                    detail: `${data.delivery_rate.toFixed(1)}% delivery success — top-decile for this region.`,
                    metric: { label: "Delivery", value: `${data.delivery_rate.toFixed(1)}%` },
                });
            }
        }

        // 5. Mover-level insight
        if (data.top_loser_product && data.top_loser_product.delta < -200_000) {
            out.push({
                id: "product_loser",
                severity: "warning",
                title: `${data.top_loser_product.name} is bleeding revenue`,
                detail: `This SKU dropped ${formatIQD(data.top_loser_product.delta)} vs. last period.`,
                suggestion: "Check stock availability, price changes, or seasonal effect.",
            });
        }
        if (data.top_gainer_product && data.top_gainer_product.delta > 200_000) {
            out.push({
                id: "product_gainer",
                severity: "positive",
                title: `${data.top_gainer_product.name} is carrying growth`,
                detail: `This SKU added ${formatIQD(data.top_gainer_product.delta)} vs. last period.`,
                suggestion: "Ensure inventory can keep up.",
            });
        }

        // 6. Discount burn
        if (data.gross_revenue > 0 && data.discount / data.gross_revenue > 0.1) {
            const ratio = (data.discount / data.gross_revenue) * 100;
            out.push({
                id: "discount_high",
                severity: "warning",
                title: "Discounts are eating revenue",
                detail: `${ratio.toFixed(1)}% of gross revenue (${formatIQD(data.discount)}) is given as discount. That's high.`,
                suggestion: "Review which channels/products are discount-heavy.",
            });
        }

        // 7. Marketing ROI
        if (data.marketing_cost > 0 && data.delivered_revenue > 0) {
            const roas = data.delivered_revenue / data.marketing_cost;
            if (roas < 2) {
                out.push({
                    id: "roas_low",
                    severity: "warning",
                    title: "Marketing ROAS is weak",
                    detail: `Every 1 IQD spent on marketing returned ${roas.toFixed(2)} IQD in delivered revenue. Below 2x is bleeding.`,
                });
            } else if (roas > 5) {
                out.push({
                    id: "roas_high",
                    severity: "positive",
                    title: "Marketing is printing money",
                    detail: `Every 1 IQD spent returned ${roas.toFixed(1)} IQD delivered. Consider scaling spend.`,
                });
            }
        }

        // 8. Channel concentration risk — single point of failure if one channel
        // owns most of revenue. Flag if top channel ≥ 70% of revenue and there's
        // enough volume to matter.
        if (data.by_channel.length >= 2 && data.gross_revenue > 100_000) {
            const top = data.by_channel[0];
            const share = (top.revenue / data.gross_revenue) * 100;
            if (share >= 70) {
                out.push({
                    id: "channel_concentration",
                    severity: "warning",
                    title: `${top.label} carries ${share.toFixed(0)}% of revenue`,
                    detail: `If ${top.label} pauses, ${formatIQD(top.revenue)} of revenue is at risk overnight. Most healthy mixes keep the top channel under 60%.`,
                    metric: { label: "Top channel share", value: `${share.toFixed(0)}%` },
                    suggestion: "Diversify acquisition — invest in the #2 and #3 channels.",
                });
            }
        }

        // 9. Product concentration risk — same idea at SKU level.
        if (data.by_product.length >= 2 && data.gross_revenue > 100_000) {
            const top = data.by_product[0];
            const share = (top.revenue / data.gross_revenue) * 100;
            if (share >= 50) {
                out.push({
                    id: "product_concentration",
                    severity: "warning",
                    title: `${top.label} is ${share.toFixed(0)}% of the catalog`,
                    detail: `One SKU drives ${formatIQD(top.revenue)} this period. A stockout, supplier issue, or trend shift would crater revenue.`,
                    metric: { label: "Top SKU share", value: `${share.toFixed(0)}%` },
                    suggestion: "Build the bench — promote 2-3 secondary winners from the Products tab.",
                });
            }
        }

        // 10. AOV drift — average order value moved meaningfully vs. previous period.
        // Useful because revenue can stay flat while AOV (and unit economics) shift.
        if (data.prev_aov > 0 && data.aov > 0) {
            const aovChange = pct(data.aov, data.prev_aov);
            if (aovChange <= -10) {
                out.push({
                    id: "aov_dropped",
                    severity: "warning",
                    title: "Average order value has slipped",
                    detail: `AOV fell from ${formatIQD(data.prev_aov)} to ${formatIQD(data.aov)} (${aovChange.toFixed(1)}%). Same orders, smaller baskets — margin compresses fast.`,
                    metric: { label: "Δ AOV", value: `${aovChange.toFixed(1)}%` },
                    suggestion: "Check if discounts, smaller-unit SKUs, or lighter bundles are dominating new orders.",
                });
            } else if (aovChange >= 15) {
                out.push({
                    id: "aov_grew",
                    severity: "positive",
                    title: "Average order value is climbing",
                    detail: `AOV rose from ${formatIQD(data.prev_aov)} to ${formatIQD(data.aov)} (+${aovChange.toFixed(1)}%). Customers are buying bigger baskets.`,
                    metric: { label: "Δ AOV", value: `+${aovChange.toFixed(1)}%` },
                });
            }
        }

        // 11. City-level delivery outlier — flag a major city where delivery rate
        // is meaningfully worse than the rest. Cuts margin and signals courier issues.
        const sizableCities = data.by_city.filter((c) => c.orders >= 5);
        if (sizableCities.length >= 3) {
            const cityRates = sizableCities.map((c) => ({
                label: c.label,
                rate: c.orders > 0 ? (c.delivered / c.orders) * 100 : 0,
                orders: c.orders,
                revenue: c.revenue,
            }));
            const avgRate = cityRates.reduce((s, c) => s + c.rate, 0) / cityRates.length;
            const worst = cityRates.reduce((w, c) => (c.rate < w.rate ? c : w));
            // 20-point gap below average and worst is meaningfully volume
            if (avgRate - worst.rate >= 20 && worst.orders >= 5) {
                out.push({
                    id: "city_delivery_outlier",
                    severity: "warning",
                    title: `${worst.label} delivery rate is ${(avgRate - worst.rate).toFixed(0)}pt below average`,
                    detail: `Across other cities you deliver ~${avgRate.toFixed(0)}% of orders. In ${worst.label} only ${worst.rate.toFixed(0)}% are landing across ${worst.orders} attempts.`,
                    metric: { label: `${worst.label}`, value: `${worst.rate.toFixed(0)}%` },
                    suggestion: "Audit the courier handoff for that governorate or surge a different last-mile partner.",
                });
            }
        }

        // If totally silent, provide a neutral insight so the banner isn't empty
        if (out.length === 0 && data.orders_count > 0) {
            out.push({
                id: "neutral",
                severity: "info",
                title: "Things look steady",
                detail: `${data.orders_count} orders this period, ${formatIQD(data.gross_revenue)} revenue, ${data.margin_pct.toFixed(1)}% net margin.`,
            });
        }

        // Sort by severity so the most actionable insight is on page 1.
        // critical → warning → positive → info.
        const severityRank: Record<InsightSeverity, number> = {
            critical: 0,
            warning: 1,
            positive: 2,
            info: 3,
        };
        out.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);

        return out;
    }, [data]);
}
