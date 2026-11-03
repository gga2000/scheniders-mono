import { describe, expect, it, vi } from "vitest";
import { syncPrimeTenant } from "./sync";
import type { PrimeClient, PrimeShipmentInfo } from "./client";

type Call = { table: string; op: "select" | "update"; payload?: Record<string, unknown>; filters: [string, string, unknown][] };

/**
 * A stand-in for the service client: records every query and answers selects
 * from `tracked` and order updates with `orderUpdateRows` (0 = a person changed
 * the order meanwhile, so the version guard matched nothing).
 */
function fakeDb(tracked: unknown[], orderUpdateRows = 1) {
    const calls: Call[] = [];
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
            eq: (col: string, v: unknown) => (call.filters.push(["eq", col, v]), builder),
            in: (col: string, v: unknown) => (call.filters.push(["in", col, v]), builder),
            gte: (col: string, v: unknown) => (call.filters.push(["gte", col, v]), builder),
            then: (resolve: (r: { data: unknown; error: null }) => void) => {
                if (call.op === "select" && table === "prime_shipments") return resolve({ data: tracked, error: null });
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

const row = (over: Partial<{ shipment_status: string; step_code: string; attention_reasons: string[] | null }> = {}) => ({
    id: "ps1",
    case_id: 52176640,
    shipment_status: over.shipment_status ?? "ONWAY",
    step_code: over.step_code ?? "ONWAY",
    orders: { id: "order-1", status: "in_transit", version: 7, is_return: false, attention_reasons: over.attention_reasons ?? null },
});

const steps = new Map([["DLEIVERD", "شحنات سلمت بنجاح"], ["RTN_WITHAGENT", "تعذر التوصيل"]]);

const updatesOf = (calls: Call[], table: string) => calls.filter((c) => c.op === "update" && c.table === table);

describe("syncPrimeTenant", () => {
    it("delivers the order, pinned to the version it read, then stores Prime's status", async () => {
        const { db, calls } = fakeDb([row({ attention_reasons: ["delivery_returning"] })]);
        const outcome = await syncPrimeTenant(db, client([{ caseid: 52176640, shipmentStatus: "DELIVERED", stepCode: "DLEIVERD", shipmentCharge: 6000 }]), "t1", steps);

        expect(outcome).toEqual({ checked: 1, delivered: 1, flagged: 0, conflicts: 0 });
        const [orderUpdate] = updatesOf(calls, "orders");
        expect(orderUpdate.payload).toMatchObject({
            status: "delivered",
            last_status_changed_by_name: "Prime",
            needs_attention: false,
            attention_reasons: [],
        });
        expect(orderUpdate.filters).toEqual(expect.arrayContaining([["eq", "tenant_id", "t1"], ["eq", "id", "order-1"], ["eq", "version", 7]]));
        const shipmentUpdates = updatesOf(calls, "prime_shipments");
        expect(shipmentUpdates[0].payload).toMatchObject({ shipment_status: "DELIVERED", step_name: "شحنات سلمت بنجاح", shipment_charge: 6000 });
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
});
