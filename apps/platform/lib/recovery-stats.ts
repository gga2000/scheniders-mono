// Abandoned-cart recovery — dashboard state + stats.

export type CartState = "pending" | "reminded" | "recovered";

export function cartState(c: {
    reminded_at: string | null;
    recovered_at: string | null;
}): CartState {
    if (c.recovered_at) return "recovered";
    if (c.reminded_at) return "reminded";
    return "pending";
}

export interface RecoveryStats {
    total: number;
    pending: number;
    reminded: number;
    recovered: number;
    /** Summed subtotal (IQD) of recovered carts. */
    recoveredValue: number;
    /** recovered / total, in [0,1]. */
    recoveryRate: number;
}

export function summarizeRecovery(
    carts: ReadonlyArray<{
        reminded_at: string | null;
        recovered_at: string | null;
        subtotal_iqd: number;
    }>,
): RecoveryStats {
    let pending = 0;
    let reminded = 0;
    let recovered = 0;
    let recoveredValue = 0;
    for (const c of carts) {
        const s = cartState(c);
        if (s === "recovered") {
            recovered += 1;
            recoveredValue += Math.max(0, c.subtotal_iqd);
        } else if (s === "reminded") {
            reminded += 1;
        } else {
            pending += 1;
        }
    }
    const total = carts.length;
    return {
        total,
        pending,
        reminded,
        recovered,
        recoveredValue,
        recoveryRate: total > 0 ? recovered / total : 0,
    };
}
