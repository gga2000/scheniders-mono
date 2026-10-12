import { describe, expect, it } from "vitest";
import { buildRiskData, normalizePhoneLikeDb, type TrustRow } from "./customer-trust-risk";

describe("normalizePhoneLikeDb (port of SQL normalize_phone)", () => {
    it.each([
        ["07701234567", "7701234567"],
        ["+964 770 123 4567", "7701234567"],
        ["9647701234567", "7701234567"],
        ["7701234567", "7701234567"],
        ["٠٧٧٠١٢٣٤٥٦٧", "7701234567"],
        ["۰۷۷۰۱۲۳۴۵۶۷", "7701234567"],
        // SQL strips one 964 then one 0 — and NOT a leading 00.
        ["009647701234567", "09647701234567"],
        ["", ""],
        [null, ""],
        [undefined, ""],
    ])("%s -> %s", (input, expected) => {
        expect(normalizePhoneLikeDb(input)).toBe(expected);
    });
});

describe("buildRiskData (mirror of v_orders_with_risk.risk_data)", () => {
    it("reproduces the view's object for a customer with no trust row", () => {
        // Captured from the live view on 2026-10-12.
        expect(buildRiskData(undefined)).toEqual({
            tier: null,
            level: "low",
            score: null,
            reasons: [],
            isBlacklisted: false,
            historicalData: {
                refundCount: null,
                totalOrders: null,
                rejectedCount: null,
                cancelledCount: null,
                deliveredCount: null,
                noResponseCount: null,
                cancelledCustomerCount: null,
                cancelledMerchantCount: null,
                rejectedAmbiguousCount: null,
                rejectedCustomerFaultCount: null,
                rejectedMerchantFaultCount: null,
            },
            communityAvgRating: null,
            deliverySuccessRate: null,
            communityRatingCount: null,
        });
    });

    const row = (over: Partial<TrustRow>): TrustRow => ({
        tenant_id: "t",
        phone: "7701234567",
        trust_score: 40,
        trust_tier: "risky",
        delivery_success_rate: 0.5,
        community_avg_rating: 3.5,
        community_rating_count: 2,
        total_orders: 6,
        delivered_count: 3,
        cancelled_customer_count: 1,
        cancelled_merchant_count: 0,
        rejected_customer_fault_count: 2,
        rejected_merchant_fault_count: 0,
        rejected_ambiguous_count: 0,
        no_response_count: 1,
        refund_count: 1,
        ...over,
    });

    it.each([
        ["risky", "high"],
        ["watch", "medium"],
        ["good", "low"],
        [null, "low"],
    ])("tier %s -> level %s", (tier, level) => {
        expect(buildRiskData(row({ trust_tier: tier })).level).toBe(level);
    });

    it("maps the aliased counters the way the view does", () => {
        const r = buildRiskData(row({}));
        expect(r.historicalData.rejectedCount).toBe(2);
        expect(r.historicalData.cancelledCount).toBe(1);
        expect(r.historicalData.refundCount).toBe(1);
        expect(r.score).toBe(40);
        expect(r.tier).toBe("risky");
    });
});
