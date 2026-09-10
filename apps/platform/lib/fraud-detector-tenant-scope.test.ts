import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * The `customer_trust` lookup ran through the browser client even when called
 * from a route handler or a cron, where there is no session. `anon` has no
 * EXECUTE on `get_user_tenant_ids`, which the table's only RLS policy calls, so
 * every server-side lookup failed with `42501: permission denied` and the
 * failure path quietly returned a default assessment. The visible consequence
 * was that `previous_rejection` was never flagged on an incoming order, however
 * many deliveries that customer had refused.
 *
 * Fixing it means letting a caller pass a service-role client — which bypasses
 * RLS, and RLS is the only thing scoping this table to one merchant. These
 * tests pin the two halves that keep that safe.
 */
vi.mock("@/lib/supabase", () => ({ supabase: { from: () => { throw new Error("browser client must not be used here"); } } }));

type Captured = { table?: string; filters: Array<[string, string]> };

function fakeClient(row: Record<string, unknown> | null, captured: Captured) {
    const builder = {
        eq(column: string, value: string) {
            captured.filters.push([column, value]);
            return builder;
        },
        maybeSingle: async () => ({ data: row, error: null }),
    };
    return {
        from(table: string) {
            captured.table = table;
            return { select: () => builder };
        },
    };
}

const TRUST_ROW = {
    trust_tier: "risky",
    trust_score: 40,
    rejected_customer_fault_count: 3,
    total_orders: 9,
};

let errorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => { errorSpy = vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => { errorSpy.mockRestore(); vi.resetModules(); });

async function engine() {
    return (await import("./fraud-detector")).trustEngine;
}

describe("assessCustomerTrust — server-side tenant scoping", () => {
    it("scopes the lookup to the tenant when given a service-role client", async () => {
        const captured: Captured = { filters: [] };
        const trustEngine = await engine();

        const result = await trustEngine.assessCustomerTrust("07701234567", {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- a stub standing in for the Supabase client
            client: fakeClient(TRUST_ROW, captured) as any,
            tenantId: "tenant-a",
        });

        expect(captured.table).toBe("customer_trust");
        // The tenant filter is what replaces RLS once RLS is bypassed.
        expect(captured.filters).toContainEqual(["tenant_id", "tenant-a"]);
        expect(result.historicalData.rejectedCustomerFaultCount).toBe(3);
    });

    it("refuses an unscoped lookup rather than reading across tenants", async () => {
        const captured: Captured = { filters: [] };
        const trustEngine = await engine();

        const result = await trustEngine.assessCustomerTrust("07701234567", {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- a stub standing in for the Supabase client
            client: fakeClient(TRUST_ROW, captured) as any,
            tenantId: null,
        });

        // No query at all — not a query that happens to return nothing.
        expect(captured.table).toBeUndefined();
        // Degrades to the neutral assessment instead of another tenant's data.
        expect(result.historicalData.rejectedCustomerFaultCount).toBe(0);
        expect(result.isBlacklisted).toBe(false);
    });

    it("normalizes the phone before looking it up", async () => {
        const captured: Captured = { filters: [] };
        const trustEngine = await engine();

        await trustEngine.assessCustomerTrust("+964 770 123 4567", {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- a stub standing in for the Supabase client
            client: fakeClient(null, captured) as any,
            tenantId: "tenant-a",
        });

        const phoneFilter = captured.filters.find(([column]) => column === "phone");
        expect(phoneFilter).toBeDefined();
        expect(phoneFilter![1]).toBe(trustEngine.normalizePhone("+964 770 123 4567"));
    });
});
