import { describe, expect, it, vi } from "vitest";
import { syncPrimeTenant } from "./sync";
import type { PrimeClient, PrimeShipmentInfo } from "./client";

type Call = { table: string; op: "select" | "update" | "insert"; payload?: Record<string, unknown>; rows?: Record<string, unknown>[]; filters: [string, string, unknown][] };

/**
 * A stand-in for the service client: records every query and answers selects
 * on prime_shipments with `tracked` (open orders) first, `closed` (orders a
 * person closed while still flagged) second and `refusedCancels` (cancelled
 * orders Prime already had) third, and order updates with
 * `orderUpdateRows` (0 = a person changed the order meanwhile, so the version
 * guard matched nothing).
 */
function fakeDb(tracked: unknown[], orderUpdateRows = 1, closed: unknown[] = [], refusedCancels: unknown[] = []) {
    const calls: Call[] = [];
    let shipmentSelects = 0;
    const from = (table: string) => {
        const call: Call = { table, op: "select", filters: [] };
        calls.push(call);
        const builder = {
            select: () => builder,
            update: (payload: Record<string, unknown>) => {
                call.op = "update";
                call.payload = payload;
                return builder;
            },
            insert: (rows: Record<string, unknown>[]) => {
                call.op = "insert";
                call.rows = rows;
                return builder;
            },
            eq: (col: string, v: unknown) => (call.filters.push(["eq", col, v]), builder),
            in: (col: string, v: unknown) => (call.filters.push(["in", col, v]), builder),
            not: (col: string, op: string, v: unknown) => (call.filters.push([`not.${op}`, col, v]), builder),
            overlaps: (col: string, v: unknown) => (call.filters.push(["overlaps", col, v]), builder),
            gte: (col: string, v: unknown) => (call.filters.push(["gte", col, v]), builder),
            is: (col: string, v: unknown) => (call.filters.push(["is", col, v]), builder),
            contains: (col: string, v: unknown) => (call.filters.push(["contains", col, v]), builder),
            then: (resolve: (r: { data: unknown; error: null }) => void) => {
                if (call.op === "select" && table === "prime_shipments") {
                    shipmentSelects += 1;
                    return resolve({ data: [tracked, closed, refusedCancels][shipmentSelects - 1] ?? [], error: null });
                }
                if (call.op === "update" && table === "orders")
                    return resolve({ data: Array.from({ length: orderUpdateRows }, () => ({ id: "o" })), error: null });
                return resolve({ data: null, error: null });
            },
        };
        return builder;
    };
    return { db: { from } as unknown as Parameters<typeof syncPrimeTenant>[0], calls };
}

const client = (infos: PrimeShipmentInfo[]) =>
    ({ shipmentsInfo: vi.fn().mockResolvedValue(infos) }) as unknown as PrimeClient;

const refused = (status: string, reasons: string[] = ["delivery_prime_cancel_by_hand"]) => ({
    id: "ps9",
    case_id: 52176699,
    shipment_status: "ONWAY",
    orders: { id: "order-9", status, version: 4, attention_reasons: reasons },
});

const row = (over: Partial<{ shipment_status: string; step_code: string; attention_reasons: string[] | null }> = {}) => ({
    id: "ps1",
    case_id: 52176640,
    shipment_status: over.shipment_status ?? "ONWAY",
    step_code: over.step_code ?? "ONWAY",
    orders: {
        id: "order-1",
        order_id: "4261103016",
        customer_name: "مريم سعد",
        city: "البصرة",
        status: "in_transit",
        version: 7,
        is_return: false,
        attention_reasons: over.attention_reasons ?? null,
    },
});

const steps = new Map([["DLEIVERD", "شحنات سلمت بنجاح"], ["RTN_WITHAGENT", "تعذر التوصيل"]]);

const updatesOf = (calls: Call[], table: string) => calls.filter((c) => c.op === "update" && c.table === table);
const noticesOf = (calls: Call[]) => calls.filter((c) => c.op === "insert" && c.table === "notifications").flatMap((c) => c.rows ?? []);

