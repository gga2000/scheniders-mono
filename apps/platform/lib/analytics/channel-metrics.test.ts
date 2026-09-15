import { describe, it, expect } from "vitest";
import { calculateChannelPerformance } from "@/lib/analytics/channel-metrics";
import type { Order } from "@/lib/supabase";

const RANGE = { from: new Date("2026-09-01T00:00:00Z"), to: new Date("2026-09-30T23:59:59Z") };

let seq = 0;
const order = (overrides: Partial<Order> = {}): Order => ({
    id: `o${++seq}`,
    order_id: String(1000 + seq),
    customer_name: "عميل",
    phone: "07700000000",
    city: "بغداد",
    status: "delivered",
    price: 100,
    items: [],
    created_at: "2026-09-10T10:00:00Z",
    ...overrides,
} as Order);

describe("calculateChannelPerformance", () => {
    it("counts realized revenue only where the money actually landed", () => {
        const [row] = calculateChannelPerformance([
            order({ ad_channel: "instagram", status: "delivered", price: 100 }),
            order({ ad_channel: "instagram", status: "confirmed", price: 500 }),
            order({ ad_channel: "instagram", status: "rejected", price: 900 }),
        ], RANGE);

        expect(row.orders).toBe(3);
        expect(row.realizedRevenue).toBe(100);
        expect(row.grossValue).toBe(1500);
        // confirmed counts everything that reached the courier, delivered included.
        expect(row.confirmed).toBe(2);
        expect(row.delivered).toBe(1);
        expect(row.deliveryRate).toBe(50);
    });

    it("ranks by money landed, not by order count", () => {
        const rows = calculateChannelPerformance([
            order({ ad_channel: "tiktok", status: "delivered", price: 10 }),
            order({ ad_channel: "tiktok", status: "delivered", price: 10 }),
            order({ ad_channel: "tiktok", status: "delivered", price: 10 }),
            order({ ad_channel: "facebook", status: "delivered", price: 900 }),
        ], RANGE);

        expect(rows.map(r => r.channel)).toEqual(["facebook", "tiktok"]);
        expect(rows[0].rank).toBe(1);
    });

    it("leaves unattributed orders out instead of bucketing them as a channel", () => {
        const rows = calculateChannelPerformance([
            order({ ad_channel: "instagram" }),
            order({ ad_channel: null as unknown as string }),
            order({}),
        ], RANGE);

        expect(rows).toHaveLength(1);
        // Share is of *attributed* orders, so one channel with data reads 100%,
        // not 33% against rows nobody can act on.
        expect(rows[0].share).toBe(100);
    });

    it("excludes returns — a refund is not a second acquisition", () => {
        const rows = calculateChannelPerformance([
            order({ ad_channel: "instagram", price: 100 }),
            order({ ad_channel: "instagram", price: 100, is_return: true }),
        ], RANGE);

        expect(rows[0].orders).toBe(1);
        expect(rows[0].realizedRevenue).toBe(100);
    });

    it("honours the date range on both edges", () => {
        const rows = calculateChannelPerformance([
            order({ ad_channel: "instagram", created_at: "2026-08-31T23:59:00Z" }),
            order({ ad_channel: "instagram", created_at: "2026-09-01T00:30:00Z" }),
            order({ ad_channel: "instagram", created_at: "2026-10-01T00:30:00Z" }),
        ], RANGE);

        expect(rows[0].orders).toBe(1);
    });

    it("reports revenue per order so a few large orders are not buried", () => {
        const rows = calculateChannelPerformance([
            order({ ad_channel: "facebook", status: "delivered", price: 300 }),
            order({ ad_channel: "facebook", status: "delivered", price: 100 }),
        ], RANGE);

        expect(rows[0].revenuePerOrder).toBe(200);
    });

    it("never divides by zero when a channel has booked nothing", () => {
        const rows = calculateChannelPerformance([
            order({ ad_channel: "threads", status: "new", price: 100 }),
        ], RANGE);

        expect(rows[0].deliveryRate).toBe(0);
        expect(rows[0].revenuePerOrder).toBe(0);
    });

    it("returns nothing when no order in range carries a channel", () => {
        expect(calculateChannelPerformance([order({})], RANGE)).toEqual([]);
    });
});
