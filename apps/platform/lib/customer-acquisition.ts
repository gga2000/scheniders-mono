export interface AcquisitionOrder {
    created_at: string;
    ad_channel: string | null;
    attribution: unknown;
    is_return?: boolean | null;
    is_replacement?: boolean | null;
}

/** The customer's first original order that carried an ad link; null for customers who never came through an ad. */
export function firstAdOrder<T extends AcquisitionOrder>(orders: readonly T[]): T | null {
    let first: T | null = null;
    for (const order of orders) {
        if (!order.ad_channel || order.is_return || order.is_replacement) continue;
        if (first === null || new Date(order.created_at).getTime() < new Date(first.created_at).getTime()) first = order;
    }
    return first;
}

/** Delivered spend over acquisition cost, one decimal; null without a cost to compare to. */
export function acquisitionMultiple(lifetimeValue: number, acquisitionCost: number | null): number | null {
    if (acquisitionCost === null || acquisitionCost <= 0) return null;
    return Math.round((lifetimeValue / acquisitionCost) * 10) / 10;
}
