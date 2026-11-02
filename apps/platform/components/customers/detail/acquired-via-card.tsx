"use client";

import { useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useLanguage } from "@/hooks/use-language";
import { useMetaAdsConnection, useMetaAdsReport } from "@/hooks/use-meta-ads";
import { useCustomerAdOrders } from "@/hooks/use-customer-ad-orders";
import { matchOrdersToCampaigns } from "@/lib/ads-report";
import { acquisitionMultiple, firstAdOrder } from "@/lib/customer-acquisition";
import { campaignAdCostPerOrder } from "@/lib/order-ad-profit";
import { canAccessRoute } from "@/lib/route-permissions";
import { storedPhoneVariants } from "@/lib/order-server-search";
import { formatDate, formatIQD } from "@/lib/utils";
import type { AdAttribution } from "@/lib/ad-attribution";

function Stat({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex flex-col gap-0.5">
            <span className="text-xs text-muted">{label}</span>
            <span className="font-medium tabular-nums text-foreground">{value}</span>
        </div>
    );
}

function AcquiredViaBody({ phone, lifetimeValue }: { phone: string; lifetimeValue: number }) {
    const { t } = useLanguage();
    const variants = useMemo(() => storedPhoneVariants(phone), [phone]);
    const orders = useCustomerAdOrders(variants, true).data;
    const report = useMetaAdsReport("30", false).current.data;

    const first = orders ? firstAdOrder(orders) : null;
    if (!first) return null;

    const attribution = first.attribution as AdAttribution | null;
    const campaignId = report
        ? [...matchOrdersToCampaigns(report.campaigns, [{ ad_channel: first.ad_channel, attribution: first.attribution }]).byCampaign.keys()][0]
        : undefined;
    const campaign = report?.campaigns.find((c) => c.campaignId === campaignId);
    const campaignName = campaign?.campaignName ?? attribution?.campaign ?? null;
    const cost = campaign ? campaignAdCostPerOrder(campaign) : null;
    const multiple = acquisitionMultiple(lifetimeValue, cost);

    return (
        <section className="bg-(--card-bg) rounded-2xl px-6 py-5 border border-(--card-border) shadow-[0_1px_3px_rgba(0,0,0,0.04)]" data-testid="acquired-via-card">
            <h3 className="font-headline font-extrabold text-lg text-foreground mb-3">{t("customers.profile.acquiredVia.title")}</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <Stat label={t("customers.profile.acquiredVia.campaign")} value={campaignName ?? t("customers.profile.acquiredVia.unknown")} />
                <Stat label={t("customers.profile.acquiredVia.channel")} value={`${first.ad_channel ?? ""} · ${formatDate(first.created_at)}`} />
                <Stat label={t("customers.profile.acquiredVia.cost")} value={cost === null ? "—" : formatIQD(cost)} />
                <Stat label={t("customers.profile.acquiredVia.value")} value={multiple === null ? formatIQD(lifetimeValue) : `${formatIQD(lifetimeValue)} (×${multiple})`} />
            </div>
            {cost !== null && <p className="mt-3 text-xs text-muted">{t("customers.profile.acquiredVia.note")}</p>}
        </section>
    );
}

/**
 * Where this customer came from, based on their first order that carried an ad link. For people who may open
 * /ads (it shows ad cost), on connected stores. Customers who came with no ad link show no card.
 */
export function AcquiredViaCard({ phone, lifetimeValue }: { phone: string; lifetimeValue: number }) {
    const { role, permissions } = useAuth();
    const connection = useMetaAdsConnection();
    if (!canAccessRoute("/ads", role, permissions) || !connection.data) return null;
    return <AcquiredViaBody phone={phone} lifetimeValue={lifetimeValue} />;
}
