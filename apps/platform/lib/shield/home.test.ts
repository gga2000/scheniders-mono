import { describe, expect, it } from "vitest";
import { ownDeliveryRate, storeScoreSchema, riskyOpenOrderSchema, riskyOrderBand, shieldImpactSchema, shippedRefusedRate } from "./home";

describe("shield home", () => {
    it("red under 50, otherwise yellow", () => {
        expect(riskyOrderBand({ trust: 40 })).toBe("red");
        expect(riskyOrderBand({ trust: 49 })).toBe("red");
        expect(riskyOrderBand({ trust: 50 })).toBe("yellow");
        expect(riskyOrderBand({ trust: 75 })).toBe("yellow");
    });

    it("refused rate counts only shipped orders that ended", () => {
        const impact = shieldImpactSchema.parse({ flagged_decided: 10, stopped: 4, stopped_value: "120000", shipped: 6, shipped_delivered: 3, shipped_refused: 1 });
        expect(impact.stopped_value).toBe(120000);
        expect(shippedRefusedRate(impact)).toBe(25);
        expect(shippedRefusedRate({ ...impact, shipped_delivered: 0, shipped_refused: 0 })).toBeNull();
    });

    it("rejects an unknown step kind", () => {
        expect(() => riskyOpenOrderSchema.parse({ id: "a", order_id: "1", customer_name: null, status: "new", created_at: "", trust: 60, worst_kind: "late", worst_src: "own" })).toThrow();
    });

    it("own delivery rate needs 10 finished orders; network stays null below 3 stores", () => {
        const score = storeScoreSchema.parse({ own_finished: 213, own_delivered: 160, network_rate: null, network_stores: null });
        expect(ownDeliveryRate(score)).toBe(75);
        expect(score.network_rate).toBeNull();
        expect(ownDeliveryRate({ ...score, own_finished: 9, own_delivered: 9 })).toBeNull();
    });
});
