export type ReorderUrgency = "critical" | "warning" | "ok";

/** How soon a supply runs out compared with how long a reorder takes to arrive. */
export function urgencyFor(days: number | null, leadTime: number): ReorderUrgency {
    if (days === null) return "ok";
    if (days <= leadTime) return "critical";
    if (days <= leadTime * 2) return "warning";
    return "ok";
}

/** Quantity to order: cover lead time x 1.3 safety plus the gap to the reorder point, rounded up to the MOQ. */
export function calcSuggestedQty({
    leadTimeDays,
    dailyRate,
    reorderPoint,
    stock,
    moq,
}: {
    leadTimeDays: number;
    dailyRate: number;
    reorderPoint: number;
    stock: number;
    moq: number;
}): number {
    // Cover lead time × 1.3 safety factor, land at reorder point after receipt.
    const raw = leadTimeDays * dailyRate * 1.3 + (reorderPoint - stock);
    const needed = Math.max(moq, Math.ceil(raw));
    if (moq <= 1) return needed;
    return Math.ceil(needed / moq) * moq;
}
