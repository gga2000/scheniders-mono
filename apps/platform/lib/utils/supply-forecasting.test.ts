import { describe, expect, it } from "vitest";
import { isUsageMovement, splitOutMovements } from "./supply-forecasting";

const at = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000).toISOString();

describe("isUsageMovement", () => {
    it("counts stock going down for use, not corrections", () => {
        expect(isUsageMovement({ change_type: "supply_used", quantity_change: -2, created_at: at(1) })).toBe(true);
        expect(isUsageMovement({ change_type: "damaged", quantity_change: -1, created_at: at(1) })).toBe(true);
        expect(isUsageMovement({ change_type: "adjusted", quantity_change: -40, created_at: at(1) })).toBe(false);
        expect(isUsageMovement({ change_type: "count", quantity_change: -5, created_at: at(1) })).toBe(false);
        expect(isUsageMovement({ change_type: "received", quantity_change: 10, created_at: at(1) })).toBe(false);
    });

    it("leaves a manual correction out of the feed's usage", () => {
        const split = splitOutMovements([
            { change_type: "supply_used", quantity_change: -3, created_at: at(2) },
            { change_type: "adjusted", quantity_change: -40, created_at: at(2) },
        ]);
        expect(split.last7dOut).toBe(3);
    });
});
