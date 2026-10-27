import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { Order } from "@/types/order";
import { respond, resetRecording, queriesOn } from "@/lib/__fixtures__/recording-supabase";

/*
 * F-040: the database refuses a browser write to orders.order_id. The order
 * details "edit ID" control saves through updateOrder, so a changed number
 * must go to the renameOrderNumberAction server action, and no browser
 * UPDATE may carry order_id.
 */

const TENANT = "22222222-2222-4222-8222-222222222222";
const H = vi.hoisted(() => ({ rename: vi.fn() }));

vi.mock("@/lib/supabase", async () =>
    (await import("@/lib/__fixtures__/recording-supabase")).recordingSupabaseModule());
vi.mock("@/components/auth/auth-provider", () => ({
    useAuth: () => ({
        user: { id: "u1" },
        profile: { display_name: "Staff" },
        session: { access_token: "t" },
        clientReady: true,
        tenantId: "22222222-2222-4222-8222-222222222222",
    }),
}));
vi.mock("@/app/actions/orders", () => ({
    createOrderAction: vi.fn(),
    splitOrderAction: vi.fn(),
    unsplitOrderAction: vi.fn(),
    renameOrderNumberAction: H.rename,
}));
vi.mock("@/lib/activity-logger", () => ({ activityLogger: { log: vi.fn() } }));
vi.mock("@/hooks/use-toast", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { useOrderCrud } from "./use-order-crud";
import { orderKeys } from "./use-orders-query";

const order = {
    id: "o1",
    tenant_id: TENANT,
    order_id: "7309",
    phone: "07701234567",
    status: "new",
    version: 2,
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

function orderUpdates(): Record<string, unknown>[] {
    return queriesOn("orders").flatMap((q) =>
        q.ops.filter((o) => o.op === "update").map((o) => o.args[0] as Record<string, unknown>));
}

beforeEach(() => {
    resetRecording();
    H.rename.mockReset();
});

describe("useOrderCrud order number", () => {
    it("sends a changed number to the server action, never as a browser UPDATE", async () => {
        H.rename.mockResolvedValue({ success: true, data: { ...order, order_id: "7310", version: 3 } });
        const { result, client } = setup();

        let outcome: { success: boolean; data?: Order } | undefined;
        await act(async () => {
            outcome = await result.current.updateOrder("o1", { order_id: "7310" });
        });

        expect(outcome?.success).toBe(true);
        expect(outcome?.data?.order_id).toBe("7310");
        expect(H.rename).toHaveBeenCalledWith("o1", "7310", "t");
        expect(orderUpdates()).toEqual([]);
        expect(client.getQueryData<Order[]>(orderKeys.lists())?.[0].order_id).toBe("7310");
    });

    it("reports a refused rename and writes nothing else", async () => {
        H.rename.mockResolvedValue({ success: false, error: "This order number is already in use" });
        const { result } = setup();

        let outcome: { success: boolean; error?: string } | undefined;
        await act(async () => {
            outcome = await result.current.updateOrder("o1", { order_id: "7310", notes: "x" });
        });

        expect(outcome).toEqual({ success: false, error: "This order number is already in use" });
        expect(orderUpdates()).toEqual([]);
    });

    it("drops an unchanged number from an ordinary update", async () => {
        respond(() => ({ data: { ...order, notes: "x" }, error: null }));
        const { result } = setup();

        await act(async () => {
            await result.current.updateOrder("o1", { order_id: "7309", notes: "x" });
        });

        expect(H.rename).not.toHaveBeenCalled();
        const updates = orderUpdates();
        expect(updates).toHaveLength(1);
        expect(updates[0]).toEqual({ notes: "x" });
    });
});
