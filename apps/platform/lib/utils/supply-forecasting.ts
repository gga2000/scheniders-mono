export type HistoryEntry = {
    change_type: string | null;
    quantity_change: number | null;
    created_at: string | null;
};

/**
 * Stock changes that are not use: counts and corrections fix the number,
 * write-offs, supplier returns, open-box moves and QC undos are not consumed.
 * The same list as the supply_usage_7d / supply_usage_30d RPCs, so the
 * sparkline, the feed and the reorder rule read one usage.
 */
export const NOT_USAGE_CHANGE_TYPES: ReadonlySet<string> = new Set([
    "count",
    "adjusted",
    "written_off",
    "returned_to_supplier",
    "open_box_count",
    "qc_undo",
]);

/** A stock movement that counts as use: stock went down for a reason other than a correction. */
export function isUsageMovement(entry: HistoryEntry): boolean {
    if ((entry.quantity_change ?? 0) >= 0) return false;
    return !NOT_USAGE_CHANGE_TYPES.has((entry.change_type ?? "").toLowerCase());
}

export function daysUntilStockout(availableStock: number, dailyRate: number): number | null {
    if (!dailyRate || dailyRate <= 0) return null;
    if (availableStock <= 0) return 0;
    return Math.floor(availableStock / dailyRate);
}

export function projectedStock(stock: number, dailyRate: number, days: number): number {
    const rate = Math.max(0, dailyRate);
    const next = stock - rate * Math.max(0, days);
    return Math.max(0, next);
}

export function detectConsumptionAnomaly({
    last7dOut,
    prior23dOut,
}: {
    last7dOut: number;
    prior23dOut: number;
}): { isAnomaly: boolean; multiplier: number } {
    if (last7dOut < 3 || prior23dOut < 3) {
        return { isAnomaly: false, multiplier: 0 };
    }
    const recentAvg = last7dOut / 7;
    const priorAvg = prior23dOut / 23;
    if (priorAvg <= 0) return { isAnomaly: false, multiplier: 0 };
    const multiplier = recentAvg / priorAvg;
    return { isAnomaly: multiplier >= 2.5, multiplier };
}

export function deadStockScore({
    daysSinceLastOut,
    stock,
}: {
    daysSinceLastOut: number | null;
    stock: number;
}): "dead" | "slow" | "normal" {
    if (stock <= 0) return "normal";
    if (daysSinceLastOut === null) return "dead";
    if (daysSinceLastOut > 90) return "dead";
    if (daysSinceLastOut > 45) return "slow";
    return "normal";
}

/**
 * Helper: split out-movements into last-7-days and prior-23-days counts.
 * Used by the anomaly detector and by the actions feed.
 */
export function splitOutMovements(entries: HistoryEntry[]): {
    last7dOut: number;
    prior23dOut: number;
    daysSinceLastOut: number | null;
} {
    if (!entries || entries.length === 0) {
        return { last7dOut: 0, prior23dOut: 0, daysSinceLastOut: null };
    }
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    const cutoff7 = now - 7 * day;
    const cutoff30 = now - 30 * day;
    let last7 = 0;
    let prior = 0;
    let lastOutTs: number | null = null;
    for (const e of entries) {
        if (!isUsageMovement(e)) continue;
        const t = e.created_at ? new Date(e.created_at).getTime() : 0;
        if (!t) continue;
        const qty = Math.abs(e.quantity_change ?? 0);
        if (lastOutTs === null || t > lastOutTs) lastOutTs = t;
        if (t >= cutoff7) last7 += qty;
        else if (t >= cutoff30) prior += qty;
    }
    const daysSinceLastOut = lastOutTs ? Math.floor((now - lastOutTs) / day) : null;
    return { last7dOut: last7, prior23dOut: prior, daysSinceLastOut };
}
