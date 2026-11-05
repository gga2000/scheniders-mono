import { describe, expect, it } from "vitest";
import type { PrimeManifestCase } from "./client";
import type { PrimeStatementOurs } from "./statement";
import { matchPrimeCases, pickReceiptOrder, receiptCollect } from "./statement-load";

type Row = Record<string, unknown>;

/** Answers the two orders reads: exact numbers (`in`) and refund/replacement numbers (`or` of likes). */
function fakeDb(orders: Row[]) {
    const from = (table: string) => {
        let rows: Row[] = table === "orders" ? orders : [];
        const builder = {
            select: () => builder,
            eq: () => builder,
            is: () => builder,
            in: (col: string, values: unknown[]) => ((rows = rows.filter((r) => values.includes(r[col]))), builder),
            or: (filter: string) => {
                const prefixes = filter.split(",").map((f) => f.replace(/^order_id\.like\./, "").replace(/%$/, ""));
                rows = rows.filter((r) => prefixes.some((p) => String(r.order_id).startsWith(p)));
                return builder;
            },
            then: (resolve: (r: unknown) => void) => resolve({ data: rows, error: null }),
        };
        return builder;
    };
    return { from } as unknown as Parameters<typeof matchPrimeCases>[0];
}

const order = (over: Row): Row => ({
    id: `id-${String(over.order_id)}`,
    customer_name: null,
    price: 36_750,
    delivery_fee: 0,
    payment_status: "cod",
    status: "in_transit",
    is_return: false,
    ...over,
});

const ours = (orderNumber: string, collect: number, status = "in_transit"): PrimeStatementOurs => ({
    orderId: `id-${orderNumber}`,
    orderNumber,
    customerName: null,
    collect,
    fee: null,
    status,
    linked: false,
});

describe("receiptCollect", () => {
    it("is negative on a refund trip: the refund plus the pickup fee kept", () => {
        expect(receiptCollect(order({ order_id: "RTN-3907-1", price: -44_750, delivery_fee: 5_000, is_return: true }) as never)).toBe(-39_750);
    });
    it("is the cash on delivery on any other order", () => {
        expect(receiptCollect(order({ order_id: "7365" }) as never)).toBe(36_750);
        expect(receiptCollect(order({ order_id: "7434", payment_status: "prepaid" }) as never)).toBe(0);
    });
});

describe("pickReceiptOrder", () => {
    it("takes the order whose amount Prime collected", () => {
        const list = [ours("4030", 36_750, "completed"), ours("RTN-4030-1", -31_750)];
        expect(pickReceiptOrder(list, -31_750)?.orderNumber).toBe("RTN-4030-1");
        expect(pickReceiptOrder(list, 36_750)?.orderNumber).toBe("4030");
    });
    it("else one still on the road, newest first", () => {
        const list = [ours("RTN-4030-1", -31_750, "refund_delivered"), ours("RTN-4030-2", -29_750)];
        expect(pickReceiptOrder(list, 1)?.orderNumber).toBe("RTN-4030-2");
        expect(pickReceiptOrder([], 1)).toBeNull();
    });
});

describe("matchPrimeCases", () => {
    it("places a refund trip printed with its base number on the refund order", async () => {
        const db = fakeDb([
            order({ order_id: "RTN-3907-1", price: -44_750, delivery_fee: 5_000, is_return: true }),
            order({ order_id: "7365" }),
            order({ order_id: "RTN-9999-1", price: -10_000, delivery_fee: 5_000, is_return: true }),
        ]);
        const cases = [
            { caseid: 11, custReceiptNoOri: "3907", receiptAmtIqd: -39_750, shipmentCharge: 5_000 },
            { caseid: 12, custReceiptNoOri: "7365", receiptAmtIqd: 36_750, shipmentCharge: 5_000 },
        ] as PrimeManifestCase[];
        const { rows, summary } = await matchPrimeCases(db, "t1", cases);

        expect(rows.map((r) => [r.receipt, r.ours?.orderNumber, r.kind])).toEqual([
            ["3907", "RTN-3907-1", "match"],
            ["7365", "7365", "match"],
        ]);
        expect(summary).toEqual(expect.objectContaining({ matched: 2, unknown: 0 }));
    });
});
