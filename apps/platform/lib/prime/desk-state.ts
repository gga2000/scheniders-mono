/**
 * What the dispatch desk shows for each order's Prime hand-off, from the
 * desk check (lib/prime/desk-preview) and the run in progress. Pure and
 * client-safe, so the desk cards, the header counts and the money bar read
 * the same thing.
 */
import type { PrimeDeskRow } from "@/lib/prime/desk-preview";
import type { PrimeSkipReason } from "@/lib/prime/shipment-payload";

/** The slice of a run's progress the desk reads (hooks/use-prime-link PrimeSendProgress). */
export interface PrimeRunProgress {
    sent: ReadonlyMap<string, number>;
    failed: ReadonlySet<string>;
    sending: ReadonlySet<string>;
}

export type PrimeDeskState =
    /** Prime has it: its case number. */
    | { kind: "sent"; caseId: number }
    /** In the request on its way to Prime now. */
    | { kind: "sending" }
    /** Ready for Prime, not sent yet. */
    | { kind: "waiting" }
    /** Prime refuses it as it stands; fixable on the desk. */
    | { kind: "fix"; reason: Exclude<PrimeSkipReason, "after_sale"> }
    /** Goes in the Excel file: a refund or replacement, or the API did not take it in this run. */
    | { kind: "excel" };

/** Null while the desk check has not answered for the order. */
export function primeDeskState(orderId: string, row: PrimeDeskRow | undefined, progress: PrimeRunProgress | null): PrimeDeskState | null {
    const caseId = progress?.sent.get(orderId);
    if (caseId !== undefined) return { kind: "sent", caseId };
    if (progress?.sending.has(orderId)) return { kind: "sending" };
    if (progress?.failed.has(orderId)) return { kind: "excel" };
    if (!row) return null;
    if (row.caseId !== null) return { kind: "sent", caseId: row.caseId };
    if (row.kind === "fix") return { kind: "fix", reason: row.reason };
    if (row.kind === "after_sale") return { kind: "excel" };
    return { kind: "waiting" };
}

export interface PrimeDeskCounts {
    sent: number;
    waiting: number;
    fix: number;
}

/** The desk header's «وصل برايم · ينتظر · يحتاج تصحيحاً», over the given orders. */
export function primeDeskCounts(orderIds: readonly string[], rows: ReadonlyMap<string, PrimeDeskRow>, progress: PrimeRunProgress | null): PrimeDeskCounts {
    const counts: PrimeDeskCounts = { sent: 0, waiting: 0, fix: 0 };
    for (const id of orderIds) {
        const state = primeDeskState(id, rows.get(id), progress);
        if (state?.kind === "sent") counts.sent += 1;
        else if (state?.kind === "waiting" || state?.kind === "sending") counts.waiting += 1;
        else if (state?.kind === "fix") counts.fix += 1;
    }
    return counts;
}

export interface PrimeRunMoney {
    /** Cash the drivers collect at the door. */
    collect: number;
    /** Prime's fees on the parcels it takes, as far as Prime priced them. */
    fees: number;
    /** Parcels Prime takes that have no price yet (Prime has none for the governorate, or did not answer). */
    unpriced: number;
    /** collect − fees. */
    net: number;
}

/** The money bar of the ticked run: `cash` is each order's cash at the door (lib/dispatch-label doorCash). */
export function primeRunMoney(
    orders: readonly { id: string; cash: { direction: string; amount: number } }[],
    rows: ReadonlyMap<string, PrimeDeskRow>,
): PrimeRunMoney {
    let collect = 0;
    let fees = 0;
    let unpriced = 0;
    for (const order of orders) {
        if (order.cash.direction === "collect") collect += order.cash.amount;
        const row = rows.get(order.id);
        if (row?.kind !== "ready") continue;
        if (row.fee === null) unpriced += 1;
        else fees += row.fee;
    }
    return { collect, fees, unpriced, net: collect - fees };
}
