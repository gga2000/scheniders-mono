// Abandoned-cart recovery — dashboard state + stats.

export type CartState = "pending" | "reminded" | "recovered";

/** How a recovered capture came back. Derived in the database
 *  (abandoned_carts.recovery_kind) from the two timestamps: a reminder went
 *  out before the order, or the shopper ordered on their own. */
export type RecoveryKind = "after_reminder" | "organic";

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
    /** Recovered after a reminder went out: the only ones a reminder can claim. */
    recoveredAfterReminder: number;
    /** Recovered with no reminder before the order. */
    recoveredOrganic: number;
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
        recovery_kind: RecoveryKind | null;
    }>,
): RecoveryStats {
    let pending = 0;
    let reminded = 0;
    let recovered = 0;
    let recoveredAfterReminder = 0;
    let recoveredOrganic = 0;
    let recoveredValue = 0;
    for (const c of carts) {
        const s = cartState(c);
        if (s === "recovered") {
            recovered += 1;
            recoveredValue += Math.max(0, c.subtotal_iqd);
            // Only the database's verdict credits a reminder. Anything else is
            // counted as the shopper coming back on their own.
            if (c.recovery_kind === "after_reminder") recoveredAfterReminder += 1;
            else recoveredOrganic += 1;
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
        recoveredAfterReminder,
        recoveredOrganic,
        recoveredValue,
        recoveryRate: total > 0 ? recovered / total : 0,
    };
}
