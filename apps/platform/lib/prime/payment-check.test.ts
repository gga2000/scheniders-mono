import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrimeClient, PrimePaymentReceipt } from "./client";
import type { PrimeStatement, PrimeStatementRow } from "./statement";
import { acceptPrimePrice, approvePrimePayment, loadPrimeApprovals } from "./payment-check";

const statement = vi.hoisted(() => ({ current: null as PrimeStatement | null }));

vi.mock("@/lib/prime/statement-load", async (importOriginal) => {
    const actual = await importOriginal<typeof import("./statement-load")>();
    return { ...actual, matchPrimeCases: vi.fn(async () => statement.current) };
});

type Call = { table: string; op: "select" | "update" | "upsert"; payload?: unknown; filters: [string, string, unknown][] };

/** Records every query; selects answer from `answers` by table (a function answers each read anew), updates answer `updated` rows. */
function fakeDb(answers: Record<string, unknown> = {}, opts: { updated?: number; rpc?: { data: unknown; error: { code: string; message: string } | null } } = {}) {
    const calls: Call[] = [];
    const rpc = vi.fn(async () => opts.rpc ?? { data: { import_id: "imp-1", completed: 2 }, error: null });
    const from = (table: string) => {
        const call: Call = { table, op: "select", filters: [] };
        calls.push(call);
        const answer = () => {
            if (call.op === "update") return { data: Array.from({ length: opts.updated ?? 1 }, (_, i) => ({ id: `u${i}` })), error: null };
            if (call.op === "upsert") return { data: null, error: null };
            const data = answers[table];
            return { data: (typeof data === "function" ? data() : data) ?? null, error: null };
        };
        const builder = {
            select: () => builder,
            update: (payload: unknown) => ((call.op = "update"), (call.payload = payload), builder),
            upsert: (payload: unknown) => ((call.op = "upsert"), (call.payload = payload), builder),
            eq: (col: string, v: unknown) => (call.filters.push(["eq", col, v]), builder),
            in: (col: string, v: unknown) => (call.filters.push(["in", col, v]), builder),
            is: (col: string, v: unknown) => (call.filters.push(["is", col, v]), builder),
            maybeSingle: async () => answer(),
            then: (resolve: (r: unknown) => void) => resolve(answer()),
        };
        return builder;
    };
    return { db: { from, rpc } as unknown as Parameters<typeof approvePrimePayment>[0], calls, rpc };
}

const connection = { merchantLoginId: "aa10002000", shopId: 7, branchName: null };

const receipt = (id: number, amount: number): PrimePaymentReceipt => ({ id, transactionAmountIqd: amount, createdDateTime: "2026-11-03 18:00:00", confirmedReception: true });

const primeClient = (receipts: PrimePaymentReceipt[] = [receipt(88014, 61_000)]) =>
    ({
        paymentReceipts: vi.fn().mockResolvedValue(receipts),
        paymentCases: vi.fn().mockResolvedValue([{ caseid: 1 }, { caseid: 2 }, { caseid: 3 }]),
    }) as unknown as PrimeClient;

const row = (over: Partial<PrimeStatementRow> & { orderId?: string | null; status?: string; collect?: number; fee?: number }): PrimeStatementRow => {
    const { orderId = "o1", status = "delivered", collect = 36_000, fee = 5_000, ...rest } = over;
    return {
        caseId: 1,
        receipt: "4261103016",
        ours: orderId === null ? null : { orderId, orderNumber: "4261103016", customerName: "مريم", collect, fee, status, linked: true },
        primeCollect: 36_000,
        primeFee: 5_000,
        primeNet: 31_000,
        diff: 0,
        kind: "match",
        ...rest,
    };
};

const summaryOf = (rows: PrimeStatementRow[]) => ({
    parcels: rows.length,
    matched: rows.filter((r) => r.kind === "match").length,
    different: rows.filter((r) => r.kind === "different").length,
    unknown: rows.filter((r) => r.kind === "unknown").length,
    collect: 0,
    fees: 0,
    net: 0,
    diff: rows.reduce((sum, r) => sum + (r.diff ?? 0), 0),
});

