import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./supabase-server", () => ({ createSupabaseServiceClient: () => ({}) }));

import { cleanupAbandonedCheckouts } from "./webhook-handler";

type Call = { op: "select" | "update"; filters: Array<[string, string, unknown]> };

/**
 * Records every query's filters. `rows` answers selects; the scoping is what
 * is under test, so the fake answers regardless of filters — a test asserts on
 * what was ASKED for.
 */
function recorder(rows: { exact?: Array<{ id: string; order_id: string }> }) {
    const calls: Call[] = [];
    const client = {
        from: () => {
            const call: Call = { op: "select", filters: [] };
            calls.push(call);
            const answer = () => ({ data: rows.exact ?? [], error: null });
            const builder = {
                select: () => builder,
                update: () => { call.op = "update"; return builder; },
                eq: (col: string, v: unknown) => { call.filters.push(["eq", col, v]); return builder; },
                is: (col: string, v: unknown) => { call.filters.push(["is", col, v]); return builder; },
                in: (col: string, v: unknown) => { call.filters.push(["in", col, v]); return builder; },
                then: (resolve: (v: ReturnType<typeof answer>) => void) => resolve(call.op === "update" ? { data: [], error: null } : answer()),
            };
            return builder;
        },
    };
    return { calls, client: client as unknown as Parameters<typeof cleanupAbandonedCheckouts>[0] };
}

const tenantOf = (c: Call) => c.filters.find(([op, col]) => op === "eq" && col === "tenant_id")?.[2];

describe("cleanupAbandonedCheckouts — tenant scoping", () => {
    beforeEach(() => {
        vi.spyOn(console, "log").mockImplementation(() => {});
    });
    afterEach(() => vi.restoreAllMocks());

    it("scopes the exact checkout-id lookup and the soft-delete to the tenant", async () => {
        const { calls, client } = recorder({ exact: [{ id: "c9", order_id: "checkout_9" }] });
        const r = await cleanupAbandonedCheckouts(client, {
            tenantId: "tenant-b", checkoutId: "checkout_9", orderNumber: "7456",
        });

        expect(r).toEqual({ deleted: ["checkout_9"] });
        expect(calls.map(c => c.op)).toEqual(["select", "update"]);
        for (const c of calls) expect(tenantOf(c)).toBe("tenant-b");
        expect(calls[0]?.filters).toContainEqual(["is", "deleted_at", null]);
        expect(calls[1]?.filters).toContainEqual(["in", "id", ["c9"]]);
    });

    it("does nothing when the exact id finds no open checkout", async () => {
        const { calls, client } = recorder({ exact: [] });
        const r = await cleanupAbandonedCheckouts(client, {
            tenantId: "tenant-c", checkoutId: "checkout_x", orderNumber: "7457",
        });

        expect(r).toEqual({ deleted: [] });
        expect(calls.map(c => c.op)).toEqual(["select"]);
        expect(tenantOf(calls[0] as Call)).toBe("tenant-c");
    });

    it("never touches the database without a checkout id (same-phone checkouts are the database's job)", async () => {
        const { calls, client } = recorder({ exact: [{ id: "c1", order_id: "checkout_1" }] });
        const r = await cleanupAbandonedCheckouts(client, { tenantId: "tenant-a", orderNumber: "7455" });

        expect(r).toEqual({ deleted: [] });
        expect(calls).toHaveLength(0);
    });
});
