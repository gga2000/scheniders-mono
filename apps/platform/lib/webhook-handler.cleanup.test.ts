import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./supabase-server", () => ({ createSupabaseServiceClient: () => ({}) }));

import { cleanupAbandonedCheckouts } from "./webhook-handler";

type Call = { op: "select" | "update"; filters: Array<[string, string, unknown]> };

/**
 * Records every query's filters. `rows` answers selects; the scoping is what
 * is under test, so the fake answers regardless of filters — a test asserts on
 * what was ASKED for.
 */
function recorder(rows: { exact?: Array<{ id: string; order_id: string }>; phone?: Array<{ id: string; order_id: string }> }) {
    const calls: Call[] = [];
    const client = {
        from: () => {
            const call: Call = { op: "select", filters: [] };
            calls.push(call);
            const answer = () => {
                const byExact = call.filters.some(([, col]) => col === "order_id");
                return { data: (byExact ? rows.exact : rows.phone) ?? [], error: null };
            };
            const builder = {
                select: () => builder,
                update: () => { call.op = "update"; return builder; },
                eq: (col: string, v: unknown) => { call.filters.push(["eq", col, v]); return builder; },
                gte: (col: string, v: unknown) => { call.filters.push(["gte", col, v]); return builder; },
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

    it("scopes the phone lookup and the soft-delete to the tenant", async () => {
        const { calls, client } = recorder({ phone: [{ id: "c1", order_id: "checkout_1" }] });
        const r = await cleanupAbandonedCheckouts(client, {
            tenantId: "tenant-a", phone: "07700000000", orderNumber: "7455",
        });

        expect(r).toEqual({ method: "phone_time_window", deleted: ["checkout_1"] });
        expect(calls).toHaveLength(2);
        expect(calls.map(c => c.op)).toEqual(["select", "update"]);
        for (const c of calls) expect(tenantOf(c)).toBe("tenant-a");
        expect(calls[1]?.filters).toContainEqual(["in", "id", ["c1"]]);
    });

    it("scopes the exact checkout-id lookup to the tenant", async () => {
        const { calls, client } = recorder({ exact: [{ id: "c9", order_id: "checkout_9" }] });
        const r = await cleanupAbandonedCheckouts(client, {
            tenantId: "tenant-b", phone: "07700000000", checkoutId: "checkout_9", orderNumber: "7456",
        });

        expect(r.method).toBe("exact_checkout_id");
        expect(calls.map(c => c.op)).toEqual(["select", "update"]);
        for (const c of calls) expect(tenantOf(c)).toBe("tenant-b");
    });

    it("falls back to the scoped phone lookup when the exact id finds nothing", async () => {
        const { calls, client } = recorder({ exact: [], phone: [] });
        const r = await cleanupAbandonedCheckouts(client, {
            tenantId: "tenant-c", phone: "07700000000", checkoutId: "checkout_x", orderNumber: "7457",
        });

        expect(r).toEqual({ method: null, deleted: [] });
        expect(calls.map(c => c.op)).toEqual(["select", "select"]);
        for (const c of calls) expect(tenantOf(c)).toBe("tenant-c");
    });
});
