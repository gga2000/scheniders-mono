import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { Order } from "@/types/order";

const findWindow = vi.fn();
const findRefundsPaidBetween = vi.fn();

vi.mock("@/components/auth/auth-provider", () => ({ useAuth: () => ({ tenantId: "tenant-1" }) }));
vi.mock("@/lib/repositories/order-repository", () => ({
    orderRepository: {
        findWindow: (...a: unknown[]) => findWindow(...a),
        findRefundsPaidBetween: (...a: unknown[]) => findRefundsPaidBetween(...a),
    },
}));

import { useFinanceOrders, withOnTheRoad } from "./use-finance-orders";

const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>
);

describe("useFinanceOrders", () => {
    beforeEach(() => {
        findWindow.mockReset();
        findRefundsPaidBetween.mockReset();
        findRefundsPaidBetween.mockResolvedValue([]);
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(new Date("2026-10-31T09:00:00.000Z"));
    });

    it("reads the picked period from the server, not from the orders page window", async () => {
        const rows = [{ id: "a" }] as Order[];
        findWindow.mockResolvedValue(rows);
        const { result } = renderHook(
            () => useFinanceOrders({ start: new Date("2026-10-01T00:00:00.000Z"), end: new Date("2026-10-31T20:00:00.000Z") }),
            { wrapper },
        );
        await waitFor(() => expect(result.current.loading).toBe(false));

        expect(result.current.orders).toEqual(rows);
        const window = findWindow.mock.calls[0][1];
        expect(window.fromDay).toBe("2026-10-01");
        expect(window.toDay).toBe("2026-10-31");
        // Finances never shows customer risk: skip the trust join.
        expect(findWindow.mock.calls[0][2]).toEqual({ withRisk: false });
    });

    it("always covers the cash tab's last 30 days and the compare period", async () => {
        findWindow.mockResolvedValue([]);
        const { result } = renderHook(
            () => useFinanceOrders({
                start: new Date("2026-10-30T00:00:00.000Z"),
                end: new Date("2026-10-30T20:00:00.000Z"),
                compareStart: new Date("2026-09-01T00:00:00.000Z"),
            }),
            { wrapper },
        );
        await waitFor(() => expect(result.current.loading).toBe(false));

        const window = findWindow.mock.calls[0][1];
        expect(window.fromDay).toBe("2026-09-01");
        expect(window.toDay).toBe("2026-10-31");
    });

    it("adds refunds paid in the range that were created before it, once each", async () => {
        findWindow.mockResolvedValue([{ id: "a" }, { id: "r-new" }] as Order[]);
        findRefundsPaidBetween.mockResolvedValue([{ id: "r-old" }, { id: "r-new" }] as Order[]);
        const { result } = renderHook(
            () => useFinanceOrders({ start: new Date("2026-10-01T00:00:00.000Z"), end: new Date("2026-10-31T20:00:00.000Z") }),
            { wrapper },
        );
        await waitFor(() => expect(result.current.loading).toBe(false));

        expect(result.current.orders.map((o) => o.id)).toEqual(["a", "r-new", "r-old"]);
        expect(findRefundsPaidBetween.mock.calls[0]).toEqual(["tenant-1", "2026-10-01", "2026-10-31"]);
    });
});

describe("withOnTheRoad", () => {
    const row = (id: string, status: string, price = 1000) => ({ id, status, price }) as unknown as Order;

    it("takes the money on the road from every open order, not only the period's", () => {
        const period = [row("delivered", "delivered"), row("open-in-period", "in_transit"), row("refused", "rejected")];
        // A parcel out for 40 days is outside a 7-day period but still on the road.
        const open = [row("open-in-period", "in_transit"), row("out-40-days", "in_transit", 5000), row("waiting", "confirmed")];
        expect(withOnTheRoad(period, open).map((o) => o.id)).toEqual(["delivered", "refused", "open-in-period", "out-40-days", "waiting"]);
    });

    it("drops a period row that was open when read but is not open any more", () => {
        expect(withOnTheRoad([row("x", "in_transit")], []).map((o) => o.id)).toEqual([]);
    });

    it("keeps the period's settled copy when the open list read the order before it settled", () => {
        expect(withOnTheRoad([row("x", "delivered")], [row("x", "in_transit")]).map((o) => o.status)).toEqual(["delivered"]);
    });
});
