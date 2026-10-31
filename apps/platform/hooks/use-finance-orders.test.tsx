import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { Order } from "@/types/order";

const findWindow = vi.fn();

vi.mock("@/components/auth/auth-provider", () => ({ useAuth: () => ({ tenantId: "tenant-1" }) }));
vi.mock("@/lib/repositories/order-repository", () => ({ orderRepository: { findWindow: (...a: unknown[]) => findWindow(...a) } }));

import { useFinanceOrders } from "./use-finance-orders";

const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>
);

describe("useFinanceOrders", () => {
    beforeEach(() => {
        findWindow.mockReset();
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

        expect(result.current.orders).toBe(rows);
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
});
