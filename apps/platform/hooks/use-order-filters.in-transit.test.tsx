import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type { Order, OrderFilters } from "@/types/order";

vi.mock("@/components/auth/auth-provider", () => ({ useAuth: () => ({ tenantId: null }) }));
vi.mock("@/lib/supabase", () => ({ supabase: {} }));
vi.mock("@/hooks/use-toast", () => ({ toast: { error: vi.fn() } }));

import { useOrderFilters } from "./use-order-filters";

const row = (id: string, status: Order["status"], created_at: string) =>
    ({ id, order_id: id, status, created_at, is_return: false, is_archived: false, items: [], customer_name: "x", phone: "0770" }) as unknown as Order;

// The loaded window holds one in-transit order; an older one lives outside it.
const WINDOW_ROWS = [row("in-window", "in_transit", "2026-11-05T05:00:00Z"), row("new", "new", "2026-11-05T05:00:00Z")];
const OLD = [row("old", "in_transit", "2026-10-01T05:00:00Z")];

function view(inTransit: Parameters<typeof useOrderFilters>[0]["inTransit"]) {
    const filters = { status: "in_transit", dateFrom: "2026-11-05", dateTo: "2026-11-05" } as OrderFilters;
    return renderHook(() =>
        useOrderFilters({ orders: WINDOW_ROWS, searchResults: null, filters, setFilters: vi.fn(), clearFilters: vi.fn(), inTransit }),
    ).result.current;
}

describe("in-transit tab across dates", () => {
    it("follows the date filter when not enabled (mobile)", () => {
        const v = view(null);
        expect(v.filteredOrders.map((o) => o.id)).toEqual(["in-window"]);
        expect(v.statusCounts.in_transit).toBe(1);
    });

    it("lists and counts every in-transit order, and the chip equals the list", () => {
        const v = view({ extras: OLD, loaded: true, scope: "any" });
        expect(v.filteredOrders.map((o) => o.id).sort()).toEqual(["in-window", "old"]);
        expect(v.statusCounts.in_transit).toBe(v.filteredOrders.length);
        expect(v.statusCounts.new).toBe(1);
    });

    it("today scope drops the older one", () => {
        const v = view({ extras: OLD, loaded: true, scope: "today" });
        expect(v.filteredOrders.map((o) => o.id)).toEqual(["in-window"]);
        expect(v.statusCounts.in_transit).toBe(1);
    });

    it("is not covered (counts hidden) until every in-transit order is read", () => {
        expect(view({ extras: [], loaded: false, scope: "any" }).countViewFacts.ready).toBe(false);
        expect(view({ extras: OLD, loaded: true, scope: "any" }).countViewFacts.ready).toBe(true);
    });
});
