export type ReorderUrgency = "critical" | "warning" | "ok";

/** How soon a supply runs out compared with how long a reorder takes to arrive. */
export function urgencyFor(days: number | null, leadTime: number): ReorderUrgency {
    if (days === null) return "ok";
    if (days <= leadTime) return "critical";
    if (days <= leadTime * 2) return "warning";
    return "ok";
}

/** Quantity to order: cover lead time x 1.3 safety plus the gap to the reorder point, rounded up to the MOQ. */
interface ReorderInput {
    leadTimeDays: number;
    dailyRate: number;
    reorderPoint: number;
    stock: number;
}

/**
 * Units still missing to cover the lead time (x 1.3 safety) and land at the
 * reorder point after receipt. Zero or less means the stock given (including
 * what is already on order) is enough.
 */
export function reorderShortfall({ leadTimeDays, dailyRate, reorderPoint, stock }: ReorderInput): number {
    return Math.ceil(leadTimeDays * dailyRate * 1.3 + (reorderPoint - stock));
}

export function calcSuggestedQty({
    leadTimeDays,
    dailyRate,
    reorderPoint,
    stock,
    moq,
}: ReorderInput & { moq: number }): number {
    const needed = Math.max(moq, reorderShortfall({ leadTimeDays, dailyRate, reorderPoint, stock }));
    if (moq <= 1) return needed;
    return Math.ceil(needed / moq) * moq;
}
