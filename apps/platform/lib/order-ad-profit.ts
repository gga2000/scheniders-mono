/** Statuses where the order is, or may still become, a sale: the others never earn a profit to subtract ads from. */
const LIVE_STATUSES = new Set(["new", "contacted", "confirmed", "in_transit", "delivered", "completed"]);

/** Whether a profit-after-ads line makes sense for the order. */
export function showsAdProfit(order: { status: string; is_return?: boolean; is_replacement?: boolean }): boolean {
    return LIVE_STATUSES.has(order.status) && !order.is_return && !order.is_replacement;
}

/**
 * What one order of a campaign cost in ads, on average: its spend over its orders in the same period.
 * An average, not what Meta charged for this one order. Null with no orders to divide by.
 */
export function campaignAdCostPerOrder(campaign: { spendIqd: number; orders: number }): number | null {
    return campaign.orders > 0 ? Math.round(campaign.spendIqd / campaign.orders) : null;
}

export interface AdProfitLines {
    revenue: number;
    productCost: number;
    otherCosts: number;
    adCost: number;
    profitAfterAds: number;
}

/** The lines of the order's profit once the campaign's average ad cost is taken off. */
export function adProfitLines(cost: { revenue: number; productCost: number; totalCost: number }, adCost: number): AdProfitLines {
    return {
        revenue: cost.revenue,
        productCost: cost.productCost,
        otherCosts: cost.totalCost - cost.productCost,
        adCost,
        profitAfterAds: cost.revenue - cost.totalCost - adCost,
    };
}
