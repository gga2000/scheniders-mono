import { describe, expect, it } from "vitest";
import { summaryCsvTable } from "./summary-export";
import type { FinanceSummary } from "./summary";

const summary: FinanceSummary = {
    from: "2026-11-01",
    to: "2026-11-02",
    sales: { orders: 2, revenue: 80_000, units: 2, product_cost: 30_000, missing_cost_units: 0 },
    refunds: { count: 0, amount: 0 },
    expenses: [{ category: "marketing", amount: 10_000 }],
    salaries_paid: 0,
    courier: { prime_fee: 5_000, prime_parcels: 1 },
    cash: {
        in_transit: { count: 0, amount: 0 },
        stuck: { count: 0, amount: 0 },
        prime_linked: true,
        prime_held: { parcels: 0, collected: 0, fee: 0 },
    },
    failed: { refused_orders: 0, refused_value: 0, prime_returned_parcels: 0, prime_returned_fee: 0 },
    daily: [
        { day: "2026-11-01", orders: 2, revenue: 80_000, product_cost: 30_000, courier: 5_000, refunds: 0, expenses: 10_000, salaries: 0 },
        { day: "2026-11-02", orders: 0, revenue: 0, product_cost: 0, courier: 0, refunds: 0, expenses: 0, salaries: 0 },
    ],
    products: [{ key: "p1", name: "", units: 2, revenue: 80_000, cost: 30_000, missing_units: 0 }],
};

describe("summaryCsvTable", () => {
    const { headers, rows } = summaryCsvTable(summary, (key) => key);

    it("heads the file with the period", () => {
        expect(headers).toEqual(["fin.statement.title", "2026-11-01 / 2026-11-02"]);
    });

    it("writes the statement with costs as negatives, ending on the net profit", () => {
        expect(rows.slice(0, 8)).toEqual([
            ["fin.line.sales", 80_000],
            ["fin.line.product_cost", -30_000],
            ["fin.line.ads", -10_000],
            ["fin.line.delivery", -5_000],
            ["fin.line.refunds", 0],
            ["fin.line.other", 0],
            ["fin.line.salaries", 0],
            ["fin.line.net", 35_000],
        ]);
    });

    it("lists each day with its profit, then each product, naming a product that has no name", () => {
        expect(rows).toContainEqual(["2026-11-01", 2, 80_000, 35_000]);
        expect(rows).toContainEqual(["2026-11-02", 0, 0, 0]);
        expect(rows.at(-1)).toEqual(["fin.products.unnamed", 2, 80_000, 30_000, 50_000]);
    });
});
