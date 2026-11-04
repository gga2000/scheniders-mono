import { describe, expect, it, vi } from "vitest";
import { pullBackPrimeShipment } from "./pull-back";
import { PrimeApiError, type PrimeClient } from "./client";

type Row = Record<string, unknown>;
type Call = { table: string; op: "select" | "delete" | "update"; payload?: Row; filters: [string, string, unknown][] };

/** Answers the shipment and order reads with the given rows and records every call. */
function fakeDb(shipment: Row | null, orderRow: Row | null, movedRows = 1) {
    const calls: Call[] = [];
    const from = (table: string) => {
        const call: Call = { table, op: "select", filters: [] };
        calls.push(call);
        const builder = {
            select: () => builder,
            delete: () => ((call.op = "delete"), builder),
            update: (payload: Row) => ((call.op = "update"), (call.payload = payload), builder),
            eq: (col: string, v: unknown) => (call.filters.push(["eq", col, v]), builder),
            is: (col: string, v: unknown) => (call.filters.push(["is", col, v]), builder),
            maybeSingle: () => Promise.resolve({ data: table === "prime_shipments" ? shipment : orderRow, error: null }),
            then: (resolve: (r: { data: unknown; error: null }) => void) =>
                resolve({ data: call.op === "update" ? Array.from({ length: movedRows }, () => ({ id: "o1" })) : null, error: null }),
        };
        return builder;
    };
    return { db: { from } as unknown as Parameters<typeof pullBackPrimeShipment>[0], calls };
}

const sent = { id: "ps1", case_id: 52402395, cancelled_at: null };
const clientWith = (deleteShipment: ReturnType<typeof vi.fn>) => ({ deleteShipment }) as unknown as PrimeClient;
const deletes = (calls: Call[]) => calls.filter((c) => c.op === "delete");
const moves = (calls: Call[]) => calls.filter((c) => c.op === "update");

describe("pullBackPrimeShipment", () => {
    it("deletes the case at Prime and our shipment row, tenant-scoped", async () => {
        const { db, calls } = fakeDb(sent, { status: "in_transit" });
        const deleteShipment = vi.fn().mockResolvedValue(undefined);
        expect(await pullBackPrimeShipment(db, clientWith(deleteShipment), "t1", "o1")).toEqual({ ok: true });
        expect(deleteShipment).toHaveBeenCalledWith(52402395);
        expect(deletes(calls)).toEqual([{ table: "prime_shipments", op: "delete", filters: [["eq", "tenant_id", "t1"], ["eq", "id", "ps1"]] }]);
        expect(calls[0].filters).toEqual([["eq", "tenant_id", "t1"], ["eq", "order_id", "o1"]]);
    });

    it("moves the order back to confirmed under the person's name, only from the status it had", async () => {
        const { db, calls } = fakeDb(sent, { status: "in_transit" });
        await pullBackPrimeShipment(db, clientWith(vi.fn().mockResolvedValue(undefined)), "t1", "o1", "Noor");
        const [move] = moves(calls);
        expect(move.payload).toMatchObject({ status: "confirmed", last_status_changed_by_name: "Noor", rejection_reason: null });
        expect(move.filters).toEqual([["eq", "tenant_id", "t1"], ["eq", "id", "o1"], ["eq", "status", "in_transit"]]);
    });

    it("says so when someone changed the order meanwhile", async () => {
        const { db } = fakeDb(sent, { status: "in_transit" }, 0);
        expect(await pullBackPrimeShipment(db, clientWith(vi.fn().mockResolvedValue(undefined)), "t1", "o1")).toEqual({ ok: false, reason: "status_not_moved" });
    });

    it("leaves an order that is still confirmed as it is", async () => {
        const { db, calls } = fakeDb(sent, { status: "confirmed" });
        expect(await pullBackPrimeShipment(db, clientWith(vi.fn().mockResolvedValue(undefined)), "t1", "o1")).toEqual({ ok: true });
        expect(moves(calls)).toEqual([]);
    });

    it("changes nothing once Prime has the parcel", async () => {
        const { db, calls } = fakeDb(sent, { status: "in_transit" });
        const deleteShipment = vi.fn().mockRejectedValue(new PrimeApiError("received", 422, 12));
        expect(await pullBackPrimeShipment(db, clientWith(deleteShipment), "t1", "o1")).toEqual({ ok: false, reason: "already_picked_up" });
        expect(deletes(calls)).toEqual([]);
        expect(moves(calls)).toEqual([]);
    });

    it("counts a case Prime no longer knows as taken back", async () => {
        const { db, calls } = fakeDb(sent, { status: "in_transit" });
        const deleteShipment = vi.fn().mockRejectedValue(new PrimeApiError("not found", 422, 4005));
        expect(await pullBackPrimeShipment(db, clientWith(deleteShipment), "t1", "o1")).toEqual({ ok: true });
        expect(deletes(calls)).toHaveLength(1);
    });

    it("keeps the row when Prime refuses for another reason", async () => {
        const { db, calls } = fakeDb(sent, { status: "in_transit" });
        const deleteShipment = vi.fn().mockRejectedValue(new PrimeApiError("نص الخطأ", 422, 99));
        expect(await pullBackPrimeShipment(db, clientWith(deleteShipment), "t1", "o1")).toEqual({ ok: false, reason: "prime_rejected", message: "نص الخطأ" });
        expect(deletes(calls)).toEqual([]);
    });

    it("asks nothing of Prime for an order never sent, already cancelled, or closed", async () => {
        const deleteShipment = vi.fn();
        expect(await pullBackPrimeShipment(fakeDb(null, { status: "in_transit" }).db, clientWith(deleteShipment), "t1", "o1")).toEqual({ ok: false, reason: "not_sent" });
        expect(await pullBackPrimeShipment(fakeDb({ ...sent, cancelled_at: "2026-11-04" }, { status: "in_transit" }).db, clientWith(deleteShipment), "t1", "o1")).toEqual({
            ok: false,
            reason: "not_sent",
        });
        expect(await pullBackPrimeShipment(fakeDb(sent, { status: "delivered" }).db, clientWith(deleteShipment), "t1", "o1")).toEqual({ ok: false, reason: "order_closed" });
        expect(deleteShipment).not.toHaveBeenCalled();
    });
});
