"use client";

import { useAuth } from "@/hooks/use-auth";
import { useLanguage } from "@/hooks/use-language";
import { useMetaAdsConnection, useMetaAdsReport } from "@/hooks/use-meta-ads";
import { useProductsCrud } from "@/hooks/use-products-crud";
import { useOrderCostDefaults } from "@/hooks/use-order-cost-defaults";
import { useOrderCostSnapshots } from "@/hooks/use-order-cost-snapshots";
import { useOrderProfits } from "@/hooks/use-order-profits";
import { matchOrdersToCampaigns } from "@/lib/ads-report";
import { adProfitLines, campaignAdCostPerOrder, showsAdProfit } from "@/lib/order-ad-profit";
import { canAccessRoute } from "@/lib/route-permissions";
import { cn, formatIQD } from "@/lib/utils";
import type { Order } from "@/types/order";

function Line({ label, value, tone }: { label: string; value: string; tone?: "neg" | "pos" }) {
    return (
        <div className="flex justify-between gap-3 border-t border-[var(--card-border)] py-2 first:border-t-0">
            <span className="text-muted">{label}</span>
            <span className={cn("font-medium tabular-nums", tone === "neg" && "text-red-600", tone === "pos" && "text-emerald-600")}>{value}</span>
        </div>
    );
}

function AdProfitCard({ order }: { order: Order }) {
    const { t } = useLanguage();
    const report = useMetaAdsReport("30", false).current.data;
    const { products } = useProductsCrud();
    const snapshots = useOrderCostSnapshots();
    const costDefaults = useOrderCostDefaults();
    const { calculateOrderCost } = useOrderProfits([], products, 0, snapshots, costDefaults);

    if (!report) return null;
    const campaignId = [...matchOrdersToCampaigns(report.campaigns, [{ ad_channel: order.ad_channel ?? null, attribution: order.attribution }]).byCampaign.keys()][0];
    const campaign = report.campaigns.find((c) => c.campaignId === campaignId);
    const adCost = campaign ? campaignAdCostPerOrder(campaign) : null;
    if (!campaign || adCost === null) return null;

    const lines = adProfitLines(calculateOrderCost(order), adCost);
    return (
        <section className="rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] p-4 text-sm" data-testid="order-ad-profit">
            <div className="flex flex-col">
                <Line label={t("orders.adProfit.total")} value={formatIQD(lines.revenue)} />
                <Line label={t("orders.adProfit.productCost")} value={`− ${formatIQD(lines.productCost)}`} tone="neg" />
                <Line label={t("orders.adProfit.otherCosts")} value={`− ${formatIQD(lines.otherCosts)}`} tone="neg" />
                <Line label={t("orders.adProfit.adCost").replace("{campaign}", campaign.campaignName)} value={`− ${formatIQD(lines.adCost)}`} tone="neg" />
                <Line label={t("orders.adProfit.profit")} value={formatIQD(lines.profitAfterAds)} tone={lines.profitAfterAds < 0 ? "neg" : "pos"} />
            </div>
            <p className="mt-2 text-xs text-muted">{t("orders.adProfit.note")}</p>
        </section>
    );
}

/**
 * Profit after the campaign's average ad cost, in the order details. Only for people who may open /ads
 * (they also see cost), on connected stores, for live sales that came in through an ad campaign.
 * Ad spend is already an expense in Finances, so this is a view: nothing is subtracted twice anywhere.
 */
export function OrderAdProfit({ order }: { order: Order }) {
    const { role, permissions } = useAuth();
    const connection = useMetaAdsConnection();
    if (!order.ad_channel || !showsAdProfit(order) || !canAccessRoute("/ads", role, permissions) || !connection.data) return null;
    return <AdProfitCard order={order} />;
}
