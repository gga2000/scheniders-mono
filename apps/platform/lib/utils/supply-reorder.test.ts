import { describe, it, expect } from "vitest";
import { calcSuggestedQty, urgencyFor } from "./supply-reorder";

describe("calcSuggestedQty", () => {
    it("covers lead time with a 1.3 safety factor plus the gap to the reorder point", () => {
        // 10 days x 2/day x 1.3 = 26, plus (20 - 5) = 15 -> 41
        expect(calcSuggestedQty({ leadTimeDays: 10, dailyRate: 2, reorderPoint: 20, stock: 5, moq: 1 })).toBe(41);
    });

    it("never orders below the minimum order quantity", () => {
        expect(calcSuggestedQty({ leadTimeDays: 1, dailyRate: 0, reorderPoint: 5, stock: 5, moq: 25 })).toBe(25);
    });

    it("rounds up to a whole multiple of the MOQ", () => {
        expect(calcSuggestedQty({ leadTimeDays: 10, dailyRate: 2, reorderPoint: 20, stock: 5, moq: 12 })).toBe(48);
    });

    it("still returns at least the MOQ when stock is already above the reorder point", () => {
        expect(calcSuggestedQty({ leadTimeDays: 5, dailyRate: 0, reorderPoint: 10, stock: 100, moq: 6 })).toBe(6);
    });
});

describe("urgencyFor", () => {
    it("is critical when stock runs out within the lead time", () => {
        expect(urgencyFor(5, 7)).toBe("critical");
        expect(urgencyFor(7, 7)).toBe("critical");
    });
    it("is a warning within twice the lead time", () => {
        expect(urgencyFor(10, 7)).toBe("warning");
    });
    it("is ok beyond that, and when there is no consumption", () => {
        expect(urgencyFor(30, 7)).toBe("ok");
        expect(urgencyFor(null, 7)).toBe("ok");
    });
});
