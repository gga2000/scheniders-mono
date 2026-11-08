import { describe, expect, it, vi } from "vitest";
import { sendOrdersToPrime } from "./send";
import { PrimeApiError, type PrimeClient } from "./client";

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

type Row = Record<string, unknown>;

/**
 * A stand-in for the service client: answers the orders and prime_shipments
 * selects from the given rows, records inserts, and answers each insert with
 * the next entry of `insertErrors` (null = saved).
 */
function fakeDb(orders: Row[], existing: Row[] = [], insertErrors: ({ code: string; message: string } | null)[] = []) {
    const inserts: Row[] = [];
    const from = (table: string) => {
        const builder = {
            select: () => builder,
            eq: () => builder,
            in: () => builder,
            insert: (row: Row) => {
                inserts.push(row);
                return Promise.resolve({ error: insertErrors.shift() ?? null });
            },
            then: (resolve: (r: { data: unknown; error: null }) => void) =>
                resolve({ data: table === "orders" ? orders : existing, error: null }),
        };
        return builder;
    };
    return { db: { from } as unknown as Parameters<typeof sendOrdersToPrime>[0], inserts };
}

const merchant = { merchantLoginId: "kut_store", shopId: 5510 };

const order = (id: string, extra: Row = {}): Row => ({
    id,
    order_id: `1000${id.slice(-1)}`,
    status: "confirmed",
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

const clientWith = (createShipment: PrimeClient["createShipment"]) => ({ createShipment }) as unknown as PrimeClient;

describe("sendOrdersToPrime", () => {
    it("sends a waiting refund too, as 1 IQD with the money to pay in the note", async () => {
        const { db, inserts } = fakeDb([order("o2", { order_id: "RTN-4136-1", is_return: true, status: "return_pending", price: -36750, delivery_fee: 5000 })]);
        const create = vi.fn(async () => 202);

        const outcome = await sendOrdersToPrime(db, clientWith(create), "t1", merchant, ["o2"]);

        expect(outcome).toEqual({ sent: [{ orderId: "o2", caseId: 202 }], skipped: [], failed: [] });
        expect(create).toHaveBeenCalledWith(expect.objectContaining({ custReceiptNoOri: "4136", receiptAmtIqd: 1, haveReturnItems: "Y", rmk: expect.stringContaining("ادفع للزبون 31,750") }));
        expect(inserts).toEqual([expect.objectContaining({ order_id: "o2", receipt_no: "4136", case_id: 202, receipt_amount_iqd: 1 })]);
    });

    it("sends each confirmed order once and saves Prime's case", async () => {
        const { db, inserts } = fakeDb([order("o1")]);
        let next = 100;
        const client = clientWith(vi.fn(async () => (next += 1)));

        const outcome = await sendOrdersToPrime(db, client, "t1", merchant, ["o1"]);

        expect(outcome).toEqual({ sent: [{ orderId: "o1", caseId: 101 }], skipped: [], failed: [] });
        expect(inserts).toEqual([
            {
                tenant_id: "t1",
                order_id: "o1",
                receipt_no: "10001",
                case_id: 101,
                shipment_status: "ONWAY",
                receipt_amount_iqd: 55000,
                pushed_hash: expect.stringMatching(/^[0-9a-f]{32}$/),
            },
        ]);
    });

    it("reports an already-sent order as sent without calling Prime, and a closed case as prime_closed", async () => {
        const { db } = fakeDb(
            [order("o1"), order("o2")],
            [{ order_id: "o1", case_id: 55, shipment_status: "ONWAY" }, { order_id: "o2", case_id: 56, shipment_status: "FAILED_DELIVER_RETURNED_TO_SENDER" }],
        );
        const create = vi.fn();
        const outcome = await sendOrdersToPrime(db, clientWith(create), "t1", merchant, ["o1", "o2"]);

        expect(create).not.toHaveBeenCalled();
        expect(outcome.sent).toEqual([{ orderId: "o1", caseId: 55 }]);
        expect(outcome.failed).toEqual([{ orderId: "o2", reason: "prime_closed", message: "Prime case 56 is FAILED_DELIVER_RETURNED_TO_SENDER" }]);
    });

    it("an order whose Prime case was deleted on cancel is not reported as sent", async () => {
        const { db } = fakeDb([order("o1")], [{ order_id: "o1", case_id: 57, shipment_status: "ONWAY", cancelled_at: "2026-11-03T10:00:00Z" }]);
        const create = vi.fn();
        const outcome = await sendOrdersToPrime(db, clientWith(create), "t1", merchant, ["o1"]);
        expect(create).not.toHaveBeenCalled();
        expect(outcome.failed).toEqual([{ orderId: "o1", reason: "prime_closed", message: "Prime case 57 was deleted when the order was cancelled" }]);
    });

    it("tells a refusal (Prime's own words) from an unreachable Prime", async () => {
        const { db } = fakeDb([order("o1"), order("o2"), order("o3", { phone: "123" })]);
        const client = clientWith(
            vi.fn(async (payload) => {
                if (payload.custReceiptNoOri === "10001") throw new PrimeApiError("رقم هاتف المستلم غير صحيح", 422, 29);
                throw new TypeError("fetch failed");
            }),
        );
        const outcome = await sendOrdersToPrime(db, client, "t1", merchant, ["o1", "o2", "o3", "o9"]);

        expect(outcome.sent).toEqual([]);
        expect(outcome.failed).toEqual([
            { orderId: "o9", reason: "not_found" },
            { orderId: "o3", reason: "bad_phone" },
            { orderId: "o1", reason: "prime_rejected", message: "رقم هاتف المستلم غير صحيح" },
            { orderId: "o2", reason: "prime_unreachable", message: "fetch failed" },
        ]);
    });

    it("a 2xx with no result (a field Prime's column cannot hold) is a refusal, not an outage", async () => {
        const { db } = fakeDb([order("o1")]);
        const client = clientWith(vi.fn(async () => { throw new PrimeApiError("Prime gave no result", 204); }));
        const outcome = await sendOrdersToPrime(db, client, "t1", merchant, ["o1"]);
        expect(outcome.failed[0]).toMatchObject({ orderId: "o1", reason: "prime_rejected" });
    });

    it("stops calling Prime once a whole round found it unreachable", async () => {
        const ids = ["o1", "o2", "o3", "o4", "o5", "o6", "o7"];
        const { db } = fakeDb(ids.map((id) => order(id)));
        const create = vi.fn(async () => { throw new TypeError("fetch failed"); });
        const outcome = await sendOrdersToPrime(db, clientWith(create), "t1", merchant, ids);

        expect(create).toHaveBeenCalledTimes(4);
        expect(outcome.failed).toHaveLength(7);
        expect(outcome.failed.every((f) => f.reason === "prime_unreachable")).toBe(true);
    });

    it("keeps an order sent when its row already exists, and reports a receipt held by another order", async () => {
        const { db } = fakeDb([order("o1"), order("o2")], [], [
            { code: "23505", message: 'duplicate key value violates unique constraint "prime_shipments_order_unique"' },
            { code: "23505", message: 'duplicate key value violates unique constraint "prime_shipments_case_unique"' },
        ]);
        const client = clientWith(vi.fn(async () => 77));
        const outcome = await sendOrdersToPrime(db, client, "t1", merchant, ["o1", "o2"]);

        expect(outcome.sent).toEqual([{ orderId: "o1", caseId: 77 }]);
        expect(outcome.failed).toEqual([{ orderId: "o2", reason: "duplicate_receipt" }]);
    });

    it("ships only orders waiting for the courier: confirmed, or return_pending for a refund", async () => {
        const { db } = fakeDb([
            order("o1", { status: "in_transit" }),
            order("o2", { status: "return_pending" }),
            order("o3", { is_return: true, status: "confirmed" }),
        ]);
        const outcome = await sendOrdersToPrime(db, clientWith(vi.fn()), "t1", merchant, ["o1", "o2", "o3"]);
        expect(outcome.failed).toEqual([
            { orderId: "o1", reason: "not_confirmed" },
            { orderId: "o2", reason: "not_confirmed" },
            { orderId: "o3", reason: "not_confirmed" },
        ]);
    });
});
