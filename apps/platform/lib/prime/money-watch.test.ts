import { describe, expect, it, vi } from "vitest";
import type { PrimeClient, PrimeManifestCase, PrimePaymentReceipt } from "./client";
import { sendPrimeDaily, watchPrimePayments } from "./money-watch";

vi.mock("@/lib/prime/statement-load", async (importOriginal) => {
    const actual = await importOriginal<typeof import("./statement-load")>();
    return {
        ...actual,
        matchPrimeCases: vi.fn(async (_db: unknown, _tenant: string, cases: readonly PrimeManifestCase[]) => ({
            rows: [],
            summary: { parcels: cases.length, matched: cases.length - 1, different: 1, unknown: 0, collect: 0, fees: 0, net: 0, diff: -7250 },
        })),
    };
});

type Call = { table: string; op: "select" | "update" | "insert"; payload?: unknown; filters: [string, string, unknown][] };

/** Records every query; answers selects by table from `answers`, and an update…select with one row per case it names. */
function fakeDb(answers: Record<string, unknown[]> = {}) {
    const calls: Call[] = [];
    const from = (table: string) => {
        const call: Call = { table, op: "select", filters: [] };
        calls.push(call);
        const builder = {
            select: () => builder,
            update: (payload: unknown) => ((call.op = "update"), (call.payload = payload), builder),
            insert: (payload: unknown) => ((call.op = "insert"), (call.payload = payload), builder),
            eq: (col: string, v: unknown) => (call.filters.push(["eq", col, v]), builder),
            in: (col: string, v: unknown) => (call.filters.push(["in", col, v]), builder),
            is: (col: string, v: unknown) => (call.filters.push(["is", col, v]), builder),
            gte: (col: string, v: unknown) => (call.filters.push(["gte", col, v]), builder),
            then: (resolve: (r: { data: unknown; error: null }) => void) => {
                if (call.op === "update" && table === "prime_shipments") {
                    const ids = call.filters.find(([op, col]) => op === "in" && col === "case_id")?.[2];
                    return resolve({ data: Array.isArray(ids) ? ids.map((id) => ({ id })) : [], error: null });
                }
                if (call.op === "select") return resolve({ data: answers[table] ?? [], error: null });
                return resolve({ data: null, error: null });
            },
        };
        return builder;
    };
    return { db: { from } as unknown as Parameters<typeof watchPrimePayments>[0], calls };
}

const receipt = (id: number, amount: number): PrimePaymentReceipt => ({ id, transactionAmountIqd: amount, createdDateTime: "2026-11-04 10:00:00", confirmedReception: false });

const primeClient = (receipts: PrimePaymentReceipt[], cases: Record<number, number[]>) =>
    ({
        paymentReceipts: vi.fn().mockResolvedValue(receipts),
        paymentCases: vi.fn(async (_login: string, id: number) => (cases[id] ?? []).map((caseid) => ({ caseid, receiptAmtIqd: 30_000, shipmentCharge: 5_000 }))),
    }) as unknown as PrimeClient;

const connection = { merchantLoginId: "aa10002000", shopId: 7, branchName: null };
const of = (calls: Call[], table: string, op: Call["op"]) => calls.filter((c) => c.table === table && c.op === op);