const useRows = (rows: PrimeStatementRow[]) => {
    statement.current = { rows, summary: summaryOf(rows) };
};

beforeEach(() => {
    statement.current = null;
});

describe("loadPrimeApprovals", () => {
    it("counts an approval made here and a PDF of the same payment, the one made here first", async () => {
        const { db, calls } = fakeDb({
            delivery_imports: [
                { receipt_number: "88014", confirmed_at: "2026-11-03T10:00:00Z", created_at: "2026-11-03T10:00:00Z", source: null },
                { receipt_number: "88014", confirmed_at: "2026-11-04T09:00:00Z", created_at: "2026-11-04T09:00:00Z", source: "prime_api" },
                { receipt_number: "87960", confirmed_at: null, created_at: "2026-10-28T09:00:00Z", source: null },
            ],
        });
        const approvals = await loadPrimeApprovals(db, "t1", [88014, 87960]);

        expect(approvals.get(88014)).toEqual({ at: "2026-11-04T09:00:00Z", source: "app" });
        expect(approvals.get(87960)).toEqual({ at: "2026-10-28T09:00:00Z", source: "pdf" });
        // Only this tenant's imports, and never a rolled-back one.
        expect(calls[0].filters).toEqual(
            expect.arrayContaining([
                ["eq", "tenant_id", "t1"],
                ["in", "status", ["confirmed", "completed"]],
            ]),
        );
    });
});

describe("approvePrimePayment", () => {
    it("closes the payment in one transaction with every parcel and how it matched", async () => {
        useRows([
            row({}),
            row({ caseId: 2, orderId: "o2", kind: "different", primeCollect: 30_000, primeNet: 25_000, diff: -6_000 }),
            row({ caseId: 3, orderId: null, kind: "unknown", diff: null }),
        ]);
        const { db, rpc, calls } = fakeDb({ delivery_imports: [], user_profiles: { display_name: "علي" } });

        const outcome = await approvePrimePayment(db, primeClient(), "t1", connection, 88014, "user-1");

        expect(outcome).toEqual({ kind: "approved", completed: 2 });
        expect(rpc).toHaveBeenCalledWith("prime_approve_payment", {
            p_tenant_id: "t1",
            p_payment_id: 88014,
            p_user_id: "user-1",
            p_changed_by: "علي",
            p_amount: 61_000,
            p_paid_at: expect.any(String),
            p_rows: [
                { order_id: "o1", case_id: "1", collect: 36_000, fee: 5_000, net: 31_000, kind: "match", status: "delivered", diff: 0 },
                { order_id: "o2", case_id: "2", collect: 30_000, fee: 5_000, net: 25_000, kind: "different", status: "delivered", diff: -6_000 },
                { order_id: null, case_id: "3", collect: 36_000, fee: 5_000, net: 31_000, kind: "unknown", status: null, diff: null },
            ],
        });
        // The match is remembered for the list.
        expect(calls.find((c) => c.table === "prime_payment_checks")?.payload).toEqual(expect.objectContaining({ payment_id: 88014, matched: 1, different: 1, unknown: 1 }));
    });

    it("does nothing for a payment already closed, here or from the PDF", async () => {
        const { db, rpc } = fakeDb({ delivery_imports: [{ receipt_number: "88014", confirmed_at: "2026-11-03T10:00:00Z", created_at: null, source: null }] });
        const outcome = await approvePrimePayment(db, primeClient(), "t1", connection, 88014, "user-1");

        expect(outcome).toEqual({ kind: "already", approval: { at: "2026-11-03T10:00:00Z", source: "pdf" } });
        expect(rpc).not.toHaveBeenCalled();
    });

    it("answers a payment Prime no longer lists without touching anything", async () => {
        const { db, rpc } = fakeDb({ delivery_imports: [] });
        expect(await approvePrimePayment(db, primeClient([receipt(1, 10)]), "t1", connection, 88014, "user-1")).toEqual({ kind: "unknown_payment" });
        expect(rpc).not.toHaveBeenCalled();
    });

    it("reads a second administrator's simultaneous approval as already done", async () => {
        useRows([row({})]);
        let reads = 0;
        const later = [{ receipt_number: "88014", confirmed_at: "2026-11-04T09:00:00Z", created_at: null, source: "prime_api" }];
        const { db } = fakeDb(
            { delivery_imports: () => (++reads === 1 ? [] : later), user_profiles: { display_name: null } },
            { rpc: { data: null, error: { code: "23505", message: "duplicate key" } } },
        );

        expect(await approvePrimePayment(db, primeClient(), "t1", connection, 88014, "user-1")).toEqual({
            kind: "already",
            approval: { at: "2026-11-04T09:00:00Z", source: "app" },
        });
    });
});

