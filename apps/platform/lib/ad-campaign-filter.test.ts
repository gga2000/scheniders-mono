import { describe, expect, it } from "vitest";
import type { Order } from "@/types/order";
import { NO_CAMPAIGN, orderMatchesAdCampaign, summarizeAdCampaigns } from "./ad-campaign-filter";

const order = (campaign?: string): Order => ({ attribution: campaign === undefined ? null : { channel: "facebook", campaign } }) as Order;

describe("ad campaign filter", () => {
    it("matches ignoring case and spacing", () => {
        expect(orderMatchesAdCampaign(order("Fusion  Reels "), "fusion reels")).toBe(true);
        expect(orderMatchesAdCampaign(order("Prime"), "fusion")).toBe(false);
        expect(orderMatchesAdCampaign(order("Prime"), undefined)).toBe(true);
    });
    it("NO_CAMPAIGN picks orders without a campaign name", () => {
        expect(orderMatchesAdCampaign(order(), NO_CAMPAIGN)).toBe(true);
        expect(orderMatchesAdCampaign(order("  "), NO_CAMPAIGN)).toBe(true);
        expect(orderMatchesAdCampaign(order("Prime"), NO_CAMPAIGN)).toBe(false);
    });
    it("tally counts equal what each choice opens", () => {
        const book = [order("Fusion"), order("fusion "), order("Prime"), order(), order("")];
        const summary = summarizeAdCampaigns(book);
        expect(summary.total).toBe(5);
        expect(summary.withoutCampaign).toBe(2);
        expect(summary.stats.map((s) => [s.key, s.orders])).toEqual([["fusion", 2], ["prime", 1]]);
        for (const s of summary.stats) expect(book.filter((o) => orderMatchesAdCampaign(o, s.key))).toHaveLength(s.orders);
        expect(book.filter((o) => orderMatchesAdCampaign(o, NO_CAMPAIGN))).toHaveLength(summary.withoutCampaign);
    });
});
