import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { Order } from "@/types/order";
import {
    recorded,
    respond,
    resetRecording,
    hasEq,
    queriesOn,
} from "@/lib/__fixtures__/recording-supabase";

/*
 * Two order writes/reads in the CRUD hook used to run with RLS as their only
 * scope: "mark customer verified" updated every visible order with the phone
 * (so, for a user in two tenants, both tenants' customers), and the archive
 * fetch pulled every archived row with every column and threw the result away.
 */

const TENANT = "22222222-2222-4222-8222-222222222222";
const H = vi.hoisted(() => ({ tenantId: "22222222-2222-4222-8222-222222222222" as string | null }));

vi.mock("@/lib/supabase", async () =>
    (await import("@/lib/__fixtures__/recording-supabase")).recordingSupabaseModule());
vi.mock("@/components/auth/auth-provider", () => ({
    useAuth: () => ({
        user: { id: "u1" },
        profile: { display_name: "Staff" },
        session: { access_token: "t" },
        clientReady: true,
        tenantId: H.tenantId,
    }),
}));
vi.mock("@/app/actions/orders", () => ({
    createOrderAction: vi.fn(),
    splitOrderAction: vi.fn(),
    unsplitOrderAction: vi.fn(),
}));
vi.mock("@/lib/activity-logger", () => ({ activityLogger: { log: vi.fn() } }));
vi.mock("@/hooks/use-toast", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));

import { useOrderCrud } from "./use-order-crud";
import { orderKeys } from "./use-orders-query";

const order = {
    id: "o1",
    tenant_id: TENANT,
    order_id: "7309",
    phone: "07701234567",
    status: "new",
    items: [],
} as unknown as Order;

function setup() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(orderKeys.lists(), [order]);
    const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useOrderCrud({ orders: [order] }), { wrapper });
    return { result, client };
}

beforeEach(() => {
    resetRecording();
    H.tenantId = TENANT;
});

describe("useOrderCrud tenant scope", () => {
    it("markAsVerifiedCustomer updates only the active tenant's orders for the phone", async () => {
        respond(() => ({ data: [{ id: "o1" }], error: null }));
        const { result } = setup();

        let outcome: { success: boolean } | undefined;
        await act(async () => {
            outcome = await result.current.markAsVerifiedCustomer("o1");
        });

        expect(outcome?.success).toBe(true);
        const [update] = queriesOn("orders");
        expect(update.ops[0]).toEqual({ op: "update", args: [{ is_verified_customer: true }] });
        expect(hasEq(update, "tenant_id", TENANT)).toBe(true);
        expect(hasEq(update, "phone", order.phone)).toBe(true);
    });

    it("markAsVerifiedCustomer writes nothing without a tenant", async () => {
        H.tenantId = null;
        const { result } = setup();

        let outcome: { success: boolean } | undefined;
        await act(async () => {
            outcome = await result.current.markAsVerifiedCustomer("o1");
        });

        expect(outcome?.success).toBe(false);
        expect(queriesOn("orders")).toEqual([]);
    });

    it("fetchArchivedOrders reads the tenant's archive through the repository into the archive cache", async () => {
        const archivedRow = { id: "a1", tenant_id: TENANT, phone: "07700000000", is_archived: true, items: [] };
        respond((q) => {
            if (q.target === "customer_trust") return { data: [], error: null };
            return { data: [archivedRow], error: null };
        });
        const { result, client } = setup();

        let outcome: { success: boolean; count?: number } | undefined;
        await act(async () => {
            outcome = await result.current.fetchArchivedOrders();
        });

        expect(outcome).toMatchObject({ success: true, count: 1 });
        const reads = recorded.filter((q) => q.target === "orders");
        expect(reads.length).toBeGreaterThan(0);
        for (const q of reads) {
            expect(hasEq(q, "tenant_id", TENANT)).toBe(true);
            expect(hasEq(q, "is_archived", true)).toBe(true);
            // LIST_COLUMNS, never `*`: the table does not mask margin columns.
            expect(q.ops.find((o) => o.op === "select")?.args[0]).not.toBe("*");
        }
        expect(client.getQueryData<Order[]>(orderKeys.archived())?.map((o) => o.id)).toEqual(["a1"]);
    });
});
