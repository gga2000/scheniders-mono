import { describe, it, expect } from "vitest";
import { calcSuggestedQty, reorderShortfall, urgencyFor, supplyReorderState, supplyTone } from "./supply-reorder";

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

describe("reorderShortfall", () => {
    it("is zero or less once stock on hand plus on order covers the lead time and reorder point", () => {
        // 7 days x 10/day x 1.3 = 91, plus (100 - (50 + 500)) -> negative: covered
        expect(reorderShortfall({ leadTimeDays: 7, dailyRate: 10, reorderPoint: 100, stock: 550 })).toBeLessThanOrEqual(0);
        expect(reorderShortfall({ leadTimeDays: 7, dailyRate: 10, reorderPoint: 100, stock: 50 })).toBe(141);
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

describe("supplyReorderState", () => {
    const base = { stock_quantity: 3, reorder_point: 10, times_sold_30d: 30, suppliers: [{ is_primary: true, lead_time_days: 5 }] };

    it("needs ordering when below the reorder point and nothing is on order", () => {
        const s = supplyReorderState(base, 0);
        expect(s).toMatchObject({ low: true, covered: false, needsOrder: true, leadTimeDays: 5, dailyRate: 1 });
    });

    it("is covered once an open PO lifts stock past the point and through the lead time", () => {
        expect(supplyReorderState(base, 20)).toMatchObject({ low: true, covered: true, needsOrder: false });
    });

    it("still needs ordering when the open PO is too small", () => {
        expect(supplyReorderState(base, 5).needsOrder).toBe(true);
    });

    it("flags a supply above its point that runs out within two lead times", () => {
        const s = supplyReorderState({ ...base, stock_quantity: 16, times_sold_30d: 60 }, 0);
        expect(s).toMatchObject({ belowReorder: false, low: true, needsOrder: true, daysUntilStockout: 8 });
    });

    it("is fine when well stocked with no usage", () => {
        const s = supplyReorderState({ stock_quantity: 50, reorder_point: 10 }, 0);
        expect(s).toMatchObject({ low: false, needsOrder: false, daysUntilStockout: null, leadTimeDays: 7, leadTimeIsDefault: true, moq: 1 });
    });

    it("counts only free stock against the reorder point", () => {
        // 50 on hand, all reserved, no usage: nothing free, so it needs ordering.
        const s = supplyReorderState({ stock_quantity: 50, reserved_quantity: 50, reorder_point: 10 }, 0);
        expect(s).toMatchObject({ belowReorder: true, low: true, needsOrder: true });
        expect(supplyReorderState({ ...base }, 0).leadTimeIsDefault).toBe(false);
    });
});

describe("supplyTone", () => {
    const supplier = [{ is_primary: true, lead_time_days: 5 }];

    it("is critical when it runs out before a new order could land", () => {
        // 3 left at 1/day: 3 days, lead time 5.
        expect(supplyTone({ stock_quantity: 3, reorder_point: 10, times_sold_30d: 30, suppliers: supplier }, 0)).toBe("critical");
    });

    it("is low when it needs ordering but lasts past the lead time", () => {
        // Below its point, but 8 days at 1/day against a 5-day lead time.
        expect(supplyTone({ stock_quantity: 8, reorder_point: 10, times_sold_30d: 30, suppliers: supplier }, 0)).toBe("low");
    });

    it("is ok once an open order covers it, even with little on hand", () => {
        expect(supplyTone({ stock_quantity: 3, reorder_point: 10, times_sold_30d: 30, suppliers: supplier }, 20)).toBe("ok");
    });

    it("is out with nothing on hand and nothing coming", () => {
        expect(supplyTone({ stock_quantity: 0, reorder_point: 10, suppliers: supplier }, 0)).toBe("out");
    });

    it("is out when every unit on hand is reserved", () => {
        expect(supplyTone({ stock_quantity: 5, reserved_quantity: 5, reorder_point: 10, suppliers: supplier }, 0)).toBe("out");
    });

    it("is ok when well stocked", () => {
        expect(supplyTone({ stock_quantity: 50, reorder_point: 10, times_sold_30d: 30, suppliers: supplier }, 0)).toBe("ok");
    });
});
