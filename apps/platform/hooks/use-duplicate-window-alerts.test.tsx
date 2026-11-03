// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { OrderWindow } from "@/lib/order-window";

const H = vi.hoisted(() => ({ findWindow: vi.fn(), listSettled: false }));

vi.mock("@/hooks/use-auth", () => ({
    useAuth: () => ({ session: { access_token: "t" }, clientReady: true, tenantId: "tenant-1" }),
}));
vi.mock("@/hooks/orders-list-coverage", () => ({
    useOrdersListSettledOnce: () => H.listSettled,
}));
vi.mock("@/lib/repositories/order-repository", () => ({
    orderRepository: { findWindow: H.findWindow },
}));

import { useDuplicateWindowAlerts } from "./use-duplicate-window-alerts";

const today: OrderWindow = {
    fromInstant: Date.parse("2026-11-02T21:00:00.000Z"),
    toInstant: Date.parse("2026-11-03T20:59:59.999Z"),
    fromDay: "2026-11-03",
    toDay: "2026-11-03",
};

describe("useDuplicateWindowAlerts margin read", () => {
    const render = () => {
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        const wrapper = ({ children }: { children: ReactNode }) => (
            <QueryClientProvider client={client}>{children}</QueryClientProvider>
        );
        return renderHook(() => useDuplicateWindowAlerts([], today), { wrapper });
    };

    beforeEach(() => {
        H.findWindow.mockReset();
        H.findWindow.mockResolvedValue([]);
    });

    it("waits for the list before reading the margin", async () => {
        // The margin started beside the list on every load and slowed it.
        H.listSettled = false;
        const hook = render();
        await new Promise((r) => setTimeout(r, 20));
        expect(H.findWindow).not.toHaveBeenCalled();

        H.listSettled = true;
        hook.rerender();
        await waitFor(() => expect(H.findWindow).toHaveBeenCalledTimes(1));
    });

    it("reads the 48h margin without the risk join", async () => {
        H.listSettled = true;
        render();

        await waitFor(() => expect(H.findWindow).toHaveBeenCalledTimes(1));
        const [tenantId, window, opts] = H.findWindow.mock.calls[0];
        expect(tenantId).toBe("tenant-1");
        expect(window).toMatchObject({ fromDay: "2026-11-01", toDay: "2026-11-05" });
        // risk_data is never read from margin rows; the join cost its own
        // customer_trust requests on every page load.
        expect(opts).toEqual({ withRisk: false });
    });
});
