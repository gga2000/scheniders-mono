import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/supabase-server", () => ({
    verifyAccessToken: vi.fn(),
    createSupabaseServiceClient: vi.fn(),
}));
vi.mock("@/lib/auth/resolve-active-tenant", () => ({ resolveActiveTenant: vi.fn() }));
vi.mock("@/lib/order-telemetry", () => ({ reportOrderError: vi.fn() }));

import { POST } from "./route";
import { verifyAccessToken, createSupabaseServiceClient } from "@/lib/supabase-server";
import { resolveActiveTenant } from "@/lib/auth/resolve-active-tenant";
import { reportOrderError } from "@/lib/order-telemetry";

const TENANT = "22222222-2222-4222-8222-222222222222";
const A = "33333333-3333-4333-8333-333333333333";
const B = "44444444-4444-4444-8444-444444444444";

type Call = { table: string; op: string; args: unknown[] };

/** Records every builder call; `update(...).select()` resolves to `updateResult`. */
function serviceClient(updateResult: { data: unknown; error: unknown }, insertError: unknown = null) {
    const calls: Call[] = [];
    const from = vi.fn((table: string) => {
        const builder: Record<string, unknown> = {};
        const chain = (op: string) => (...args: unknown[]) => {
            calls.push({ table, op, args });
            return builder;
        };
        for (const op of ["update", "in", "eq", "is"]) builder[op] = chain(op);
        builder.select = (...args: unknown[]) => {
            calls.push({ table, op: "select", args });
            return Promise.resolve(updateResult);
        };
        builder.insert = (...args: unknown[]) => {
            calls.push({ table, op: "insert", args });
            return Promise.resolve({ error: insertError });
        };
        return builder;
    });
    vi.mocked(createSupabaseServiceClient).mockReturnValue({ from } as unknown as ReturnType<typeof createSupabaseServiceClient>);
    return calls;
}

function request(ids: string[]) {
    return new NextRequest("http://localhost/api/orders/delete", {
        method: "POST",
        headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
    });
}

function signedInAs(role: string) {
    vi.mocked(verifyAccessToken).mockResolvedValue({ user: { id: "u1", email: "a@b.c" }, error: null } as unknown as Awaited<ReturnType<typeof verifyAccessToken>>);
    vi.mocked(resolveActiveTenant).mockResolvedValue({ ok: true, tenantId: TENANT, role } as unknown as Awaited<ReturnType<typeof resolveActiveTenant>>);
}

describe("POST /api/orders/delete", () => {
    beforeEach(() => vi.clearAllMocks());

    it("soft-deletes only live rows of the caller's tenant and audits exactly the rows that changed", async () => {
        signedInAs("employee");
        const calls = serviceClient({ data: [{ id: A, order_id: "7001", status: "new" }], error: null });

        const res = await POST(request([A, B]));
        const body = await res.json();

        expect(body).toEqual({ success: true, count: 1, deletedIds: [A] });
        const orderOps = calls.filter((c) => c.table === "orders").map((c) => [c.op, ...c.args.slice(0, 2)]);
        expect(orderOps).toContainEqual(["eq", "tenant_id", TENANT]);
        // Already-trashed rows keep their original deleted_at (purge clock).
        expect(orderOps).toContainEqual(["is", "deleted_at", null]);
        // One write, no separate pre-read snapshot.
        expect(calls.filter((c) => c.table === "orders" && c.op === "select")).toHaveLength(1);

        const audit = calls.find((c) => c.table === "order_deletion_log" && c.op === "insert");
        expect(audit?.args[0]).toMatchObject({ tenant_id: TENANT, order_count: 1, order_ids: [A], order_numbers: ["7001"] });
    });

    it("writes no audit row when nothing was deleted", async () => {
        signedInAs("admin");
        const calls = serviceClient({ data: [], error: null });
        const body = await (await POST(request([A]))).json();
        expect(body).toEqual({ success: true, count: 0, deletedIds: [] });
        expect(calls.some((c) => c.table === "order_deletion_log")).toBe(false);
    });

    it("reports a lost audit write without failing the delete", async () => {
        signedInAs("admin");
        serviceClient({ data: [{ id: A, order_id: "7001", status: "new" }], error: null }, { message: "boom" });
        const body = await (await POST(request([A]))).json();
        expect(body.success).toBe(true);
        expect(reportOrderError).toHaveBeenCalledOnce();
    });

    it("refuses a viewer before touching the database", async () => {
        signedInAs("viewer");
        const calls = serviceClient({ data: [], error: null });
        const res = await POST(request([A]));
        expect(res.status).toBe(403);
        expect(calls).toHaveLength(0);
    });
});
