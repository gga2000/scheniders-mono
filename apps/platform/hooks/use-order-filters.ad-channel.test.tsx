import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type { Order, OrderFilters } from "@/types/order";

// No tenant means the saved-views effect never queries; nothing here touches a database.
vi.mock("@/components/auth/auth-provider", () => ({ useAuth: () => ({ tenantId: null }) }));
vi.mock("@/lib/supabase", () => ({ supabase: {} }));
vi.mock("@/hooks/use-toast", () => ({ toast: { error: vi.fn() } }));

import { useOrderFilters } from "./use-order-filters";

let seq = 0;
function order(overrides: Partial<Order> = {}): Order {
    seq += 1;
    return {
        id: `o-${seq}`,
        order_id: String(seq),
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

const ORDERS = [
    order({ ad_channel: "instagram", status: "new" }),
    order({ ad_channel: "instagram", status: "confirmed" }),
    order({ ad_channel: "tiktok", status: "new" }),
    order({ ad_channel: "facebook", status: "new" }),
    order({ ad_channel: null, status: "new" }),
];

function run(filters: OrderFilters) {
    return renderHook(() =>
        useOrderFilters({ orders: ORDERS, searchResults: null, filters, setFilters: vi.fn(), clearFilters: vi.fn() }),
    ).result.current;
}

describe("useOrderFilters — ad channel", () => {
    it("narrows the list to the selected channel", () => {
        const { filteredOrders } = run({ status: "all", adChannel: "instagram" });
        expect(filteredOrders.map(o => o.ad_channel)).toEqual(["instagram", "instagram"]);
    });

    it("leaves the list alone with no channel selected", () => {
        expect(run({ status: "all" }).filteredOrders).toHaveLength(ORDERS.length);
    });

    it("counts channels over the view without the channel filter itself", () => {
        const { adChannelSummary } = run({ status: "all", adChannel: "instagram" });
        expect(adChannelSummary.stats.map(s => [s.channel, s.orders])).toEqual([
            ["instagram", 2],
            ["facebook", 1],
            ["tiktok", 1],
        ]);
        expect(adChannelSummary.attributed).toBe(4);
        expect(adChannelSummary.total).toBe(5);
    });

    it("follows the status tab, so a chip's count matches the list it opens", () => {
        const filters: OrderFilters = { status: "new" };
        const { adChannelSummary } = run(filters);
        const instagram = adChannelSummary.stats.find(s => s.channel === "instagram");
        expect(instagram?.orders).toBe(1);
        expect(run({ ...filters, adChannel: "instagram" }).filteredOrders).toHaveLength(1);
    });
});
