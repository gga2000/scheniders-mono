import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const useFinanceOrders = vi.fn((_range: { start: Date; end: Date }) => ({ orders: [], loading: false, error: null }));
const useExpenses = vi.fn((_filters: { startDate: string; endDate: string }) => ({ expenses: [], loading: false }));
const useFinanceOverview = vi.fn(() => ({ net_profit: 1_200_000, marketing_cost: 300_000, delivered_revenue: 5_000_000 }));

vi.mock("@/hooks/use-finance-orders", () => ({ useFinanceOrders: (a: { start: Date; end: Date }) => useFinanceOrders(a) }));
vi.mock("@/hooks/use-products-crud", () => ({ useProductsCrud: () => ({ products: [] }) }));
vi.mock("@/hooks/use-expenses", () => ({ useExpenses: (a: { startDate: string; endDate: string }) => useExpenses(a) }));
vi.mock("@/hooks/use-order-cost-snapshots", () => ({ useOrderCostSnapshots: () => ({}) }));
vi.mock("@/hooks/use-finance-overview", () => ({
    useFinanceOverview: (...a: unknown[]) => (useFinanceOverview as (...x: unknown[]) => unknown)(...a),
}));

import { useNetProfitForRange } from "./use-net-profit-for-range";

describe("useNetProfitForRange", () => {
    it("asks for whole Baghdad days and returns the overview's numbers", () => {
        const { result } = renderHook(() => useNetProfitForRange({ since: "2026-10-01", until: "2026-10-31" }));

        const range = useFinanceOrders.mock.calls[0][0];
        expect(range.start.toISOString()).toBe("2026-09-30T21:00:00.000Z");
        expect(range.end.toISOString()).toBe("2026-10-31T20:59:59.999Z");
        expect(useExpenses).toHaveBeenCalledWith({ startDate: "2026-10-01", endDate: "2026-10-31" });
        expect(result.current).toEqual({
            netProfit: 1_200_000,
            marketingCost: 300_000,
            deliveredRevenue: 5_000_000,
            loading: false,
            error: null,
        });
    });
});
