import { describe, it, expect, vi, beforeEach } from "vitest";

// F-040: browsers cannot write orders.order_id any more (the database trigger
// refuses it), so the order-number edit and the create path go through these
// server actions, which check the caller and the value first.

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

import { createOrderAction, renameOrderNumberAction } from "./orders";
import { createSupabaseServiceClient, verifyAccessToken } from "@/lib/supabase-server";
import { resolveActiveTenant } from "@/lib/auth/resolve-active-tenant";
import { createOrderForTenant } from "@/lib/order-service";
import type { CreateOrderInput } from "@/types/order";
import type { UserRole } from "@/lib/permissions";

const TENANT = "22222222-2222-4222-8222-222222222222";
const ORDER = "33333333-3333-4333-8333-333333333333";

type Recorded = { patch?: unknown; eqs: [string, unknown][] };

/** One `from("orders").update(...).eq(...).eq(...).select().maybeSingle()` chain. */
function serviceClient(result: { data: unknown; error: unknown }) {
    const recorded: Recorded = { eqs: [] };
    const chain = {
        update: (patch: unknown) => { recorded.patch = patch; return chain; },
        eq: (col: string, val: unknown) => { recorded.eqs.push([col, val]); return chain; },
        select: () => chain,
        maybeSingle: async () => result,
    };
    const from = vi.fn(() => chain);
    vi.mocked(createSupabaseServiceClient).mockReturnValue({ from } as unknown as ReturnType<typeof createSupabaseServiceClient>);
    return { recorded, from };
}

function signedInAs(role: UserRole) {
    vi.mocked(verifyAccessToken).mockResolvedValue({ user: { id: "u1" }, error: null } as unknown as Awaited<ReturnType<typeof verifyAccessToken>>);
    vi.mocked(resolveActiveTenant).mockResolvedValue({ ok: true, tenantId: TENANT, role, platformAdmin: false });
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe("renameOrderNumberAction", () => {
    it("writes the new number with the service role, scoped to the caller's tenant", async () => {
        signedInAs("employee");
        const { recorded } = serviceClient({ data: { id: ORDER, order_id: "7310", version: 3 }, error: null });
        const res = await renameOrderNumberAction(ORDER, "  7310 ", "token");
        expect(res).toEqual({ success: true, data: { id: ORDER, order_id: "7310", version: 3 } });
        expect(recorded.patch).toEqual({ order_id: "7310" });
        expect(recorded.eqs).toEqual([["id", ORDER], ["tenant_id", TENANT]]);
    });

    it("refuses a number in the generator's format (it would squat another day's numbers)", async () => {
        signedInAs("admin");
        const { from } = serviceClient({ data: null, error: null });
        const res = await renameOrderNumberAction(ORDER, "426102199999999999", "token");
        expect(res.success).toBe(false);
        expect(from).not.toHaveBeenCalled();
    });

    it("refuses a viewer and an unsigned caller", async () => {
        signedInAs("viewer");
        const { from } = serviceClient({ data: null, error: null });
        expect((await renameOrderNumberAction(ORDER, "7310", "token")).success).toBe(false);
        expect((await renameOrderNumberAction(ORDER, "7310", "")).success).toBe(false);
        expect(from).not.toHaveBeenCalled();
    });

    it("reports a taken number and another tenant's order plainly", async () => {
        signedInAs("admin");
        serviceClient({ data: null, error: { code: "23505", message: "duplicate key" } });
        expect(await renameOrderNumberAction(ORDER, "7310", "token")).toEqual({ success: false, error: "This order number is already in use" });
        serviceClient({ data: null, error: null });
        expect(await renameOrderNumberAction(ORDER, "7310", "token")).toEqual({ success: false, error: "Order not found" });
    });
});

describe("createOrderAction", () => {
    const base = { customer_name: "Ali", phone: "07701234567", price: 1000, items: [] } as unknown as CreateOrderInput;

    it("refuses a caller-chosen number in the generator's format", async () => {
        signedInAs("employee");
        const res = await createOrderAction({ ...base, order_id: "4261020999" }, "token");
        expect(res.success).toBe(false);
        expect(createOrderForTenant).not.toHaveBeenCalled();
    });

    it("passes derived numbers (returns, replacements, clones) and generated ones through", async () => {
        signedInAs("employee");
        vi.mocked(createOrderForTenant).mockResolvedValue({ success: true });
        await createOrderAction({ ...base, order_id: "RTN-41-1" }, "token");
        await createOrderAction(base, "token");
        expect(vi.mocked(createOrderForTenant).mock.calls.map((c) => c[0].order_id)).toEqual(["RTN-41-1", undefined]);
    });

    it("refuses an unknown status, a NaN price and a negative fee before writing", async () => {
        signedInAs("employee");
        vi.mocked(createOrderForTenant).mockClear();
        const bad = [
            { ...base, status: "shipped" },
            { ...base, price: Number.NaN },
            { ...base, delivery_fee: -500 },
            { ...base, items: [{ quantity: -1 }] },
        ] as unknown as CreateOrderInput[];
        for (const input of bad) {
            const res = await createOrderAction(input, "token");
            expect(res.success).toBe(false);
        }
        expect(createOrderForTenant).not.toHaveBeenCalled();
    });

    it("keeps a return's negative price and the columns it does not check", async () => {
        signedInAs("employee");
        vi.mocked(createOrderForTenant).mockResolvedValue({ success: true });
        const input = { ...base, price: -1000, is_return: true, notes: "x", status: "return_pending" } as unknown as CreateOrderInput;
        expect((await createOrderAction(input, "token")).success).toBe(true);
        expect(vi.mocked(createOrderForTenant).mock.lastCall?.[0]).toMatchObject({ price: -1000, is_return: true, notes: "x" });
    });
});
