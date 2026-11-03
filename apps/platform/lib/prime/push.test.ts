import { describe, expect, it, vi } from "vitest";
import { pushPrimeChanges } from "./push";
import { PrimeApiError, type PrimeClient } from "./client";
import { buildPrimeShipment, primeShipmentHash, primeUpdateFields } from "./shipment-payload";
import type { CourierSheetOrder } from "@/lib/shipping/courier-sheets";

type Row = Record<string, unknown>;
type Call = { table: string; op: "select" | "update"; payload?: Row; filters: [string, string, unknown][] };

/**
 * A stand-in for the service client: the queue select answers `queue`,
 * order updates answer `orderUpdateRows` rows (0 = a person changed the
 * order meanwhile), and every query is recorded.
 */
function fakeDb(queue: Row[], orderUpdateRows = 1) {
    const calls: Call[] = [];
    const from = (table: string) => {
        const call: Call = { table, op: "select", filters: [] };
        calls.push(call);
        const builder = {
            select: () => builder,
            update: (payload: Row) => {
                call.op = "update";
                call.payload = payload;
                return builder;
            },
            eq: (col: string, v: unknown) => (call.filters.push(["eq", col, v]), builder),
            or: (v: string) => (call.filters.push(["or", "", v]), builder),
            limit: () => builder,
            then: (resolve: (r: { data: unknown; error: null }) => void) => {
                if (call.op === "select") return resolve({ data: queue, error: null });
                if (table === "orders") return resolve({ data: Array.from({ length: orderUpdateRows }, () => ({ id: "o" })), error: null });
                return resolve({ data: null, error: null });
            },
        };
        return builder;
    };
    return { db: { from } as unknown as Parameters<typeof pushPrimeChanges>[0], calls };
}

const merchant = { merchantLoginId: "kut_store", shopId: 5510 };
/** Queued a minute ago, in Postgres's microsecond form: the guard must match it exactly. */
const QUEUED_AT = new Date(Date.now() - 60_000).toISOString().replace(/Z$/, "456+00:00");

const order = (extra: Row = {}): Row => ({
    id: "order-1",
    order_id: "12603020",
    status: "in_transit",
    version: 7,
    deleted_at: null,
    attention_reasons: null,
    customer_name: "Zahraa",
    phone: "07701234567",
    secondary_phone: "",
    city: "البصرة",
    governorate_code: "BAS",
    validated_governorate_code: null,
    address_details: "العشار",
    items: [{ name: "Envoy", quantity: 1, price: 50000 }],
    notes: "",
    price: 50000,
    delivery_fee: 5000,
    discount_amount: 0,
    payment_status: "cod",
    is_return: false,
    is_replacement: false,
    ...extra,
});

/** Prime's fingerprint of an order as it was when sent. */
const hashOf = (o: Row) => {
    const built = buildPrimeShipment(o as unknown as CourierSheetOrder, merchant);
    if (!built.ok) throw new Error("test order must build");
    return primeShipmentHash(primeUpdateFields(built.payload));
};

const queued = (o: Row, extra: Row = {}): Row => ({
    id: "ps1",
    case_id: 52176693,
    shipment_status: "ONWAY",
    pushed_hash: hashOf(order()),
    push_needed_at: QUEUED_AT,
    cancel_needed_at: null,
    orders: o,
    ...extra,
});

const prime = (over: Partial<Record<"updateShipment" | "deleteShipment", ReturnType<typeof vi.fn>>> = {}) => {
    const client = { updateShipment: over.updateShipment ?? vi.fn(async () => undefined), deleteShipment: over.deleteShipment ?? vi.fn(async () => undefined) };
    return { client: client as unknown as PrimeClient, ...client };
};

const updatesOf = (calls: Call[], table: string) => calls.filter((c) => c.op === "update" && c.table === table);

