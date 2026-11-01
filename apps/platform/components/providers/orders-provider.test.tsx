import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, renderHook, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { Order } from "@/types/order";
import type { Product } from "@/types/product";

/**
 * PERF-D1. The order book is mounted by the routes that show orders, not by the
 * root layout. These render the real provider, the real orders layout and the
 * real window query, with the repository mocked, and hold the two halves of the
 * change: code outside a book never issues the window query, and /orders still
 * loads its list.
 */

const H = vi.hoisted(() => ({
    findWindow: vi.fn(),
    findAllProducts: vi.fn(),
    pathname: "/orders",
    sales: new Map([["p1", { timesSold: 16, totalRevenue: 16000, averageOrderValue: 4000 }]]),
}));

vi.mock("@/lib/repositories/order-repository", () => ({
    orderRepository: {
        findWindow: H.findWindow,
        findArchived: async () => [],
        findChangedSince: async () => [],
        search: async () => [],
    },
}));
vi.mock("@/lib/repositories/product-repository", () => ({
    productRepository: { findAll: H.findAllProducts },
}));
// Product sales are folded in SQL (get_product_sales); its own test covers the RPC.
vi.mock("@/hooks/use-product-sales-query", () => ({ useProductSalesQuery: () => ({ sales: H.sales, unavailable: false, retry: () => {} }) }));
vi.mock("@/components/auth/auth-provider", () => ({
    useAuth: () => ({
        session: { access_token: "t", user: { id: "u1" } },
        clientReady: true,
        tenantId: "tenant-1",
        user: { id: "u1", email: "u1@example.com" },
        profile: null,
    }),
}));
vi.mock("@/hooks/use-user-preferences", () => ({
    useUserPreferences: () => ({ getPreference: () => null, setPreference: () => {}, userId: "u1" }),
    PREFERENCE_KEYS: { ORDER_FILTERS: "order_filters" },
}));

// Composed sub-hooks that open channels, timers or their own RPCs. None of them
// decides whether the window is fetched, which is what is under test.
vi.mock("@/hooks/use-order-realtime", () => ({ useOrderRealtime: () => ({ batcherRef: { current: null } }) }));
vi.mock("@/hooks/use-app-lifecycle", () => ({ useAppLifecycle: () => {} }));
vi.mock("@/hooks/use-realtime-heartbeat", () => ({ useRealtimeHeartbeat: () => {} }));
vi.mock("@/hooks/use-orders-aggregates", () => ({ useOrdersAggregates: () => ({ data: undefined }) }));
vi.mock("@/hooks/use-duplicate-window-alerts", () => ({
    useDuplicateWindowAlerts: () => ({ getDuplicateWindowAlert: () => null, getConfirmBlockingTwin: () => null, duplicateCandidates: [] }),
}));
vi.mock("@/hooks/use-order-auxiliary", () => ({ useOrderAuxiliary: () => ({ stats: {} }) }));
vi.mock("@/hooks/use-order-filters", () => ({
    useOrderFilters: ({ orders, filters, setFilters }: { orders: Order[]; filters: unknown; setFilters: unknown }) => ({
        filteredOrders: orders, filters, setFilters, statusCounts: {},
        countViewFacts: { ready: true, statusIsAll: true, windowIsAll: false },
    }),
}));
vi.mock("@/hooks/use-order-crud", () => ({ useOrderCrud: () => ({}) }));

// The orders layout's own collaborators.
vi.mock("next/navigation", () => ({
    usePathname: () => H.pathname,
    useSearchParams: () => new URLSearchParams(),
    useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));
vi.mock("@/hooks/use-viewport", () => ({ useViewport: () => ({ isMobile: false }) }));
vi.mock("@/components/mobile/orders/MobileOrdersPage", () => ({ MobileOrdersPage: () => null }));

import OrdersLayout from "@/app/orders/layout";
import { useOrdersContext } from "./orders-provider";
import { useProductsCrud } from "@/hooks/use-products-crud";

const order = (id: string, items: Order["items"]) =>
    ({ id, order_id: `LF-${id}`, status: "new", phone: "07700000000", customer_name: "C", items }) as Order;

const product = { id: "p1", name: "Rose Oil", sku: "ROSE", price: 1000, cost: 400 } as Product;

function client() {
    return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function withQuery(children: ReactNode) {
    return <QueryClientProvider client={client()}>{children}</QueryClientProvider>;
}

/** Long enough for any effect-started query to have fired. */
const settle = () => new Promise((r) => setTimeout(r, 50));

function OrderCount() {
    const { orders, loading } = useOrdersContext();
    return <div data-testid="count">{loading ? "loading" : orders.length}</div>;
}

afterEach(cleanup);

beforeEach(() => {
    H.findWindow.mockReset();
    H.findWindow.mockResolvedValue([order("o1", [{ name: "Rose Oil", sku: "ROSE", quantity: 2, price: 1000 }])]);
    H.findAllProducts.mockReset();
    H.findAllProducts.mockResolvedValue([product]);
    H.pathname = "/orders";
    try { sessionStorage.clear(); } catch { /* jsdom always has it */ }
});

describe("outside an order book", () => {
    it("THE COST: root-level code issues no window query", async () => {
        // The order form's product picker (root layout) and the /products list
        // read products this way, with no book mounted.
        const { result } = renderHook(() => useProductsCrud(), {
            wrapper: ({ children }) => withQuery(children),
        });
        await waitFor(() => expect(result.current.products).toHaveLength(1));
        await settle();

        expect(H.findWindow).not.toHaveBeenCalled();
        // Sales come from get_product_sales, so they are known without a book.
        expect(result.current.products[0].times_sold).toBe(16);
        expect(result.current.products[0].total_revenue).toBe(16000);
    });

    it("a book read fails loudly instead of rendering an empty list", () => {
        const spy = vi.spyOn(console, "error").mockImplementation(() => {});
        expect(() => renderHook(() => useOrdersContext(), { wrapper: ({ children }) => withQuery(children) }))
            .toThrow(/must be used within <OrdersProvider>/);
        spy.mockRestore();
    });
});

describe("/orders", () => {
    it("still loads its list: the orders layout mounts the book and fetches the window once", async () => {
        render(withQuery(<OrdersLayout><OrderCount /></OrdersLayout>));

        await waitFor(() => expect(screen.getByTestId("count").textContent).toBe("1"));
        expect(H.findWindow).toHaveBeenCalledTimes(1);
        expect(H.findWindow.mock.calls[0][0]).toBe("tenant-1");
    });

    it("/orders/trash, under the same layout, does not fetch the window", async () => {
        H.pathname = "/orders/trash";
        render(withQuery(<OrdersLayout><div data-testid="trash">trash</div></OrdersLayout>));

        expect(screen.getByTestId("trash")).toBeTruthy();
        await settle();
        expect(H.findWindow).not.toHaveBeenCalled();
    });
});
