import { describe, it, expect } from "vitest";
import type { Order } from "@/types/order";
import { orderMatchesAdChannel, summarizeAdChannels } from "./ad-channel-filter";

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
        status: "delivered",
        priority: "normal",
        payment_status: "cod",
        created_at: "2026-10-12T00:00:00.000Z",
        is_return: false,
        is_archived: false,
        ...overrides,
    } as Order;
}

describe("orderMatchesAdChannel", () => {
    it("matches everything when no channel is selected", () => {
        expect(orderMatchesAdChannel(order({ ad_channel: null }), undefined)).toBe(true);
        expect(orderMatchesAdChannel(order({ ad_channel: "tiktok" }), null)).toBe(true);
    });

    it("keeps only the selected channel", () => {
        expect(orderMatchesAdChannel(order({ ad_channel: "instagram" }), "instagram")).toBe(true);
        expect(orderMatchesAdChannel(order({ ad_channel: "facebook" }), "instagram")).toBe(false);
        expect(orderMatchesAdChannel(order({ ad_channel: null }), "instagram")).toBe(false);
    });
});

describe("summarizeAdChannels", () => {
    it("counts orders and realized revenue per channel, most orders first", () => {
        const { stats } = summarizeAdChannels([
            order({ ad_channel: "facebook", price: 50000, status: "delivered" }),
            order({ ad_channel: "instagram", price: 40000, status: "delivered" }),
            order({ ad_channel: "instagram", price: 30000, status: "completed" }),
        ]);
        expect(stats.map(s => [s.channel, s.label, s.orders, s.revenue])).toEqual([
            ["instagram", "Instagram", 2, 70000],
            ["facebook", "Facebook", 1, 50000],
        ]);
    });

    it("counts an unrealized order but not its money", () => {
        const [stat] = summarizeAdChannels([order({ ad_channel: "tiktok", price: 44750, status: "confirmed" })]).stats;
        expect(stat.orders).toBe(1);
        expect(stat.revenue).toBe(0);
    });

    it("counts a return toward the list it opens but never as revenue", () => {
        const [stat] = summarizeAdChannels([
            order({ ad_channel: "instagram", is_return: true, status: "completed", price: 20000 }),
        ]).stats;
        expect(stat.orders).toBe(1);
        expect(stat.revenue).toBe(0);
    });

    it("reports attributed vs total so the UI can say how much is unattributed", () => {
        const summary = summarizeAdChannels([
            order({ ad_channel: "instagram" }),
            order({ ad_channel: null }),
            order({}),
        ]);
        expect(summary.attributed).toBe(1);
        expect(summary.total).toBe(3);
    });

    it("chip counts equal what the filter returns for each channel", () => {
        const orders = [
            order({ ad_channel: "instagram" }),
            order({ ad_channel: "instagram", is_return: true }),
            order({ ad_channel: "tiktok" }),
            order({ ad_channel: null }),
        ];
        for (const stat of summarizeAdChannels(orders).stats) {
            expect(orders.filter(o => orderMatchesAdChannel(o, stat.channel))).toHaveLength(stat.orders);
        }
    });

    it("labels an unknown network by its raw source", () => {
        const [stat] = summarizeAdChannels([
            order({ ad_channel: "other", attribution: { channel: "other", source: "pinterest" } }),
        ]).stats;
        expect(stat.label).toBe("pinterest");
    });
});
