// =============================================
// AD-CAMPAIGN FILTER
//
// The campaign name an order's ad link carried (`orders.attribution.campaign`).
// Names are compared ignoring case and spacing, the same rule the Ads page uses
// to credit orders to Meta campaigns, so "Fusion " and "fusion" are one campaign.
// The predicate and the tally live together so a dropdown count is exactly the
// length of the list it opens.
// =============================================

import type { Order } from "@/types/order";

/** Filter value for orders whose link carried no campaign name (including non-ad orders). */
export const NO_CAMPAIGN = "__none__";

export function normalizeCampaign(name: string): string {
    return name.trim().replace(/\s+/g, " ").toLowerCase();
}

/** The order's normalized campaign key, or null when it carries none. */
export function campaignKeyOf(order: Pick<Order, "attribution">): string | null {
    const name = order.attribution?.campaign;
    if (typeof name !== "string") return null;
    const key = normalizeCampaign(name);
    return key === "" ? null : key;
}

/** True when the order belongs to the selected campaign; no selection matches everything. */
export function orderMatchesAdCampaign(order: Pick<Order, "attribution">, campaign: string | undefined | null): boolean {
    if (!campaign) return true;
    const key = campaignKeyOf(order);
    return campaign === NO_CAMPAIGN ? key === null : key === campaign;
}

export interface CampaignStat {
    /** Normalized key; the filter value. */
    key: string;
    /** The name as first written on an order, for display. */
    label: string;
    orders: number;
}

export interface CampaignSummary {
    /** Campaigns present in the given orders, most orders first. */
    stats: CampaignStat[];
    /** Orders with no campaign name. */
    withoutCampaign: number;
    /** Every order the summary was taken over. */
    total: number;
}

export function summarizeAdCampaigns(orders: readonly Order[]): CampaignSummary {
    const byKey = new Map<string, CampaignStat>();
    let withoutCampaign = 0;

    for (const order of orders) {
        const key = campaignKeyOf(order);
        if (key === null) {
            withoutCampaign += 1;
            continue;
        }
        const existing = byKey.get(key);
        if (existing) existing.orders += 1;
        else byKey.set(key, { key, label: (order.attribution?.campaign ?? key).trim(), orders: 1 });
    }

    return {
        stats: [...byKey.values()].sort((a, b) => b.orders - a.orders || a.label.localeCompare(b.label)),
        withoutCampaign,
        total: orders.length,
    };
}
