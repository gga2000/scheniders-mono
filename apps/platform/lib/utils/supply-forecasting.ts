export type HistoryEntry = {
    change_type: string | null;
    quantity_change: number | null;
    created_at: string | null;
};

const OUT_TYPES = new Set(["sale", "sold", "shrinkage", "damaged", "transfer"]);

function isOutMovement(entry: HistoryEntry): boolean {
    const q = entry.quantity_change ?? 0;
    if (q < 0) return true;
    const type = (entry.change_type ?? "").toLowerCase();
    return OUT_TYPES.has(type);
}

/**
 * Sum of absolute out-movement units in the last `windowDays`, divided by the
 * window. Ignores inbound movements (received, returned, positive adjustments).
 */
export function dailyRateFromHistory(entries: HistoryEntry[], windowDays = 30): number {
    if (!entries || entries.length === 0 || windowDays <= 0) return 0;
    const since = Date.now() - windowDays * 24 * 60 * 60 * 1000;
    let total = 0;
    for (const e of entries) {
        const t = e.created_at ? new Date(e.created_at).getTime() : 0;
        if (!t || t < since) continue;
        if (!isOutMovement(e)) continue;
        total += Math.abs(e.quantity_change ?? 0);
    }
    if (total <= 0) return 0;
    return total / windowDays;
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
        if (!isOutMovement(e)) continue;
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
