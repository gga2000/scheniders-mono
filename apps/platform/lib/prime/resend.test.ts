import { describe, expect, it, vi } from "vitest";
import { isAlreadyResent, resendPrimeShipment } from "./resend";
import { PrimeApiError, type PrimeClient } from "./client";

type Row = Record<string, unknown>;
type Call = { table: string; op: "select" | "update"; payload?: Row; filters: [string, string, unknown][] };

/** Answers the shipment and order reads with the given rows; order updates land `orderUpdateRows` rows. */
function fakeDb(shipment: Row | null, orderRow: Row | null, orderUpdateRows = 1) {
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
            is: (col: string, v: unknown) => (call.filters.push(["is", col, v]), builder),
            maybeSingle: () => Promise.resolve({ data: table === "prime_shipments" ? shipment : orderRow, error: null }),
            then: (resolve: (r: { data: unknown; error: null }) => void) => {
                if (call.op === "update" && table === "orders") return resolve({ data: Array.from({ length: orderUpdateRows }, () => ({ id: "o" })), error: null });
                return resolve({ data: null, error: null });
            },
        };
        return builder;
    };
    return { db: { from } as unknown as Parameters<typeof resendPrimeShipment>[0], calls };
}

const merchant = { merchantLoginId: "kut_store", shopId: 5510 };
const returning = { id: "ps1", case_id: 52176693, shipment_status: "FAILED_DELIVER_RETURNED_TO_SENDER", cancelled_at: null };
const order = (extra: Row = {}): Row => ({
    id: "order-1",
    order_id: "12603020",
    status: "in_transit",
    version: 7,
    attention_reasons: ["delivery_returning", "cod_risk_new_customer"],
    customer_name: "Zahraa",
    phone: "07809998888",
    secondary_phone: "",
    city: "البصرة",
    governorate_code: "BAS",
    validated_governorate_code: null,
    address_details: "الجزائر",
    items: [{ name: "Envoy", quantity: 1, price: 50000 }],
    notes: "اتصل قبل",
    price: 50000,
    delivery_fee: 5000,
    discount_amount: 0,
    payment_status: "cod",
    is_return: false,
    is_replacement: false,
    ...extra,
});

const clientWith = (requestResend: ReturnType<typeof vi.fn>) => ({ requestResend }) as unknown as PrimeClient;
const updatesOf = (calls: Call[], table: string) => calls.filter((c) => c.op === "update" && c.table === table);

describe("resendPrimeShipment", () => {
    it("asks Prime with the order's current phone, governorate, address, amount and note, then drops the 'coming back' flag", async () => {
        const { db, calls } = fakeDb(returning, order());
        const resend = vi.fn(async () => undefined);
        const result = await resendPrimeShipment(db, clientWith(resend), "t1", merchant, "order-1", "evening");

        expect(result).toEqual({ ok: true, alreadyResent: false });
        expect(resend).toHaveBeenCalledWith(52176693, [
            { column: "c_rcv_hp1", value: "07809998888" },
            { column: "c_rcv_state", value: "BAS" },
            { column: "c_rcv_addr_rmk", value: "البصرة - الجزائر" },
            { column: "c_receiptamt", value: "55000" },
            { column: "c_rmk", value: "اتصل قبل" },
        ], "evening");
        expect(updatesOf(calls, "prime_shipments")[0].payload).toMatchObject({ resent_at: expect.any(String), push_error: null });
        const [flags] = updatesOf(calls, "orders");
        expect(flags.payload).toEqual({ needs_attention: true, attention_reasons: ["cod_risk_new_customer"] });
        expect(flags.filters).toEqual(expect.arrayContaining([["eq", "tenant_id", "t1"], ["eq", "id", "order-1"], ["eq", "version", 7]]));
    });

    it("Prime's 'already resent' counts as done", async () => {
        const { db } = fakeDb(returning, order());
        const resend = vi.fn(async () => { throw new PrimeApiError("تمت إعادة إرسال الشحنة مسبقاً.", 422); });
        expect(await resendPrimeShipment(db, clientWith(resend), "t1", merchant, "order-1")).toEqual({ ok: true, alreadyResent: true });
    });

    it("a refusal carries Prime's words; an unreachable Prime says so; neither touches the order", async () => {
        const refused = fakeDb(returning, order());
        const r1 = await resendPrimeShipment(refused.db, clientWith(vi.fn(async () => { throw new PrimeApiError("الشحنة غير متطابقة", 422, 4006); })), "t1", merchant, "order-1");
        expect(r1).toEqual({ ok: false, reason: "prime_rejected", message: "الشحنة غير متطابقة" });
        expect(updatesOf(refused.calls, "orders")).toHaveLength(0);

        const down = fakeDb(returning, order());
        const r2 = await resendPrimeShipment(down.db, clientWith(vi.fn(async () => { throw new TypeError("fetch failed"); })), "t1", merchant, "order-1");
        expect(r2).toMatchObject({ ok: false, reason: "prime_unreachable" });
        expect(updatesOf(down.calls, "prime_shipments")).toHaveLength(0);
    });

    it("only a parcel Prime is bringing back, on an order still out, can be resent", async () => {
        const resend = vi.fn();
        expect(await resendPrimeShipment(fakeDb(null, order()).db, clientWith(resend), "t1", merchant, "order-1")).toEqual({ ok: false, reason: "not_sent" });
        expect(await resendPrimeShipment(fakeDb({ ...returning, shipment_status: "ONWAY" }, order()).db, clientWith(resend), "t1", merchant, "order-1")).toEqual({ ok: false, reason: "not_returning" });
        expect(await resendPrimeShipment(fakeDb(returning, order({ status: "rejected" })).db, clientWith(resend), "t1", merchant, "order-1")).toEqual({ ok: false, reason: "order_closed" });
        expect(await resendPrimeShipment(fakeDb(returning, order({ phone: "0770" })).db, clientWith(resend), "t1", merchant, "order-1")).toEqual({ ok: false, reason: "bad_phone" });
        expect(resend).not.toHaveBeenCalled();
    });

    it("reads the shipment and the order from the caller's tenant only", async () => {
        const { db, calls } = fakeDb(returning, order());
        await resendPrimeShipment(db, clientWith(vi.fn(async () => undefined)), "t1", merchant, "order-1");
        const reads = calls.filter((c) => c.op === "select");
        for (const read of reads) expect(read.filters).toContainEqual(["eq", "tenant_id", "t1"]);
    });
});

describe("isAlreadyResent", () => {
    it("reads Prime's code, or its documented wording when the code is missing", () => {
        expect(isAlreadyResent(new PrimeApiError("x", 422, 7000))).toBe(true);
        expect(isAlreadyResent(new PrimeApiError("تمت إعادة إرسال الشحنة مسبقاً.", 422))).toBe(true);
        expect(isAlreadyResent(new PrimeApiError("لم يتم إيجاد الشحنة", 422))).toBe(false);
        expect(isAlreadyResent(new Error("تمت إعادة إرسال الشحنة مسبقاً."))).toBe(false);
    });
});
