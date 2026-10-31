import { describe, it, expect, vi, beforeEach } from "vitest";

// Browsers cannot insert orders (trg_orders_order_id_server_only), so backup
// and vault restores write through restoreOrdersAction with the service role.
// RLS does not apply there: these tests pin the checks that replace it.

vi.mock("@/lib/supabase-server", () => ({
    createSupabaseServiceClient: vi.fn(),
    verifyAccessToken: vi.fn(),
}));
vi.mock("@/lib/auth/resolve-active-tenant", () => ({ resolveActiveTenant: vi.fn() }));
vi.mock("@/lib/order-service", () => ({ createOrderForTenant: vi.fn() }));
vi.mock("@/lib/tenant", () => ({ canCreateOrder: vi.fn() }));
vi.mock("@/lib/restrictions", () => ({
    assertNotBlocked: vi.fn(),
    TenantBlockedError: class TenantBlockedError extends Error {},
}));

import { restoreOrdersAction } from "./orders";
import { createSupabaseServiceClient, verifyAccessToken } from "@/lib/supabase-server";
import { resolveActiveTenant } from "@/lib/auth/resolve-active-tenant";
import { ORDER_MARGIN_COLUMNS, RESTORE_ORDERS_BATCH_SIZE } from "@/lib/repositories/order-columns";
import type { UserRole } from "@/lib/permissions";

const TENANT = "22222222-2222-4222-8222-222222222222";
const OTHER_TENANT = "44444444-4444-4444-8444-444444444444";
const ORDER_A = "33333333-3333-4333-8333-333333333333";
const ORDER_B = "55555555-5555-4555-8555-555555555555";

type ExistingRow = { id: string; tenant_id: string; order_id: string | null };

/**
 * `from("orders").select(...).in("id", ids)` answers with `existing`;
 * `from("orders").upsert(rows, opts)` records its payload and answers with `upsertResult`.
 */
function serviceClient(existing: ExistingRow[], upsertResult: { error: unknown } = { error: null }) {
    const recorded: { inIds?: unknown; upserted?: Record<string, unknown>[]; onConflict?: unknown } = {};
    const from = vi.fn(() => ({
        select: () => ({
            in: async (_col: string, ids: unknown) => {
                recorded.inIds = ids;
                return { data: existing, error: null };
            },
        }),
        upsert: async (rows: Record<string, unknown>[], opts: { onConflict: string }) => {
            recorded.upserted = rows;
            recorded.onConflict = opts.onConflict;
            return upsertResult;
        },
    }));
    vi.mocked(createSupabaseServiceClient).mockReturnValue({ from } as unknown as ReturnType<typeof createSupabaseServiceClient>);
    return { recorded, from };
}

function signedInAs(role: UserRole) {
    vi.mocked(verifyAccessToken).mockResolvedValue({ user: { id: "u1" }, error: null } as unknown as Awaited<ReturnType<typeof verifyAccessToken>>);
    vi.mocked(resolveActiveTenant).mockResolvedValue({ ok: true, tenantId: TENANT, role, platformAdmin: false });
}

function backupRow(id: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        id,
        order_id: "7309",
        customer_name: "Ali",
        status: "new",
        price: 25000,
        tenant_id: OTHER_TENANT,
        product_cost: 9000,
        risk_data: { score: 0 },
        ...overrides,
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
});

describe("restoreOrdersAction", () => {
    it("writes every row into the caller's tenant, whatever the file says", async () => {
        signedInAs("admin");
        const { recorded } = serviceClient([]);
        const res = await restoreOrdersAction([backupRow(ORDER_A), backupRow(ORDER_B, { order_id: "7310" })], "token");

        expect(res).toEqual({ success: true, restored: 2 });
        expect(recorded.inIds).toEqual([ORDER_A, ORDER_B]);
        expect(recorded.onConflict).toBe("id");
        expect(recorded.upserted?.map((r) => r.tenant_id)).toEqual([TENANT, TENANT]);
        for (const row of recorded.upserted ?? []) {
            for (const col of ORDER_MARGIN_COLUMNS) expect(row).not.toHaveProperty(col);
            expect(row).not.toHaveProperty("risk_data");
        }
    });

    it("refuses the whole batch when an id belongs to another tenant", async () => {
        signedInAs("admin");
        const { recorded } = serviceClient([{ id: ORDER_B, tenant_id: OTHER_TENANT, order_id: "9001" }]);
        const res = await restoreOrdersAction([backupRow(ORDER_A), backupRow(ORDER_B)], "token");

        expect(res).toEqual({ success: false, error: "1 order(s) in this backup belong to another store" });
        expect(recorded.upserted).toBeUndefined();
    });

    it("refuses an employee: restoring is an administrator action", async () => {
        signedInAs("employee");
        const { recorded } = serviceClient([]);
        const res = await restoreOrdersAction([backupRow(ORDER_A)], "token");

        expect(res).toEqual({ success: false, error: "You do not have permission to restore orders" });
        expect(recorded.upserted).toBeUndefined();
    });

    it("keeps an existing order's current number", async () => {
        signedInAs("admin");
        const { recorded } = serviceClient([{ id: ORDER_A, tenant_id: TENANT, order_id: "4261020007" }]);
        const res = await restoreOrdersAction([backupRow(ORDER_A, { order_id: "4261026999" })], "token");

        expect(res.success).toBe(true);
        expect(recorded.upserted?.[0]).toMatchObject({ id: ORDER_A, order_id: "4261020007", tenant_id: TENANT });
    });

    it("lets a new row bring back an earlier day's generator number, not today's", async () => {
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(new Date("2026-10-26T09:00:00.000Z"));
        signedInAs("admin");

        const past = serviceClient([]);
        expect((await restoreOrdersAction([backupRow(ORDER_A, { order_id: "4261020007" })], "token")).success).toBe(true);
        expect(past.recorded.upserted?.[0]).toMatchObject({ order_id: "4261020007" });

        const today = serviceClient([]);
        const res = await restoreOrdersAction([backupRow(ORDER_A, { order_id: "4261026001" })], "token");
        expect(res).toEqual({ success: false, error: "Order number 4261026001 is assigned by the system and cannot be restored" });
        expect(today.recorded.upserted).toBeUndefined();
    });

    it("reports a number another tenant holds plainly", async () => {
        signedInAs("admin");
        serviceClient([], { error: { code: "23505", message: "duplicate key value violates unique constraint \"orders_order_id_key\"" } });
        const res = await restoreOrdersAction([backupRow(ORDER_A)], "token");
        expect(res).toEqual({ success: false, error: "An order number in this backup is already in use" });
    });

    it("refuses a viewer, an unsigned caller and malformed or oversized batches", async () => {
        signedInAs("viewer");
        const { from } = serviceClient([]);
        expect((await restoreOrdersAction([backupRow(ORDER_A)], "token")).success).toBe(false);
        expect((await restoreOrdersAction([backupRow(ORDER_A)], "")).success).toBe(false);

        signedInAs("admin");
        expect((await restoreOrdersAction([], "token")).success).toBe(false);
        expect((await restoreOrdersAction([backupRow("not-a-uuid")], "token")).success).toBe(false);
        expect((await restoreOrdersAction("orders", "token")).success).toBe(false);
        const oversized = Array.from({ length: RESTORE_ORDERS_BATCH_SIZE + 1 }, () => backupRow(ORDER_A));
        expect((await restoreOrdersAction(oversized, "token")).success).toBe(false);
        expect(from).not.toHaveBeenCalled();
    });
});
