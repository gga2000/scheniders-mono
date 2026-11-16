import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type { Order, OrderFilters } from "@/types/order";
import { windowCacheKey, windowFromDateFilter } from "@/lib/order-window";

vi.mock("@/components/auth/auth-provider", () => ({ useAuth: () => ({ tenantId: null }) }));
vi.mock("@/lib/supabase", () => ({ supabase: {} }));
vi.mock("@/hooks/use-toast", () => ({ toast: { error: vi.fn() } }));

import { useOrderFilters } from "./use-order-filters";

const row = (id: string, created_at: string) =>
    ({ id, order_id: id, status: "new", created_at, is_return: false, is_archived: false, items: [], customer_name: "x", phone: "0770" }) as unknown as Order;

const WEEK = { status: "all", dateFrom: "2026-11-10", dateTo: "2026-11-16" } as OrderFilters;
const weekKey = windowCacheKey(windowFromDateFilter(WEEK.dateFrom, WEEK.dateTo));
const todayKey = windowCacheKey(windowFromDateFilter("2026-11-16", "2026-11-16"));

function listIsCurrent(orders: Order[], loadedWindowKey: string | null, searchResults: Order[] | null = null) {
    return renderHook(() =>
        useOrderFilters({ orders, searchResults, filters: WEEK, setFilters: vi.fn(), clearFilters: vi.fn(), loadedWindowKey }),
    ).result.current.listIsCurrent;
}

// The empty state may only say «no matching orders» about the list the
// filter names. Round 13: the week's list was empty for 1.5 s while the rows
// on screen were still the day's.
describe("listIsCurrent: the list on screen answers the filter", () => {
    it("is false while the rows are another window's", () => {
        expect(listIsCurrent([], todayKey)).toBe(false);
        expect(listIsCurrent([], null)).toBe(false);
    });

    it("is true once the rows cover the window, empty or not", () => {
        expect(listIsCurrent([], weekKey)).toBe(true);
        expect(listIsCurrent([row("a", "2026-11-14T09:00:00Z")], weekKey)).toBe(true);
        expect(listIsCurrent([], "all")).toBe(true);
    });

    it("is true for search hits, which do not depend on the window", () => {
        expect(listIsCurrent([], todayKey, [])).toBe(true);
    });
});
