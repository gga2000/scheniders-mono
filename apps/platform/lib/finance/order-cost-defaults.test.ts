import { describe, expect, it } from "vitest";
import { NO_ORDER_COSTS, parseOrderCostDefaults } from "./order-cost-defaults";

describe("parseOrderCostDefaults", () => {
    it("is zero for a store that has set nothing", () => {
        expect(parseOrderCostDefaults({})).toEqual(NO_ORDER_COSTS);
        expect(parseOrderCostDefaults(null)).toEqual(NO_ORDER_COSTS);
        expect(NO_ORDER_COSTS).toEqual({ delivery: 0, sweets: 0, packaging_per_bag: 0, vial: 0, sample_share: 0 });
    });

    it("reads the store's own amounts and zero-fills the rest", () => {
        expect(parseOrderCostDefaults({ order_costs: { delivery: 4000, vial: 25 } }))
            .toEqual({ delivery: 4000, sweets: 0, packaging_per_bag: 0, vial: 25, sample_share: 0 });
    });

    it("ignores malformed values instead of guessing", () => {
        expect(parseOrderCostDefaults({ order_costs: { delivery: -5 } })).toEqual(NO_ORDER_COSTS);
        expect(parseOrderCostDefaults({ order_costs: "5000" })).toEqual(NO_ORDER_COSTS);
    });
});
