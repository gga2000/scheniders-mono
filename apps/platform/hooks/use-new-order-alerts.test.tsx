import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

/**
 * The new-order alert used to ride on the order book's realtime channel, and
 * the book was in the root layout, so it fired on every route. With the book
 * mounted per route the alert has its own channel; these hold what it must keep:
 * INSERTs only, the active tenant only, archived rows silent.
 */

type Handler = (payload: { new: unknown }) => void;

const H = vi.hoisted(() => ({
    tenantId: "tenant-1" as string | null,
    channelNames: [] as string[],
    configs: [] as unknown[],
    handlers: [] as Handler[],
    removed: 0,
    notify: vi.fn(async () => {}),
}));

vi.mock("@/lib/supabase", () => {
    const channel = {
        on(_type: string, config: unknown, handler: Handler) {
            H.configs.push(config);
            H.handlers.push(handler);
            return channel;
        },
        subscribe() {
            return channel;
        },
    };
    return {
        supabase: {
            channel: (name: string) => {
                H.channelNames.push(name);
                return channel;
            },
            removeChannel: async () => {
                H.removed++;
            },
        },
    };
});
vi.mock("@/lib/notification-service", () => ({
    notificationService: { showNewOrderNotification: H.notify },
}));
vi.mock("@/components/auth/auth-provider", () => ({ useAuth: () => ({ tenantId: H.tenantId }) }));

import { useNewOrderAlerts } from "./use-new-order-alerts";

beforeEach(() => {
    H.tenantId = "tenant-1";
    H.channelNames.length = 0;
    H.configs.length = 0;
    H.handlers.length = 0;
    H.removed = 0;
    H.notify.mockClear();
});

describe("useNewOrderAlerts", () => {
    it("listens for INSERTs on the active tenant's orders only", () => {
        renderHook(() => useNewOrderAlerts());
        expect(H.configs).toEqual([
            { event: "INSERT", schema: "public", table: "orders", filter: "tenant_id=eq.tenant-1" },
        ]);
    });

    it("announces a new order with its customer, number and priority", () => {
        renderHook(() => useNewOrderAlerts());
        H.handlers[0]({ new: { order_id: "LF-1001", customer_name: "Sara", priority: "urgent", is_archived: false } });
        expect(H.notify).toHaveBeenCalledWith("Sara", "LF-1001", "urgent");
    });

    it("stays silent for an archived insert and for a payload it cannot read", () => {
        renderHook(() => useNewOrderAlerts());
        H.handlers[0]({ new: { order_id: "LF-1002", customer_name: "Sara", is_archived: true } });
        H.handlers[0]({ new: { customer_name: "no order id" } });
        expect(H.notify).not.toHaveBeenCalled();
    });

    it("opens no channel before a tenant is active, and closes it on unmount", () => {
        H.tenantId = null;
        const first = renderHook(() => useNewOrderAlerts());
        expect(H.channelNames).toEqual([]);
        first.unmount();

        H.tenantId = "tenant-1";
        const second = renderHook(() => useNewOrderAlerts());
        expect(H.channelNames).toHaveLength(1);
        second.unmount();
        expect(H.removed).toBe(1);
    });
});
