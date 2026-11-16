import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { OrdersPageModel } from "./use-orders-page-model";
import { OrdersPageList } from "./orders-page-list";

vi.mock("@/components/orders/order-search-banner", () => ({ OrderSearchBanner: () => <div>search banner</div> }));
vi.mock("@/components/ui/empty-states", () => ({ EmptyState: () => <div>no matching orders</div> }));
vi.mock("@/components/orders/virtualized-order-list", () => ({ VirtualizedOrderList: () => <div>order cards</div> }));
vi.mock("@/components/orders/virtualized-order-table", () => ({ VirtualizedOrderTable: () => <div>order table</div> }));
vi.mock("@/components/orders/prime-handled-fold", () => ({ PrimeHandledFold: () => null }));
vi.mock("@/hooks/use-prime-queues", () => ({
    usePrimeQueueHandledIds: () => new Set<string>(),
    usePrimeQueuePending: () => false,
}));

type Search = OrdersPageModel["orderSearch"];

function search(over: Partial<Search>): Search {
    return { active: true, pending: false, isFetching: false, error: null, failure: null, retry: () => undefined, ...over };
}

function model(over: Partial<OrdersPageModel>): OrdersPageModel {
    const base: Partial<OrdersPageModel> = {
        t: (key: string) => key,
        filters: { searchQuery: "murtada" },
        selectedOrders: new Set<string>(),
        listOrders: [],
        filteredOrders: [],
        viewMode: "cards",
        showArchived: false,
        isRefreshing: false,
        ordersPending: false,
        previewing: false,
        orderSearch: search({}),
    };
    return { ...base, ...over } as OrdersPageModel;
}

describe("orders list under a search", () => {
    afterEach(cleanup);

    it("shows no empty state when the search failed: the banner carries the error and retry", () => {
        const failed = search({ failure: "network", error: new Error("Failed to fetch") });
        render(<OrdersPageList m={model({ orderSearch: failed })} />);
        expect(screen.getByText("search banner")).toBeTruthy();
        expect(screen.queryByText("no matching orders")).toBeNull();
    });

    it("shows no empty table either when the search failed", () => {
        const failed = search({ failure: "server", error: new Error("500") });
        render(<OrdersPageList m={model({ orderSearch: failed, viewMode: "table" })} />);
        expect(screen.queryByText("order table")).toBeNull();
    });

    it("still says nothing matched after a search that answered with no orders", () => {
        render(<OrdersPageList m={model({})} />);
        expect(screen.getByText("no matching orders")).toBeTruthy();
    });
});
