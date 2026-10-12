import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type { Order, OrderFilters } from "@/types/order";

// No tenant means the saved-views effect never queries; nothing here touches a database.
vi.mock("@/components/auth/auth-provider", () => ({ useAuth: () => ({ tenantId: null }) }));
vi.mock("@/lib/supabase", () => ({ supabase: {} }));
vi.mock("@/hooks/use-toast", () => ({ toast: { error: vi.fn() } }));

import { useOrderFilters } from "./use-order-filters";

function order(id: string, overrides: Partial<Order> = {}): Order {
    return {
        id,
        order_id: id,
        customer_name: "x",
        phone: "07700000000",
        items: [],
        price: 10000,
        status: "new",
        priority: "normal",
        payment_status: "cod",
        created_at: "2026-10-12T08:00:00.000Z",
        is_return: false,
        is_archived: false,
        ...overrides,
    } as Order;
}

const TODAY = "2026-10-12";
const WINDOW = [order("today-new"), order("today-confirmed", { status: "confirmed" })];

function run(filters: OrderFilters, searchResults: Order[] | null) {
    return renderHook(() =>
        useOrderFilters({ orders: WINDOW, searchResults, filters, setFilters: vi.fn(), clearFilters: vi.fn() }),
    ).result.current;
}

describe("useOrderFilters — search is a lookup, not a filter on the window", () => {
    // An order from months ago, completed, merged away, and one in the trash:
    // none of them is in today's window or matches the "new" chip.
    const MATCHES = [
        order("old-completed", { status: "completed", created_at: "2026-03-01T10:00:00.000Z" }),
        order("archived", { status: "rejected", is_archived: true, created_at: "2026-09-01T10:00:00.000Z" }),
        order("trashed", { status: "cancelled", deleted_at: "2026-10-01T10:00:00.000Z" } as Partial<Order>),
    ];

    it("shows every server match regardless of the date window and status chip", () => {
        const { filteredOrders } = run(
            { status: "new", dateFrom: TODAY, dateTo: TODAY, searchQuery: "0770" },
            MATCHES,
        );
        expect(filteredOrders.map(o => o.id)).toEqual(["old-completed", "archived", "trashed"]);
    });

    it("keeps the server's ranking instead of re-sorting by date", () => {
        const ranked = [MATCHES[0], MATCHES[2], MATCHES[1]];
        const { filteredOrders } = run({ status: "all", searchQuery: "x" }, ranked);
        expect(filteredOrders.map(o => o.id)).toEqual(["old-completed", "trashed", "archived"]);
    });

    it("returns to the filtered window when the search is cleared", () => {
        const { filteredOrders } = run({ status: "confirmed", dateFrom: TODAY, dateTo: TODAY }, null);
        expect(filteredOrders.map(o => o.id)).toEqual(["today-confirmed"]);
    });

    it("an empty search result is an empty list, not the window", () => {
        expect(run({ status: "all", searchQuery: "nothing" }, []).filteredOrders).toEqual([]);
    });
});