describe("syncPrimeTenant", () => {
    it("delivers the order, pinned to the version it read, then stores Prime's status and amount", async () => {
        const { db, calls } = fakeDb([row({ attention_reasons: ["delivery_returning"] })]);
        const outcome = await syncPrimeTenant(
            db,
            client([{ caseid: 52176640, shipmentStatus: "DELIVERED", stepCode: "DLEIVERD", shipmentCharge: 6000, receiptAmtIqd: 55000 }]),
            "t1",
            steps,
        );

        expect(outcome).toEqual({ checked: 1, delivered: 1, flagged: 0, conflicts: 0, cleared: 0, cancelsSettled: 0 });
        const [orderUpdate] = updatesOf(calls, "orders");
        expect(orderUpdate.payload).toMatchObject({
            status: "delivered",
            last_status_changed_by_name: "Prime",
            needs_attention: false,
            attention_reasons: [],
        });
        expect(orderUpdate.payload).toHaveProperty("delivered_at");
        expect(orderUpdate.filters).toEqual(expect.arrayContaining([["eq", "tenant_id", "t1"], ["eq", "id", "order-1"], ["eq", "version", 7]]));
        const shipmentUpdates = updatesOf(calls, "prime_shipments");
        expect(shipmentUpdates[0].payload).toMatchObject({
            shipment_status: "DELIVERED",
            step_name: "شحنات سلمت بنجاح",
            shipment_charge: 6000,
            receipt_amount_iqd: 55000,
        });
        expect(shipmentUpdates[1].payload).toHaveProperty("checked_at");
    });

    it("a return is flagged, never rejected: the returns desk does that when the parcel is scanned", async () => {
        const { db, calls } = fakeDb([row({ attention_reasons: ["cod_risk_new_customer"] })]);
        const outcome = await syncPrimeTenant(db, client([{ caseid: 52176640, shipmentStatus: "FAILED_DELIVER_RETURNED_TO_SENDER", stepCode: "RTN_WITHAGENT" }]), "t1", steps);

        expect(outcome.flagged).toBe(1);
        const [orderUpdate] = updatesOf(calls, "orders");
        expect(orderUpdate.payload).toEqual({ needs_attention: true, attention_reasons: ["cod_risk_new_customer", "delivery_returning"] });
        expect(orderUpdate.payload).not.toHaveProperty("status");
    });

    it("tells the store what Prime delivered, in one line per read", async () => {
        const { db, calls } = fakeDb([row()]);
        await syncPrimeTenant(db, client([{ caseid: 52176640, shipmentStatus: "DELIVERED", stepCode: "DLEIVERD" }]), "t1", steps);

        expect(noticesOf(calls)).toEqual([
            expect.objectContaining({
                tenant_id: "t1",
                type: "prime.delivered",
                category: "delivery",
                audience: "tenant",
                actor_name: "Prime",
                entity_type: "order",
                entity_id: "order-1",
                entity_label: "#4261103016",
                payload: { count: 1, city: "البصرة", customer: "مريم سعد" },
            }),
        ]);
    });

    it("a parcel coming back is its own notice, about its order", async () => {
        const { db, calls } = fakeDb([row()]);
        await syncPrimeTenant(db, client([{ caseid: 52176640, shipmentStatus: "FAILED_DELIVER_RETURNED_TO_SENDER", stepCode: "RTN_WITHAGENT" }]), "t1", steps);

        expect(noticesOf(calls)).toEqual([
            expect.objectContaining({
                type: "prime.returning",
                priority: "high",
                entity_id: "order-1",
                entity_label: "#4261103016",
                payload: { customer: "مريم سعد", city: "البصرة" },
            }),
        ]);
    });

    it("a move along the way, or a read a person beat, tells no one", async () => {
        const moved = fakeDb([row({ step_code: "READYTOPICKUP" })]);
        await syncPrimeTenant(moved.db, client([{ caseid: 52176640, shipmentStatus: "ONWAY", stepCode: "ONWAY" }]), "t1", steps);
        expect(noticesOf(moved.calls)).toEqual([]);

        const beaten = fakeDb([row()], 0);
        await syncPrimeTenant(beaten.db, client([{ caseid: 52176640, shipmentStatus: "DELIVERED", stepCode: "DLEIVERD" }]), "t1", steps);
        expect(noticesOf(beaten.calls)).toEqual([]);
    });

    it("keeps the amount we sent when Prime reports none", async () => {
        const { db, calls } = fakeDb([row({ step_code: "READYTOPICKUP" })]);
        await syncPrimeTenant(db, client([{ caseid: 52176640, shipmentStatus: "ONWAY", stepCode: "ONWAY" }]), "t1", steps);
        expect(updatesOf(calls, "prime_shipments")[0].payload).not.toHaveProperty("receipt_amount_iqd");
    });

    it("when a person changed the order meanwhile, Prime's status is not stored, so the next run tries again", async () => {
        const { db, calls } = fakeDb([row()], 0);
        const outcome = await syncPrimeTenant(db, client([{ caseid: 52176640, shipmentStatus: "DELIVERED", stepCode: "DLEIVERD" }]), "t1", steps);

        expect(outcome).toMatchObject({ delivered: 0, conflicts: 1 });
        const shipmentUpdates = updatesOf(calls, "prime_shipments");
        expect(shipmentUpdates).toHaveLength(1);
        expect(shipmentUpdates[0].payload).toEqual({ checked_at: expect.any(String) });
    });

    it("a new step with the same status only updates the shipment; the order is not touched", async () => {
        const { db, calls } = fakeDb([row({ step_code: "READYTOPICKUP" })]);
        await syncPrimeTenant(db, client([{ caseid: 52176640, shipmentStatus: "ONWAY", stepCode: "ONWAY" }]), "t1", steps);

        expect(updatesOf(calls, "orders")).toHaveLength(0);
        expect(updatesOf(calls, "prime_shipments")[0].payload).toMatchObject({ shipment_status: "ONWAY", step_code: "ONWAY", step_name: "ONWAY" });
    });

    it("reads only this tenant's open orders", async () => {
        const { db, calls } = fakeDb([]);
        await syncPrimeTenant(db, client([]), "t1", steps);
        const [select] = calls;
        expect(select.filters).toEqual(expect.arrayContaining([
            ["eq", "tenant_id", "t1"],
            ["eq", "orders.tenant_id", "t1"],
            ["in", "orders.status", ["confirmed", "in_transit"]],
        ]));
    });

    it("drops its own flag once a person closed the order (the returns desk scanned the parcel in), keeping other flags", async () => {
        const closed = {
            id: "ps2",
            orders: { id: "order-2", status: "rejected", version: 3, attention_reasons: ["delivery_returning", "cod_risk_new_customer"] },
        };
        const { db, calls } = fakeDb([], 1, [closed]);
        const outcome = await syncPrimeTenant(db, client([]), "t1", steps);

        expect(outcome.cleared).toBe(1);
        const settleSelect = calls.filter((c) => c.op === "select" && c.table === "prime_shipments")[1];
        expect(settleSelect.filters).toEqual(expect.arrayContaining([
            ["not.in", "orders.status", "(confirmed,in_transit)"],
            ["overlaps", "orders.attention_reasons", expect.arrayContaining(["delivery_returning"])],
        ]));
        const [orderUpdate] = updatesOf(calls, "orders");
        expect(orderUpdate.payload).toEqual({ needs_attention: true, attention_reasons: ["cod_risk_new_customer"] });
        expect(orderUpdate.filters).toEqual(expect.arrayContaining([["eq", "id", "order-2"], ["eq", "version", 3]]));
    });

    it("a closed order also drops a refused-edit flag, which no longer matters", async () => {
        const closed = { id: "ps2", orders: { id: "order-2", status: "delivered", version: 3, attention_reasons: ["delivery_prime_edit_refused"] } };
        const { db, calls } = fakeDb([], 1, [closed]);
        await syncPrimeTenant(db, client([]), "t1", steps);
        expect(updatesOf(calls, "orders")[0].payload).toEqual({ needs_attention: false, attention_reasons: [] });
    });

    it("keeps 'cancel with Prime by hand' while Prime still delivers the parcel", async () => {
        const { db, calls } = fakeDb([], 1, [], [refused("cancelled")]);
        const outcome = await syncPrimeTenant(db, client([{ caseid: 52176699, shipmentStatus: "ONWAY", stepCode: "ONWAY" }]), "t1", steps);
        expect(outcome.cancelsSettled).toBe(0);
        expect(updatesOf(calls, "orders")).toHaveLength(0);
        const refusedSelect = calls.filter((c) => c.op === "select" && c.table === "prime_shipments")[2];
        expect(refusedSelect.filters).toEqual(expect.arrayContaining([
            ["eq", "tenant_id", "t1"],
            ["not.is", "cancel_refused_at", null],
            ["contains", "orders.attention_reasons", ["delivery_prime_cancel_by_hand"]],
        ]));
    });

    it("drops 'cancel with Prime by hand' once Prime brings the parcel back, and stores Prime's status", async () => {
        const { db, calls } = fakeDb([], 1, [], [refused("cancelled", ["delivery_prime_cancel_by_hand", "cod_risk_new_customer"])]);
        const outcome = await syncPrimeTenant(
            db,
            client([{ caseid: 52176699, shipmentStatus: "FAILED_DELIVER_RETURNED_TO_SENDER", stepCode: "RTN_WITHAGENT" }]),
            "t1",
            steps,
        );
        expect(outcome.cancelsSettled).toBe(1);
        const [orderUpdate] = updatesOf(calls, "orders");
        expect(orderUpdate.payload).toEqual({ needs_attention: true, attention_reasons: ["cod_risk_new_customer"] });
        expect(orderUpdate.filters).toEqual(expect.arrayContaining([["eq", "id", "order-9"], ["eq", "version", 4]]));
        expect(updatesOf(calls, "prime_shipments").at(-1)?.payload).toMatchObject({ shipment_status: "FAILED_DELIVER_RETURNED_TO_SENDER", step_name: "تعذر التوصيل" });
    });

    it("a cancelled order Prime delivered anyway is flagged as a wrong status, never moved", async () => {
        const { db, calls } = fakeDb([], 1, [], [refused("cancelled")]);
        await syncPrimeTenant(db, client([{ caseid: 52176699, shipmentStatus: "DELIVERED", stepCode: "DLEIVERD" }]), "t1", steps);
        const [orderUpdate] = updatesOf(calls, "orders");
        expect(orderUpdate.payload).toEqual({ needs_attention: true, attention_reasons: ["delivery_wrong_status"] });
        expect(orderUpdate.payload).not.toHaveProperty("status");
    });

    it("a reopened order drops 'cancel with Prime by hand' without asking Prime", async () => {
        const { db, calls } = fakeDb([], 1, [], [refused("in_transit")]);
        const prime = client([]);
        const outcome = await syncPrimeTenant(db, prime, "t1", steps);
        expect(outcome.cancelsSettled).toBe(1);
        expect(prime.shipmentsInfo).not.toHaveBeenCalled();
        expect(updatesOf(calls, "orders")[0].payload).toEqual({ needs_attention: false, attention_reasons: [] });
    });
});
