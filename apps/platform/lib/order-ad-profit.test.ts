import { describe, expect, it } from "vitest";
import { adProfitLines, campaignAdCostPerOrder, showsAdProfit } from "./order-ad-profit";

describe("order ad profit", () => {
    it("averages a campaign's spend over its orders", () => {
        expect(campaignAdCostPerOrder({ spendIqd: 662_400, orders: 96 })).toBe(6900);
        expect(campaignAdCostPerOrder({ spendIqd: 5000, orders: 0 })).toBeNull();
    });
    it("takes ad cost off the order's own profit", () => {
        expect(adProfitLines({ revenue: 44_750, productCost: 17_400, totalCost: 22_920 }, 6900)).toEqual({
            revenue: 44_750, productCost: 17_400, otherCosts: 5520, adCost: 6900, profitAfterAds: 14_930,
        });
    });
    it("shows only for live sales, not returns, replacements or dead orders", () => {
        expect(showsAdProfit({ status: "delivered" })).toBe(true);
        expect(showsAdProfit({ status: "confirmed", is_return: true })).toBe(false);
        expect(showsAdProfit({ status: "confirmed", is_replacement: true })).toBe(false);
        expect(showsAdProfit({ status: "rejected" })).toBe(false);
    });
});
