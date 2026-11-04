import { describe, expect, it } from "vitest";
import { matchPrimeStatement, type PrimeStatementOurs } from "./statement";

const ours = (orderNumber: string, collect: number | null, fee: number | null): PrimeStatementOurs => ({
    orderId: `id-${orderNumber}`,
    orderNumber,
    customerName: "زبون",
    collect,
    fee,
    status: "delivered",
    linked: true,
});

describe("matchPrimeStatement", () => {
    it("matches by case id, then by receipt, and leaves the rest unknown", () => {
        const byCase = new Map([[101, ours("A1", 36750, 6000)]]);
        const byReceipt = new Map([["B2", ours("B2", 45000, 5000)]]);
        const { rows, summary } = matchPrimeStatement(
            [
                { caseid: 101, custReceiptNoOri: "A1", receiptAmtIqd: 36750, shipmentCharge: 6000 },
                { caseid: 202, custReceiptNoOri: "B2", receiptAmtIqd: 45000, shipmentCharge: 5000 },
                { caseid: 303, custReceiptNoOri: "ZZ", receiptAmtIqd: 20000, shipmentCharge: 5000 },
            ],
            byCase,
            byReceipt,
        );
        expect(rows.map((r) => r.kind)).toEqual(["match", "match", "unknown"]);
        expect(rows[1].ours?.orderNumber).toBe("B2");
        expect(summary).toEqual({ parcels: 3, matched: 2, different: 0, unknown: 1, collect: 101750, fees: 16000, net: 85750, diff: 0 });
    });

    it("flags a lower collection and a changed fee, with the money difference", () => {
        const byCase = new Map([
            [1, ours("A", 36750, 6000)],
            [2, ours("B", 30000, 5000)],
        ]);
        const { rows, summary } = matchPrimeStatement(
            [
                { caseid: 1, receiptAmtIqd: 30000, shipmentCharge: 6000 },
                { caseid: 2, receiptAmtIqd: 30000, shipmentCharge: 6000 },
            ],
            byCase,
            new Map(),
        );
        expect(rows.map((r) => [r.kind, r.diff])).toEqual([
            ["different", -6750],
            ["different", -1000],
        ]);
        expect(summary.diff).toBe(-7750);
        expect(summary.different).toBe(2);
    });

    it("without a quoted fee, the collection alone decides", () => {
        const { rows } = matchPrimeStatement([{ caseid: 9, receiptAmtIqd: 25000, shipmentCharge: 5000 }], new Map([[9, ours("C", 25000, null)]]), new Map());
        expect(rows[0]).toMatchObject({ kind: "match", diff: 0, primeNet: 20000 });
    });

    it("treats missing amounts as zero and a parcel with no collection on our side as unknown", () => {
        const { rows, summary } = matchPrimeStatement([{ caseid: 5, custReceiptNoOri: " " }], new Map([[5, ours("D", null, null)]]), new Map());
        expect(rows[0]).toMatchObject({ kind: "unknown", receipt: null, primeCollect: 0, primeFee: 0, diff: null });
        expect(summary.unknown).toBe(1);
    });
});
