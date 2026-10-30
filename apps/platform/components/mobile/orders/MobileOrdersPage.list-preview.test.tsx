import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { Order } from "@/lib/supabase";

/**
 * The mobile orders screen while All Orders loads: the newest rows, inert, a
 * strip saying why, and "—" where the list's length goes. A preview narrowed
 * to nothing shows the loading state, never "no orders".
 */

const H = vi.hoisted(() => ({ ctx: {} as Record<string, unknown> }));

vi.mock("@/components/providers/orders-provider", () => ({ useOrdersContext: () => H.ctx }));
vi.mock("@/components/layout/dashboard-layout", () => ({ useSidebar: () => ({ setMobileMenuOpen: vi.fn() }) }));
vi.mock("@/hooks/use-language", () => ({ useLanguage: () => ({ t: (k: string) => k }) }));
vi.mock("./MobileOrdersList", () => ({
    MobileOrdersList: ({ orders }: { orders: Order[] }) => (
        <ul data-testid="list">{orders.map((o) => <li key={o.id}>{o.id}</li>)}</ul>
    ),
}));
vi.mock("./MobileSearchModal", () => ({ MobileSearchModal: () => null }));
vi.mock("./MobileFilterModal", () => ({ MobileFilterModal: () => null }));
vi.mock("@/components/orders/order-details-modal", () => ({ OrderDetailsModal: () => null }));
vi.mock("@/components/orders/whatsapp-template-panel", () => ({ WhatsAppTemplatePanel: () => null }));
vi.mock("@/components/orders/sticky-filter-bar", () => ({ StickyFilterBar: () => null }));
vi.mock("@/components/orders/ad-channel-filter", () => ({ AdChannelFilter: () => null }));
vi.mock("@/components/orders/auto-send-toggle", () => ({ AutoSendToggle: () => null }));
vi.mock("@/components/orders/order-search-banner", () => ({ OrderSearchBanner: () => null }));
vi.mock("@/components/orders/duplicate-confirm-dialog", () => ({ DuplicateConfirmDialog: () => null }));
vi.mock("@/hooks/use-duplicate-dispatch-guard", () => ({
    useDuplicateDispatchGuard: () => ({ holdStatusChange: () => false, dialogProps: {} }),
}));
vi.mock("@/hooks/use-products-crud", () => ({ useProductsCrud: () => ({ products: [] }) }));
vi.mock("@/hooks/use-stock-shortfall-guard", () => ({
    useStockShortfallGuard: () => ({ holdStatusChange: () => false, dialogProps: {} }),
}));
vi.mock("@/components/orders/stock-shortfall-dialog", () => ({ StockShortfallDialog: () => null }));
vi.mock("@/components/orders/stock-today-dialog", () => ({ StockTodayDialog: () => null }));

import { MobileOrdersPage } from "./MobileOrdersPage";

const o = (id: string, at: string, extra: Partial<Order> = {}) =>
    ({ id, created_at: at, status: "new", items: [], phone: "07700000000", ...extra }) as unknown as Order;

function context(over: Record<string, unknown>): Record<string, unknown> {
    return {
        orders: [],
        filteredOrders: [],
        fetchOrders: vi.fn(),
        updateOrderStatus: vi.fn(),
        updateOrder: vi.fn(),
        getOrderTimeline: vi.fn(),
        getOrderNotes: vi.fn(),
        addOrderNote: vi.fn(),
        deleteOrder: vi.fn(),
        checkOrderIdExists: vi.fn(),
        messageTemplates: [],
        filters: { status: "all" },
        setFilters: vi.fn(),
        statusCounts: {},
        adChannelSummary: { total: 0, channels: [] },
        countViewFacts: { ready: false, covered: false, statusIsAll: true, windowIsAll: true },
        listCovered: false,
        listPreview: null,
        loading: true,
        ordersPending: true,
        isRefreshing: true,
        orderSearch: { active: false, pending: false, isFetching: false, error: null },
        getCustomerArchivedCount: () => 0,
        getCustomerOrderCount: () => 0,
        hasDuplicates: () => false,
        getDuplicateWindowAlert: () => undefined,
        getConfirmBlockingTwin: () => null,
        exportOrders: vi.fn(),
        ...over,
    };
}

const badge = () => screen.getByTitle("Clear search and filters").textContent;

beforeEach(() => {
    H.ctx = context({});
});
afterEach(cleanup);

describe("MobileOrdersPage list preview", () => {
    it("shows the newest rows inert, with the strip, and no length", () => {
        const rows = [o("n2", "2026-10-20T07:00:00.000Z"), o("n1", "2026-10-20T06:00:00.000Z"), o("cut", "2026-10-20T05:00:00.000Z")];
        H.ctx = context({ listPreview: { rows, newestCutoff: "2026-10-20T05:00:00.000Z" } });
        render(<MobileOrdersPage />);
        expect(screen.getByTestId("list").textContent).toBe("n2n1");
        const wrapper = screen.getByTestId("list").closest("[data-orders-list-preview]");
        expect(wrapper).not.toBeNull();
        expect(wrapper?.hasAttribute("inert")).toBe(true);
        expect(screen.getByTestId("order-list-preview-strip")).toBeTruthy();
        expect(badge()).toBe("—");
    });

    it("a preview the filter narrows to nothing is still loading, not empty", () => {
        H.ctx = context({ listPreview: { rows: [], newestCutoff: null } });
        render(<MobileOrdersPage />);
        expect(screen.queryByTestId("list")).toBeNull();
        expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
    });

    it("with the risk filter on there is no preview: it waits for the window", () => {
        const rows = [o("n2", "2026-10-20T07:00:00.000Z")];
        H.ctx = context({ listPreview: { rows, newestCutoff: null }, filters: { status: "all", riskLevel: "flagged" } });
        render(<MobileOrdersPage />);
        expect(screen.queryByTestId("order-list-preview-strip")).toBeNull();
        expect(screen.queryByTestId("list")).toBeNull();
    });

    it("once covered: the list, its length, nothing inert", () => {
        const rows = [o("a", "2026-10-20T07:00:00.000Z"), o("b", "2026-10-20T06:00:00.000Z")];
        H.ctx = context({ filteredOrders: rows, listCovered: true, loading: false, ordersPending: false, isRefreshing: false });
        render(<MobileOrdersPage />);
        expect(screen.getByTestId("list").textContent).toBe("ab");
        expect(screen.getByTestId("list").closest("[inert]")).toBeNull();
        expect(screen.queryByTestId("order-list-preview-strip")).toBeNull();
        expect(badge()).toBe("2");
    });
});