describe("watchPrimePayments", () => {
    it("on the first run marks the recent payments' parcels paid and announces nothing", async () => {
        const { db, calls } = fakeDb({ tenant_members: [{ user_id: "admin-1" }] });
        const outcome = await watchPrimePayments(db, primeClient([receipt(12, 50_000), receipt(11, 40_000)], { 11: [1, 2], 12: [3] }), "t1", connection, null);

        expect(outcome).toEqual({ announced: 0, parcelsPaid: 3 });
        expect(of(calls, "notifications", "insert")).toHaveLength(0);
        // Oldest first, and only parcels not paid yet, in this tenant.
        const marks = of(calls, "prime_shipments", "update");
        expect(marks.map((c) => c.payload)).toEqual([{ payment_id: 11 }, { payment_id: 12 }]);
        expect(marks[0].filters).toEqual(expect.arrayContaining([["eq", "tenant_id", "t1"], ["is", "payment_id", null]]));
        expect(of(calls, "prime_connections", "update").map((c) => c.payload)).toEqual([{ last_payment_id: 11 }, { last_payment_id: 12 }]);
    });

    it("tells each administrator about a new payment and how its parcels match", async () => {
        const { db, calls } = fakeDb({ tenant_members: [{ user_id: "admin-1" }, { user_id: "admin-2" }] });
        const outcome = await watchPrimePayments(db, primeClient([receipt(12, 1_284_250), receipt(11, 40_000)], { 12: [3, 4, 5] }), "t1", connection, 11);

        expect(outcome).toEqual({ announced: 1, parcelsPaid: 3 });
        const [insert] = of(calls, "notifications", "insert");
        expect(insert.payload).toEqual(
            ["admin-1", "admin-2"].map((userId) =>
                expect.objectContaining({
                    type: "prime.payment",
                    audience: "user",
                    recipient_id: userId,
                    payload: { payment_id: 12, amount: 1_284_250, parcels: 3, matched: 2, different: 1, diff: -7250 },
                    group_key: "prime.payment:12",
                }),
            ),
        );
        const admins = of(calls, "tenant_members", "select")[0];
        expect(admins.filters).toEqual(expect.arrayContaining([["eq", "tenant_id", "t1"], ["eq", "role", "admin"], ["eq", "status", "active"]]));
    });

    it("does nothing when Prime has paid nothing new", async () => {
        const { db, calls } = fakeDb();
        expect(await watchPrimePayments(db, primeClient([receipt(11, 40_000)], {}), "t1", connection, 11)).toEqual({ announced: 0, parcelsPaid: 0 });
        expect(calls).toHaveLength(0);
    });
});

/** 2026-11-04 at the given Baghdad hour. */
const at = (hour: number) => Date.parse("2026-11-04T00:00:00Z") - 3 * 3_600_000 + hour * 3_600_000;

describe("sendPrimeDaily", () => {
    const today = [
        { shipment_status: "DELIVERED", step_code: "DLEIVERD", cancelled_at: null, receipt_amount_iqd: 30_000 },
        { shipment_status: "DELIVERED", step_code: "DLEIVERD", cancelled_at: null, receipt_amount_iqd: 25_000 },
        { shipment_status: "FAILED_DELIVER_RETURNED_TO_SENDER", step_code: "RTN_INSTORE", cancelled_at: null, receipt_amount_iqd: 40_000 },
        { shipment_status: "ONWAY", step_code: "ONWAY", cancelled_at: null, receipt_amount_iqd: 20_000 },
    ];

    it("waits for 21:00 Baghdad", async () => {
        const { db, calls } = fakeDb({ prime_shipments: today });
        expect(await sendPrimeDaily(db, "t1", null, at(20.9))).toBe(false);
        expect(calls).toHaveLength(0);
    });

    it("sends the day once: delivered, coming back, and the cash collected", async () => {
        const { db, calls } = fakeDb({ prime_shipments: today, tenant_members: [{ user_id: "admin-1" }] });
        expect(await sendPrimeDaily(db, "t1", "2026-11-03", at(21))).toBe(true);

        const [insert] = of(calls, "notifications", "insert");
        expect(insert.payload).toEqual([
            expect.objectContaining({ type: "prime.daily", recipient_id: "admin-1", payload: { day: "2026-11-04", delivered: 2, returning: 1, collected: 55_000 }, group_key: "prime.daily:2026-11-04" }),
        ]);
        expect(of(calls, "prime_connections", "update").map((c) => c.payload)).toEqual([{ daily_sent_on: "2026-11-04" }]);

        const again = fakeDb({ prime_shipments: today });
        expect(await sendPrimeDaily(again.db, "t1", "2026-11-04", at(22))).toBe(false);
        expect(again.calls).toHaveLength(0);
    });

    it("a quiet day sends nothing but is done", async () => {
        const { db, calls } = fakeDb({ prime_shipments: [today[3]] });
        expect(await sendPrimeDaily(db, "t1", null, at(23))).toBe(true);
        expect(of(calls, "notifications", "insert")).toHaveLength(0);
        expect(of(calls, "prime_connections", "update")).toHaveLength(1);
    });
});