describe("acceptPrimePrice", () => {
    const order = (over: Record<string, unknown> = {}) => ({
        id: "o1",
        price: 36_000,
        delivery_fee: 0,
        payment_status: "cod",
        version: 4,
        attention_reasons: ["delivery_price_changed", "address_unclear"],
        delivery_note: null,
        ...over,
    });

    it("takes what Prime collected as the price, keeps a note and drops the new-price flag", async () => {
        useRows([row({ kind: "different", primeCollect: 30_000, primeNet: 25_000, diff: -6_000 })]);
        const { db, calls } = fakeDb({ orders: order() });

        expect(await acceptPrimePrice(db, primeClient(), "t1", connection, 88014, "o1")).toEqual({ kind: "accepted", price: 30_000 });
        const update = calls.find((c) => c.table === "orders" && c.op === "update");
        expect(update?.payload).toEqual({
            price: 30_000,
            delivery_note: "Prime payment #88014: price 36000 → 30000",
            needs_attention: true,
            attention_reasons: ["address_unclear"],
        });
        // Only this tenant's order, and only the version that was read.
        expect(update?.filters).toEqual(expect.arrayContaining([["eq", "tenant_id", "t1"], ["eq", "id", "o1"], ["eq", "version", 4]]));
    });

    it("keeps the delivery fee out of the price", async () => {
        useRows([row({ kind: "different", primeCollect: 35_000, collect: 41_000, diff: -6_000 })]);
        const { db, calls } = fakeDb({ orders: order({ delivery_fee: 5_000, delivery_note: "door 2", attention_reasons: [] }) });

        expect(await acceptPrimePrice(db, primeClient(), "t1", connection, 88014, "o1")).toEqual({ kind: "accepted", price: 30_000 });
        expect(calls.find((c) => c.table === "orders" && c.op === "update")?.payload).toEqual({ price: 30_000, delivery_note: "door 2 | Prime payment #88014: price 36000 → 30000" });
    });

    it("refuses an order that is not on the payment, already matches, is prepaid, or just changed", async () => {
        useRows([row({ orderId: "other" })]);
        expect(await acceptPrimePrice(fakeDb({ orders: order() }).db, primeClient(), "t1", connection, 88014, "o1")).toEqual({ kind: "not_on_payment" });

        useRows([row({})]);
        expect(await acceptPrimePrice(fakeDb({ orders: order() }).db, primeClient(), "t1", connection, 88014, "o1")).toEqual({ kind: "same" });

        useRows([row({ kind: "different", primeCollect: 30_000 })]);
        expect(await acceptPrimePrice(fakeDb({ orders: order({ payment_status: "prepaid" }) }).db, primeClient(), "t1", connection, 88014, "o1")).toEqual({ kind: "prepaid" });
        expect(await acceptPrimePrice(fakeDb({ orders: order() }, { updated: 0 }).db, primeClient(), "t1", connection, 88014, "o1")).toEqual({ kind: "conflict" });
    });
});
