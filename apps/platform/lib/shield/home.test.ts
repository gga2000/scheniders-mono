import { describe, expect, it } from "vitest";
import { ownDeliveryRate, storeScoreSchema, riskyOpenOrderSchema, riskyOrderBand, riskyOrderReason, shieldImpactSchema, shippedRefusedRate } from "./home";

describe("shield home", () => {
    it("red when other stores say red or this store rates the customer risky", () => {
        expect(riskyOrderBand({ own_tier: null, network_band: "red" })).toBe("red");
        expect(riskyOrderBand({ own_tier: "critical", network_band: "none" })).toBe("red");
        expect(riskyOrderBand({ own_tier: "risky", network_band: "none" })).toBe("red");
        expect(riskyOrderBand({ own_tier: "watch", network_band: "none" })).toBe("yellow");
        expect(riskyOrderBand({ own_tier: null, network_band: "yellow" })).toBe("yellow");
    });

    it("other stores' red record is the reason shown first", () => {
        expect(riskyOrderReason({ own_tier: "critical", network_band: "red" })).toBe("networkRed");
        expect(riskyOrderReason({ own_tier: "risky", network_band: "yellow" })).toBe("ownBad");
        expect(riskyOrderReason({ own_tier: null, network_band: "yellow" })).toBe("networkYellow");
        expect(riskyOrderReason({ own_tier: "watch", network_band: "none" })).toBe("ownMixed");
    });

    it("refused rate counts only shipped orders that ended", () => {
        const impact = shieldImpactSchema.parse({ flagged_decided: 10, stopped: 4, stopped_value: "120000", shipped: 6, shipped_delivered: 3, shipped_refused: 1 });
        expect(impact.stopped_value).toBe(120000);
        expect(shippedRefusedRate(impact)).toBe(25);
        expect(shippedRefusedRate({ ...impact, shipped_delivered: 0, shipped_refused: 0 })).toBeNull();
    });

    it("rejects an unknown network band", () => {
        expect(() => riskyOpenOrderSchema.parse({ id: "a", order_id: "1", customer_name: null, status: "new", created_at: "", own_tier: null, network_band: "blue" })).toThrow();
    });

    it("own delivery rate needs 10 finished orders; network stays null below 3 stores", () => {
        const score = storeScoreSchema.parse({ own_finished: 213, own_delivered: 160, network_rate: null, network_stores: null });
        expect(ownDeliveryRate(score)).toBe(75);
        expect(score.network_rate).toBeNull();
        expect(ownDeliveryRate({ ...score, own_finished: 9, own_delivered: 9 })).toBeNull();
    });
});
