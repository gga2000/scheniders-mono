import { describe, expect, it } from "vitest";
import { calculateProductScore, type ProductScoreInput } from "./product-scoring";

const base: ProductScoreInput = {
    id: "p1",
    price: 30000,
    cost: 10000,
    stock_quantity: 0,
    reserved_quantity: 0,
    low_stock_threshold: 5,
    times_sold: 4,
    total_revenue: 120000,
    created_at: "2026-01-01T00:00:00Z",
    daily_sales_rate: 0,
};

describe("product surplus flag", () => {
    it("never calls an empty shelf a surplus, even with no recent sales", () => {
        expect(calculateProductScore(base).flags.isOverstocked).toBe(false);
    });

    it("never calls an oversold product a surplus", () => {
        expect(calculateProductScore({ ...base, stock_quantity: 0, reserved_quantity: 55 }).flags.isOverstocked).toBe(false);
    });

    it("still flags stock that would last more than 90 days", () => {
        expect(calculateProductScore({ ...base, stock_quantity: 40, daily_sales_rate: 0.2 }).flags.isOverstocked).toBe(true);
        expect(calculateProductScore({ ...base, stock_quantity: 40, daily_sales_rate: 0 }).flags.isOverstocked).toBe(true);
    });
});
