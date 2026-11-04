import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearPrimeFeeCache, previewPrimeRun, primeFeeQuote } from "./desk-preview";
import { PrimeApiError, type PrimeClient } from "./client";

type Row = Record<string, unknown>;

/** Answers the orders and prime_shipments selects from the given rows, and records each filter. */
function fakeDb(orders: Row[], shipments: Row[] = []) {
    const filters: string[] = [];
    const from = (table: string) => {
        const builder = {
            select: () => builder,
            eq: (column: string, value: unknown) => {
                filters.push(`${table}.${column}=${String(value)}`);
                return builder;
            },
            in: () => builder,
            is: (column: string) => {
                filters.push(`${table}.${column} is null`);
                return builder;
            },
            then: (resolve: (r: { data: unknown; error: null }) => void) => resolve({ data: table === "orders" ? orders : shipments, error: null }),
        };
        return builder;
    };
    return { db: { from } as unknown as Parameters<typeof previewPrimeRun>[0], filters };
}

const merchant = { merchantLoginId: "kut_store", shopId: 5510 };

const order = (id: string, extra: Row = {}): Row => ({
    id,
    order_id: `1000${id.slice(-1)}`,
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

const clientWith = (shipmentCharge: PrimeClient["shipmentCharge"]) => ({ shipmentCharge }) as unknown as PrimeClient;

beforeEach(() => clearPrimeFeeCache());

describe("previewPrimeRun", () => {
    it("asks Prime once per governorate and amount, in the desk's order, scoped to the tenant", async () => {
        const { db, filters } = fakeDb([order("o2", { governorate_code: "BGD", city: "بغداد" }), order("o1"), order("o3")]);
        const charge = vi.fn(async (_m: string, state: string) => (state === "BAS" ? 6000 : 5000));

        const rows = await previewPrimeRun(db, clientWith(charge), "t1", merchant, ["o1", "o2", "o3"]);

        expect(rows).toEqual([
            { orderId: "o1", kind: "ready", fee: 6000, caseId: null },
            { orderId: "o2", kind: "ready", fee: 5000, caseId: null },
            { orderId: "o3", kind: "ready", fee: 6000, caseId: null },
        ]);
        expect(charge).toHaveBeenCalledTimes(2);
        expect(charge).toHaveBeenCalledWith("kut_store", "BAS", 55000, undefined);
        expect(filters).toEqual(expect.arrayContaining(["orders.tenant_id=t1", "prime_shipments.tenant_id=t1", "orders.deleted_at is null"]));
    });

    it("asks per picked district, and leaves out a district of another governorate", async () => {
        const { db } = fakeDb([
            order("o1", { prime_district: { id: 41, name: "العشار", state: "BAS" } }),
            order("o2"),
            order("o3", { prime_district: { id: 7, name: "المنصور", state: "BGD" } }),
        ]);
        const charge = vi.fn(async (_m: string, _s: string, _a: number, district?: number) => (district ? 7000 : 6000));

        const rows = await previewPrimeRun(db, clientWith(charge), "t1", merchant, ["o1", "o2", "o3"]);

        expect(rows.map((r) => (r.kind === "ready" ? r.fee : null))).toEqual([7000, 6000, 6000]);
        expect(charge).toHaveBeenCalledTimes(2);
        expect(charge).toHaveBeenCalledWith("kut_store", "BAS", 55000, 41);
        expect(charge).toHaveBeenCalledWith("kut_store", "BAS", 55000, undefined);
    });

    it("says what to fix, leaves refunds to the Excel file, and asks Prime nothing for either", async () => {
        const { db } = fakeDb([
            order("o1", { phone: "0770123456" }),
            order("o2", { governorate_code: null, city: "" }),
            order("o3", { is_return: true }),
        ]);
        const charge = vi.fn();

        const rows = await previewPrimeRun(db, clientWith(charge), "t1", merchant, ["o1", "o2", "o3"]);

        expect(rows).toEqual([
            { orderId: "o1", kind: "fix", reason: "bad_phone", caseId: null },
            { orderId: "o2", kind: "fix", reason: "no_governorate", caseId: null },
            { orderId: "o3", kind: "after_sale", caseId: null },
        ]);
        expect(charge).not.toHaveBeenCalled();
    });

    it("carries Prime's case for a parcel already sent, but not for one deleted at Prime", async () => {
        const { db } = fakeDb([order("o1"), order("o2")], [
            { order_id: "o1", case_id: 52176701, cancelled_at: null },
            { order_id: "o2", case_id: 52176702, cancelled_at: "2026-11-03T20:00:00Z" },
        ]);
        const rows = await previewPrimeRun(db, clientWith(vi.fn(async () => 6000)), "t1", merchant, ["o1", "o2"]);
        expect(rows.map((r) => r.caseId)).toEqual([52176701, null]);
    });

    it("no price at Prime, or no answer, shows no fee; only a real answer is cached", async () => {
        const { db } = fakeDb([order("o1", { governorate_code: "WA", city: "واسط" }), order("o2")]);
        const charge = vi.fn(async (_m: string, state: string) => {
            if (state === "BAS") throw new PrimeApiError("Prime did not answer", 503);
            return null;
        });
        const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);

        const first = await previewPrimeRun(db, clientWith(charge), "t1", merchant, ["o1", "o2"]);
        expect(first).toEqual([
            { orderId: "o1", kind: "ready", fee: null, caseId: null },
            { orderId: "o2", kind: "ready", fee: null, caseId: null },
        ]);

        await previewPrimeRun(db, clientWith(charge), "t1", merchant, ["o1", "o2"]);
        // KOT (answered: no price) came from the cache; BAS (no answer) was asked again.
        expect(charge.mock.calls.map((c) => c[1])).toEqual(["KOT", "BAS", "BAS"]);
        expect(errors).toHaveBeenCalledTimes(2);
        errors.mockRestore();
    });
});

describe("primeFeeQuote", () => {
    it("asks Prime once for the same governorate, district and amount, then answers from the cache", async () => {
        const charge = vi.fn(async () => 5000);
        const client = clientWith(charge);

        await expect(primeFeeQuote(client, "kut_store", "BGD", 36750, 12)).resolves.toBe(5000);
        await expect(primeFeeQuote(client, "kut_store", "BGD", 36750, 12)).resolves.toBe(5000);
        await expect(primeFeeQuote(client, "kut_store", "BGD", 36750)).resolves.toBe(5000);

        expect(charge).toHaveBeenCalledTimes(2);
        expect(charge).toHaveBeenNthCalledWith(1, "kut_store", "BGD", 36750, 12);
        expect(charge).toHaveBeenNthCalledWith(2, "kut_store", "BGD", 36750, undefined);
    });

    it("throws when Prime does not answer, and asks again next time", async () => {
        const charge = vi.fn(async (): Promise<number | null> => {
            throw new PrimeApiError("down", 500);
        });
        const client = clientWith(charge);
        await expect(primeFeeQuote(client, "kut_store", "BGD", 1000)).rejects.toBeInstanceOf(PrimeApiError);
        charge.mockResolvedValueOnce(null);
        await expect(primeFeeQuote(client, "kut_store", "BGD", 1000)).resolves.toBeNull();
        expect(charge).toHaveBeenCalledTimes(2);
    });
});
