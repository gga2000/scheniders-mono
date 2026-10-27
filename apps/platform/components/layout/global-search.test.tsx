import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Order } from "@/types/order";
import { MAX_SEARCH_RESULTS } from "@/lib/order-server-search";

/**
 * The top-bar search is rendered by the root layout on every route, above the
 * routes that mount the order book, so it can never read one (PERF-D1). Orders,
 * customers and products all come from the server — and so a customer who last
 * ordered on another day is found, which the window (today, by default) never
 * allowed.
 */

const H = vi.hoisted(() => ({
    search: vi.fn(),
    searchByName: vi.fn(),
}));

vi.mock("@/lib/repositories/order-repository", () => ({ orderRepository: { search: H.search } }));
vi.mock("@/lib/repositories/product-repository", () => ({ productRepository: { searchByName: H.searchByName } }));
vi.mock("@/components/auth/auth-provider", () => ({
    useAuth: () => ({ session: { access_token: "t" }, clientReady: true, tenantId: "tenant-1" }),
}));
vi.mock("@/components/providers/language-provider", () => ({
    useLanguage: () => ({ t: (key: string) => key, language: "en" }),
}));
vi.mock("@/hooks/use-status-label", () => ({ useStatusLabel: () => (status: string) => status }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
// TopBar's own pieces, imported by the same module and not rendered by GlobalSearch.
vi.mock("@/components/chat/live-presence-stack", () => ({ LivePresenceStack: () => null }));
vi.mock("@/components/chat/chat-trigger", () => ({ ChatTrigger: () => null }));
vi.mock("@/components/layout/notifications-dropdown", () => ({ NotificationsDropdown: () => null }));
vi.mock("@/components/orders/auto-send-toggle", () => ({ AutoSendToggle: () => null }));
vi.mock("@/components/layout/merchant-code-badge", () => ({ MerchantCodeBadge: () => null }));
vi.mock("@/components/layout/theme-toggle", () => ({ ThemeToggle: () => null }));
vi.mock("@/components/layout/language-toggle", () => ({ LanguageToggle: () => null }));

import { GlobalSearch } from "./global-search";

const match = (id: string, phone: string, name: string, createdAt: string) =>
    ({ id, order_id: `LF-${id}`, phone, customer_name: name, price: 25000, status: "delivered", created_at: createdAt, items: [] }) as unknown as Order;

function renderSearch() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
        <QueryClientProvider client={client}>
            <GlobalSearch />
        </QueryClientProvider>,
    );
}

function type(text: string) {
    const input = screen.getByPlaceholderText("search.placeholder");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: text } });
}

afterEach(cleanup);

beforeEach(() => {
    H.search.mockReset();
    H.searchByName.mockReset();
    H.search.mockResolvedValue([
        match("1", "07701112222", "Ahmed Ali", "2026-09-02T10:00:00Z"),
        match("2", "07701112222", "Ahmed Ali", "2026-10-01T10:00:00Z"),
        match("3", "07803334444", "Ahmed Kareem", "2026-06-15T10:00:00Z"),
    ]);
    H.searchByName.mockResolvedValue([{ id: "p1", name: "Ahmed's Oud", price: 15000 }]);
});

describe("GlobalSearch without an order book", () => {
    it("renders outside <OrdersProvider> and lists orders, customers and products from the server", async () => {
        renderSearch();
        type("ahmed");

        // Orders from earlier months, which the today-window never held.
        await waitFor(() => expect(screen.getByText("#LF-3 - Ahmed Kareem")).toBeTruthy(), { timeout: 2000 });
        expect(H.search).toHaveBeenCalledWith("tenant-1", "ahmed", 8);

        // Customers: one row per phone among the matches, with its match count.
        // ("All" lists orders first, so with 3 orders + 2 customers + 1 product
        // everything fits in the 8 rows.)
        const customers = screen.getAllByText(/^Ahmed (Ali|Kareem)$/);
        expect(customers.map((c) => c.textContent).sort()).toEqual(["Ahmed Ali", "Ahmed Kareem"]);
        expect(screen.getByText("2 orders")).toBeTruthy();

        // Products: the catalogue by name, tenant-scoped.
        await waitFor(() => expect(screen.getByText("Ahmed's Oud")).toBeTruthy());
        expect(H.searchByName).toHaveBeenCalledWith("tenant-1", "ahmed", 8);
    });

    it("the Customers tab searches wider, so one customer's orders do not crowd out the rest", async () => {
        renderSearch();
        fireEvent.click(screen.getByText("nav.customers"));
        type("ahmed");

        await waitFor(() => expect(screen.getByText("Ahmed Kareem")).toBeTruthy(), { timeout: 2000 });
        expect(H.search).toHaveBeenCalledWith("tenant-1", "ahmed", MAX_SEARCH_RESULTS);
        // Customers only: no order rows, no product search.
        expect(screen.queryByText("#LF-1 - Ahmed Ali")).toBeNull();
        expect(H.searchByName).not.toHaveBeenCalled();
    });

    it("an order that matched on its number alone does not list its customer", async () => {
        H.search.mockResolvedValue([match("3879", "07701112222", "Zainab", "2026-10-01T10:00:00Z")]);
        H.searchByName.mockResolvedValue([]);
        renderSearch();
        type("3879");

        await waitFor(() => expect(screen.getByText("#LF-3879 - Zainab")).toBeTruthy(), { timeout: 2000 });
        expect(screen.queryByText("Zainab")).toBeNull();
    });
});