describe("pushPrimeChanges", () => {
    it("reads only this tenant's queue", async () => {
        const { db, calls } = fakeDb([]);
        await pushPrimeChanges(db, prime().client, "t1", merchant);
        expect(calls[0].filters).toEqual(expect.arrayContaining([
            ["eq", "tenant_id", "t1"],
            ["eq", "orders.tenant_id", "t1"],
            ["or", "", "push_needed_at.not.is.null,cancel_needed_at.not.is.null"],
        ]));
    });

    it("sends a real edit as the full set of fields, stores the new fingerprint, and clears the entry only if no newer edit came", async () => {
        const edited = order({ phone: "07809998888", address_details: "الجزائر" });
        const { db, calls } = fakeDb([queued(edited)]);
        const p = prime();
        const outcome = await pushPrimeChanges(db, p.client, "t1", merchant);

        expect(outcome).toMatchObject({ updated: 1, refused: 0, deferred: 0 });
        expect(p.updateShipment).toHaveBeenCalledWith(52176693, expect.objectContaining({ receiverHp1: "07809998888", locationDetails: "البصرة - الجزائر", senderId: 5510 }));
        const [stored, cleared] = updatesOf(calls, "prime_shipments");
        expect(stored.payload).toMatchObject({ pushed_hash: hashOf(edited), push_error: null });
        expect(cleared.payload).toEqual({ push_needed_at: null, push_error: null });
        expect(cleared.filters).toEqual([["eq", "id", "ps1"], ["eq", "push_needed_at", QUEUED_AT]]);
    });

    it("an edit Prime would not see (an internal note, a same-value save) makes no call", async () => {
        const { db, calls } = fakeDb([queued(order())]);
        const p = prime();
        const outcome = await pushPrimeChanges(db, p.client, "t1", merchant);
        expect(outcome.unchanged).toBe(1);
        expect(p.updateShipment).not.toHaveBeenCalled();
        expect(updatesOf(calls, "prime_shipments")).toHaveLength(1);
    });

    it("an edit Prime refuses flags the order (version-guarded) with Prime's words, and leaves the queue", async () => {
        const { db, calls } = fakeDb([queued(order({ phone: "07809998888" }))]);
        const p = prime({ updateShipment: vi.fn(async () => { throw new PrimeApiError("حالة الشحنة أو خطوتها لا تسمح بالتعديل", 422, 5); }) });
        const outcome = await pushPrimeChanges(db, p.client, "t1", merchant);

        expect(outcome.refused).toBe(1);
        const [flag] = updatesOf(calls, "orders");
        expect(flag.payload).toEqual({ needs_attention: true, attention_reasons: ["delivery_prime_edit_refused"] });
        expect(flag.filters).toEqual(expect.arrayContaining([["eq", "tenant_id", "t1"], ["eq", "id", "order-1"], ["eq", "version", 7]]));
        expect(updatesOf(calls, "prime_shipments")[0].payload).toEqual({ push_needed_at: null, push_error: "حالة الشحنة أو خطوتها لا تسمح بالتعديل" });
    });

    it("an order now holding something Prime cannot take is flagged with our reason, and Prime is not called", async () => {
        const { db, calls } = fakeDb([queued(order({ phone: "0770" }))]);
        const p = prime();
        await pushPrimeChanges(db, p.client, "t1", merchant);
        expect(p.updateShipment).not.toHaveBeenCalled();
        expect(updatesOf(calls, "prime_shipments")[0].payload).toMatchObject({ push_error: "skip:bad_phone" });
    });

    it("once Prime holds the order's details again, the refused-edit flag goes", async () => {
        const { db, calls } = fakeDb([queued(order({ attention_reasons: ["delivery_prime_edit_refused", "cod_risk_new_customer"] }))]);
        await pushPrimeChanges(db, prime().client, "t1", merchant);
        expect(updatesOf(calls, "orders")[0].payload).toEqual({ needs_attention: true, attention_reasons: ["cod_risk_new_customer"] });
    });

    it("a lost race with a person leaves the entry queued for the next run", async () => {
        const { db, calls } = fakeDb([queued(order({ phone: "07809998888" }))], 0);
        const p = prime({ updateShipment: vi.fn(async () => { throw new PrimeApiError("refused", 422, 5); }) });
        const outcome = await pushPrimeChanges(db, p.client, "t1", merchant);
        expect(outcome.conflicts).toBe(1);
        expect(updatesOf(calls, "prime_shipments")).toHaveLength(0);
    });

    it("a parcel Prime has finished with, or an order no longer out, takes no edits", async () => {
        const { db } = fakeDb([
            queued(order({ phone: "07809998888" }), { shipment_status: "DELIVERED" }),
            queued(order({ phone: "07809998888", status: "delivered" }), { id: "ps2" }),
        ]);
        const p = prime();
        const outcome = await pushPrimeChanges(db, p.client, "t1", merchant);
        expect(p.updateShipment).not.toHaveBeenCalled();
        expect(outcome.unchanged).toBe(2);
    });

    it("an unreachable Prime keeps entries queued; three in a row and the rest wait for the next run", async () => {
        const rows = ["a", "b", "c", "d", "e"].map((id) => queued(order({ phone: "07809998888" }), { id }));
        const { db, calls } = fakeDb(rows);
        const p = prime({ updateShipment: vi.fn(async () => { throw new TypeError("fetch failed"); }) });
        const outcome = await pushPrimeChanges(db, p.client, "t1", merchant);
        expect(p.updateShipment).toHaveBeenCalledTimes(3);
        expect(outcome.deferred).toBe(5);
        expect(updatesOf(calls, "prime_shipments")).toHaveLength(0);
    });

    it("one entry Prime answers with a server fault does not hold back the others", async () => {
        const rows = [queued(order({ phone: "07809998888" }), { id: "bad", case_id: 1 }), queued(order({ phone: "07809998888" }), { id: "good" })];
        const { db } = fakeDb(rows);
        const p = prime({
            updateShipment: vi.fn(async (caseId: number) => {
                if (caseId === 1) throw new PrimeApiError("HTTP 500", 500);
            }),
        });
        const outcome = await pushPrimeChanges(db, p.client, "t1", merchant);
        expect(outcome).toMatchObject({ deferred: 1, updated: 1 });
    });

    it("an edit Prime has not answered for an hour is flagged for a person and stays queued", async () => {
        const { db, calls } = fakeDb([queued(order({ phone: "07809998888" }), { push_needed_at: new Date(Date.now() - 2 * 3_600_000).toISOString() })]);
        const p = prime({ updateShipment: vi.fn(async () => { throw new TypeError("fetch failed"); }) });
        await pushPrimeChanges(db, p.client, "t1", merchant);
        expect(updatesOf(calls, "orders")[0].payload).toEqual({ needs_attention: true, attention_reasons: ["delivery_prime_edit_refused"] });
        expect(updatesOf(calls, "prime_shipments")).toHaveLength(0);
    });

    it("a cancelled order deletes the shipment at Prime", async () => {
        const { db, calls } = fakeDb([queued(order({ status: "cancelled" }), { push_needed_at: null, cancel_needed_at: QUEUED_AT })]);
        const p = prime();
        const outcome = await pushPrimeChanges(db, p.client, "t1", merchant);
        expect(outcome.cancelled).toBe(1);
        expect(p.deleteShipment).toHaveBeenCalledWith(52176693);
        const [row] = updatesOf(calls, "prime_shipments");
        expect(row.payload).toMatchObject({ cancel_needed_at: null, push_needed_at: null, push_error: null, cancelled_at: expect.any(String) });
        expect(row.filters).toEqual([["eq", "id", "ps1"], ["eq", "cancel_needed_at", QUEUED_AT]]);
    });

    it("a shipment Prime no longer knows (already deleted) counts as cancelled", async () => {
        const { db } = fakeDb([queued(order({ deleted_at: "2026-11-03T20:00:00Z" }), { cancel_needed_at: QUEUED_AT })]);
        const p = prime({ deleteShipment: vi.fn(async () => { throw new PrimeApiError("لم يتم إيجاد الشحنة", 422, 4005); }) });
        expect((await pushPrimeChanges(db, p.client, "t1", merchant)).cancelled).toBe(1);
    });

    it("when Prime already has the parcel, the order is flagged 'cancel with Prime by hand'", async () => {
        const { db, calls } = fakeDb([queued(order({ status: "cancelled" }), { cancel_needed_at: QUEUED_AT })]);
        const p = prime({ deleteShipment: vi.fn(async () => { throw new PrimeApiError("لا يمكن حذف الشحنة لأن الشركة استلمتها", 422, 12); }) });
        const outcome = await pushPrimeChanges(db, p.client, "t1", merchant);
        expect(outcome.refused).toBe(1);
        expect(updatesOf(calls, "orders")[0].payload).toEqual({ needs_attention: true, attention_reasons: ["delivery_prime_cancel_by_hand"] });
        expect(updatesOf(calls, "prime_shipments")[0].payload).toMatchObject({
            cancel_needed_at: null,
            cancel_refused_at: expect.any(String),
            push_error: "لا يمكن حذف الشحنة لأن الشركة استلمتها",
        });
    });

    it("an order reopened before the cancellation went out deletes nothing", async () => {
        const { db, calls } = fakeDb([queued(order(), { push_needed_at: null, cancel_needed_at: QUEUED_AT })]);
        const p = prime();
        const outcome = await pushPrimeChanges(db, p.client, "t1", merchant);
        expect(p.deleteShipment).not.toHaveBeenCalled();
        expect(outcome.unchanged).toBe(1);
        expect(updatesOf(calls, "prime_shipments")[0].payload).toEqual({ cancel_needed_at: null });
    });
});
