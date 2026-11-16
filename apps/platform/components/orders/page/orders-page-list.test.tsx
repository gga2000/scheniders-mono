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
        listIsCurrent: true,
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

describe("orders list while the window's rows are landing", () => {
    afterEach(cleanup);

    const week = { searchQuery: "", dateFrom: "2026-11-10", dateTo: "2026-11-16" };

    // Round 13, slow link: the 7-day rows had landed, the list's deferred
    // render still held the empty previous window, and nothing was fetching.
    it("shows placeholders, not «no matching orders», until the list is current", () => {
        render(<OrdersPageList m={model({ filters: week, orderSearch: search({ active: false }), listIsCurrent: false })} />);
        expect(screen.queryByText("no matching orders")).toBeNull();
        expect(screen.queryByText("order cards")).toBeNull();
    });

    it("shows placeholders in the table too, where an empty window drew «no results»", () => {
        render(<OrdersPageList m={model({ filters: week, orderSearch: search({ active: false }), listIsCurrent: false, viewMode: "table" })} />);
        expect(screen.queryByText("order table")).toBeNull();
    });

    it("says nothing matched once the current window answered empty", () => {
        render(<OrdersPageList m={model({ filters: week, orderSearch: search({ active: false }) })} />);
        expect(screen.getByText("no matching orders")).toBeTruthy();
    });
});
