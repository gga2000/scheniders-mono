import { describe, it, expect, vi, beforeEach } from "vitest";

// createAfterSaleOrderAction calls create_after_sale_order with the service
// role, so the tenant must come from the session and the keep-the-item rule
// must hold here, not only in the sheet. Lives under lib/ because vitest
// collects app/api and lib, not app/actions.

vi.mock("@/lib/auth/resolve-order-caller", () => ({
    ORDER_WRITE_ROLES: ["admin", "super_admin", "employee"],
    resolveCaller: vi.fn(),
}));
vi.mock("@/lib/supabase-server", () => ({ createSupabaseServiceClient: vi.fn() }));
vi.mock("@/lib/restrictions", () => ({
    assertNotBlocked: vi.fn(async () => undefined),
    TenantBlockedError: class extends Error {},
}));

vi.mock("@/lib/tenant", () => ({ canCreateOrder: vi.fn() }));
vi.mock("@/lib/order-service", () => ({ chargeAndTrack: vi.fn(async () => undefined) }));
vi.mock("@/lib/order-telemetry", () => ({ reportOrderError: vi.fn() }));

import { createAfterSaleOrderAction } from "@/app/actions/after-sale";
import { canCreateOrder } from "@/lib/tenant";
import { chargeAndTrack } from "@/lib/order-service";
import { resolveCaller } from "@/lib/auth/resolve-order-caller";
import { createSupabaseServiceClient } from "@/lib/supabase-server";

const ORIGINAL = "11111111-1111-4111-8111-111111111111";
const CHILD = "22222222-2222-4222-8222-222222222222";

const rpc = vi.fn();

function asRole(role: string) {
    vi.mocked(resolveCaller).mockResolvedValue({ caller: { userId: "u1", tenantId: "tenant-a", role } });
}

beforeEach(() => {
    vi.mocked(canCreateOrder).mockReset().mockResolvedValue({ allowed: true });
    vi.mocked(chargeAndTrack).mockClear();
    rpc.mockReset().mockResolvedValue({ data: { id: CHILD, order_id: "RTN-3951-2" }, error: null });
    const rows: Record<string, unknown> = {
        user_profiles: { display_name: "Ali" },
        tenants: { settings: { after_sale: { refund_courier_note: "Check the bottle before paying" } } },
    };
    const from = (table: string) => {
        const chain = {
            select: () => chain,
            eq: () => chain,
            maybeSingle: async () => ({ data: rows[table] ?? null, error: null }),
        };
        return chain;
    };
    vi.mocked(createSupabaseServiceClient).mockReturnValue({ rpc, from } as never);
});

describe("createAfterSaleOrderAction", () => {
    it("creates a refund in the caller's own tenant", async () => {
        asRole("employee");
        const result = await createAfterSaleOrderAction(
            { kind: "refund", originalOrderId: ORIGINAL, lines: [{ originalLine: 0, qty: 1 }] },
            "token",
        );
        expect(result).toEqual({ success: true, orderId: CHILD, orderNumber: "RTN-3951-2" });
        expect(rpc).toHaveBeenCalledWith("create_after_sale_order", expect.objectContaining({
            _tenant_id: "tenant-a",
            _kind: "refund",
            _lines: [{ original_line: 0, qty: 1, expects_back: true }],
            _fee_kept: null,
            _notes: "Check the bottle before paying",
            _changed_by_name: "Ali",
        }));
    });

    it("refuses a keep-the-item refund from an employee", async () => {
        asRole("employee");
        const result = await createAfterSaleOrderAction(
            { kind: "refund", originalOrderId: ORIGINAL, lines: [{ originalLine: 0, qty: 1, expectsBack: false }], notes: "damaged in transit" },
            "token",
        );
        expect(result.success).toBe(false);
        expect(rpc).not.toHaveBeenCalled();
    });

    it("requires a note when the customer keeps the item", async () => {
        asRole("admin");
        const result = await createAfterSaleOrderAction(
            { kind: "refund", originalOrderId: ORIGINAL, lines: [{ originalLine: 0, qty: 1, expectsBack: false }] },
            "token",
        );
        expect(result.success).toBe(false);
        expect(rpc).not.toHaveBeenCalled();
    });

    it("leaves the courier instruction off when nothing is picked up", async () => {
        asRole("admin");
        await createAfterSaleOrderAction(
            { kind: "refund", originalOrderId: ORIGINAL, lines: [{ originalLine: 0, qty: 1, expectsBack: false }], notes: "Gift for a late order" },
            "token",
        );
        expect(rpc).toHaveBeenCalledWith("create_after_sale_order", expect.objectContaining({ _notes: "Gift for a late order" }));
    });

    it("refuses viewers", async () => {
        asRole("viewer");
        const result = await createAfterSaleOrderAction(
            { kind: "refund", originalOrderId: ORIGINAL, lines: [{ originalLine: 0, qty: 1 }] },
            "token",
        );
        expect(result.success).toBe(false);
        expect(rpc).not.toHaveBeenCalled();
    });

    it("charges the wallet and counts usage like a normal order", async () => {
        asRole("employee");
        await createAfterSaleOrderAction(
            { kind: "replacement", originalOrderId: ORIGINAL, lines: [{ originalLine: 0, qty: 1 }] },
            "token",
        );
        expect(chargeAndTrack).toHaveBeenCalledWith("tenant-a", expect.anything());
    });

    it("refuses when the plan's order limit is reached, before creating anything", async () => {
        asRole("admin");
        vi.mocked(canCreateOrder).mockResolvedValue({ allowed: false, reason: "Monthly order limit reached" });
        const result = await createAfterSaleOrderAction(
            { kind: "refund", originalOrderId: ORIGINAL, lines: [{ originalLine: 0, qty: 1 }] },
            "token",
        );
        expect(result).toEqual({ success: false, error: "Monthly order limit reached" });
        expect(rpc).not.toHaveBeenCalled();
        expect(chargeAndTrack).not.toHaveBeenCalled();
    });
});
