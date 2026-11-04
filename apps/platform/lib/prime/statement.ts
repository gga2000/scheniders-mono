import type { PrimeManifestCase } from "@/lib/prime/client";

/** What our books expect for one parcel Prime carried. */
export interface PrimeStatementOurs {
    orderId: string;
    orderNumber: string;
    customerName: string | null;
    /** What we asked Prime to collect. */
    collect: number | null;
    /** Prime's fee as Prime last told us (shipments-info), or null if never read. */
    fee: number | null;
}

export type PrimeStatementKind = "match" | "different" | "unknown";

export interface PrimeStatementRow {
    caseId: number | null;
    receipt: string | null;
    ours: PrimeStatementOurs | null;
    primeCollect: number;
    primeFee: number;
    /** What Prime pays for this parcel: collected minus its fee. */
    primeNet: number;
    /** Prime's net minus the net our books expect; 0 on a match, null for a parcel we cannot place. */
    diff: number | null;
    kind: PrimeStatementKind;
}

export interface PrimeStatementSummary {
    parcels: number;
    matched: number;
    different: number;
    unknown: number;
    collect: number;
    fees: number;
    net: number;
    /** Sum of the per-parcel differences (Prime paid this much more, or less when negative). */
    diff: number;
}

export interface PrimeStatement {
    rows: PrimeStatementRow[];
    summary: PrimeStatementSummary;
}

const whole = (n: number | null | undefined) => (typeof n === "number" && Number.isFinite(n) ? Math.round(n) : 0);

/**
 * Lays a Prime payment manifest against our orders. Each parcel is placed by
 * its case id (the shipment we created), else by its receipt (our order
 * number). A parcel matches when Prime collected what we asked and charged
 * the fee it quoted; when it never quoted one, the collection alone decides.
 */
export function matchPrimeStatement(
    cases: readonly PrimeManifestCase[],
    byCase: ReadonlyMap<number, PrimeStatementOurs>,
    byReceipt: ReadonlyMap<string, PrimeStatementOurs>,
): PrimeStatement {
    const summary: PrimeStatementSummary = { parcels: 0, matched: 0, different: 0, unknown: 0, collect: 0, fees: 0, net: 0, diff: 0 };
    const rows = cases.map((c): PrimeStatementRow => {
        const caseId = c.caseid ?? null;
        const receipt = c.custReceiptNoOri?.trim() || null;
        const ours = (caseId !== null ? byCase.get(caseId) : undefined) ?? (receipt !== null ? byReceipt.get(receipt) : undefined) ?? null;
        const primeCollect = whole(c.receiptAmtIqd);
        const primeFee = whole(c.shipmentCharge);
        const primeNet = primeCollect - primeFee;

        summary.parcels += 1;
        summary.collect += primeCollect;
        summary.fees += primeFee;
        summary.net += primeNet;

        if (!ours || ours.collect === null) {
            summary.unknown += 1;
            return { caseId, receipt, ours, primeCollect, primeFee, primeNet, diff: null, kind: "unknown" };
        }
        const expectedNet = whole(ours.collect) - (ours.fee === null ? primeFee : whole(ours.fee));
        const diff = primeNet - expectedNet;
        const kind: PrimeStatementKind = diff === 0 && (ours.fee === null || whole(ours.fee) === primeFee) ? "match" : "different";
        if (kind === "match") summary.matched += 1;
        else summary.different += 1;
        summary.diff += diff;
        return { caseId, receipt, ours, primeCollect, primeFee, primeNet, diff, kind };
    });
    return { rows, summary };
}
