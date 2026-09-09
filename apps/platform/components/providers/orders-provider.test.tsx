import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

/**
 * PERF-D1. OrdersProvider is mounted in the ROOT layout, so before this gate the
 * order-book fetch ran on every route in the app — 7 MB on the largest tenant,
 * including on routes that never show an order.
 *
 * The whole fix rests on one behaviour: the fetch must not run unless a mounted
 * component has asked for the list. That is what these tests hold.
 */

const findAll = vi.fn(async () => []);

vi.mock("@/lib/repositories/order-repository", () => ({
    orderRepository: {
        findAll: () => findAll(),
        findArchived: async () => [],
        findRiskData: async () => new Map(),
    },
}));

vi.mock("@/components/auth/auth-provider", () => ({
    useAuth: () => ({ session: { user: { id: "u1" } }, clientReady: true }),
}));

// The composed sub-hooks open realtime channels and timers; none of them is
// under test here.
vi.mock("@/hooks/use-order-realtime", () => ({ useOrderRealtime: () => ({ batcherRef: { current: null } }) }));
vi.mock("@/hooks/use-app-lifecycle", () => ({ useAppLifecycle: () => {} }));
vi.mock("@/hooks/use-realtime-heartbeat", () => ({ useRealtimeHeartbeat: () => {} }));
vi.mock("@/hooks/use-order-crud", () => ({ useOrderCrud: () => ({}) }));
vi.mock("@/hooks/use-order-auxiliary", () => ({ useOrderAuxiliary: () => ({}) }));
vi.mock("@/hooks/use-order-filters", () => ({ useOrderFilters: () => ({}) }));

import { OrdersProvider, useOrdersContext, useOrdersList } from "./orders-provider";

function wrap(children: React.ReactNode) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
        <QueryClientProvider client={client}>
            <OrdersProvider>{children}</OrdersProvider>
        </QueryClientProvider>
    );
}

function ActionsOnly() {
    useOrdersContext();
    return <div>actions</div>;
}

function NeedsTheList() {
    const { orders } = useOrdersList();
    return <div>{orders.length}</div>;
}

describe("OrdersProvider fetch gate", () => {
    beforeEach(() => {
        findAll.mockClear();
        try { sessionStorage.clear(); } catch { /* not available */ }
    });

    it("THE COST: does not fetch the order book when nothing asked for it", async () => {
        wrap(<ActionsOnly />);
        // Give any effect-triggered fetch a chance to fire.
        await new Promise((r) => setTimeout(r, 50));
        expect(findAll).not.toHaveBeenCalled();
    });

    it("fetches once a component subscribes with useOrdersList()", async () => {
        wrap(<NeedsTheList />);
        await waitFor(() => expect(findAll).toHaveBeenCalled());
    });

    it("fetches once, not per subscriber", async () => {
        wrap(
            <>
                <NeedsTheList />
                <NeedsTheList />
                <ActionsOnly />
            </>
        );
        await waitFor(() => expect(findAll).toHaveBeenCalled());
        expect(findAll).toHaveBeenCalledTimes(1);
    });
});
