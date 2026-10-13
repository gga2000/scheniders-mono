import { describe, it, expect } from "vitest";
import { calculateChannelPerformance, channelFactSchema, type ChannelFact } from "@/lib/analytics/channel-metrics";

const fact = (ad_channel: string | null, status: string, price?: number | null): ChannelFact => ({
    ad_channel,
    status,
    ...(price === undefined ? {} : { price }),
});

describe("calculateChannelPerformance", () => {
    it("counts realized revenue only for delivered/completed, like the dashboard", () => {
        const { channels } = calculateChannelPerformance([
            fact("instagram", "delivered", 100),
            fact("instagram", "completed", 50),
            fact("instagram", "confirmed", 500),
            fact("instagram", "rejected", 900),
            fact("instagram", "cancelled", 700),
        ], true);

        const [row] = channels;
        expect(row.orders).toBe(5);
        expect(row.realizedRevenue).toBe(150);
        expect(row.delivered).toBe(2);
        expect(row.rejected).toBe(1);
        // delivered ÷ (delivered + rejected): the in-flight and cancelled orders do not move it.
        expect(row.deliveryRate).toBeCloseTo((2 / 3) * 100);
        expect(row.revenuePerOrder).toBe(30);
    });

    it("ranks by money landed, not by order count", () => {
        const { channels } = calculateChannelPerformance([
            fact("tiktok", "delivered", 10),
            fact("tiktok", "delivered", 10),
            fact("tiktok", "delivered", 10),
            fact("facebook", "delivered", 900),
        ], true);

        expect(channels.map(r => [r.channel, r.rank])).toEqual([["facebook", 1], ["tiktok", 2]]);
    });

    it("keeps unattributed orders in their own bucket instead of dropping or folding them", () => {
        const summary = calculateChannelPerformance([
            fact("instagram", "delivered", 100),
            fact(null, "delivered", 40),
            fact("  ", "new", 40),
            fact(null, "rejected", 40),
        ], true);

        expect(summary.channels).toHaveLength(1);
        expect(summary.channels[0].share).toBe(25);
        expect(summary.unattributed).toMatchObject({
            channel: null,
            orders: 3,
            delivered: 1,
            rejected: 1,
            realizedRevenue: 40,
            share: 75,
            rank: 0,
        });
        expect(summary.attributedShare).toBe(25);
        // The headline total is the whole period's realized revenue, unattributed included.
        expect(summary.totalRealizedRevenue).toBe(140);
        expect(summary.totalOrders).toBe(4);
    });

    it("omits the unattributed bucket when every order carries a channel", () => {
        const summary = calculateChannelPerformance([fact("facebook", "new", 1)], true);
        expect(summary.unattributed).toBeNull();
        expect(summary.attributedShare).toBe(100);
    });

    it("reports a period with no attribution at all honestly", () => {
        const summary = calculateChannelPerformance([fact(null, "delivered", 100)], true);
        expect(summary.channels).toEqual([]);
        expect(summary.unattributed?.orders).toBe(1);
        expect(summary.attributedShare).toBe(0);
    });

    it("returns null money fields — never zeros — for viewers without financial access", () => {
        const summary = calculateChannelPerformance([
            fact("tiktok", "delivered"),
            fact("tiktok", "new"),
            fact("instagram", "delivered"),
            fact(null, "delivered"),
        ], false);

        expect(summary.totalRealizedRevenue).toBeNull();
        expect(summary.unattributed?.realizedRevenue).toBeNull();
        for (const row of summary.channels) {
            expect(row.realizedRevenue).toBeNull();
            expect(row.revenuePerOrder).toBeNull();
        }
        // Without money the ranking falls back to volume.
        expect(summary.channels.map(r => r.channel)).toEqual(["tiktok", "instagram"]);
    });

    it("leaves the delivery rate null until something has resolved", () => {
        const { channels } = calculateChannelPerformance([fact("threads", "new", 100)], true);
        expect(channels[0].deliveryRate).toBeNull();
        expect(channels[0].revenuePerOrder).toBe(0);
    });

    it("treats a null price on a delivered legacy row as zero revenue", () => {
        const { channels } = calculateChannelPerformance([fact("facebook", "delivered", null)], true);
        expect(channels[0].realizedRevenue).toBe(0);
        expect(channels[0].delivered).toBe(1);
    });

    it("handles an empty period", () => {
        expect(calculateChannelPerformance([], true)).toEqual({
            channels: [],
            unattributed: null,
            totalOrders: 0,
            totalRealizedRevenue: 0,
            attributedShare: 0,
        });
    });
});

describe("channelFactSchema", () => {
    it("accepts the server's row shapes with and without price", () => {
        expect(channelFactSchema.array().parse([
            { ad_channel: "instagram", status: "delivered", price: 25000 },
            { ad_channel: null, status: "new", price: null },
            { ad_channel: "tiktok", status: "new" },
        ])).toHaveLength(3);
    });

    it("rejects a row missing the status it is classified by", () => {
        expect(() => channelFactSchema.parse({ ad_channel: "instagram" })).toThrow();
    });
});
