import { describe, it, expect } from "vitest";
import { foldUnitsSold, linesFromOrderItems, sortByRecentSales } from "./product-recent-sales";

const products = [
    { id: "p1", name: "Blue", sku: "SKU-1" },
    { id: "p2", name: "Wafer", sku: null },
    { id: "p3", name: "Oud" },
    { id: "p4", name: "Dates" },
];

describe("linesFromOrderItems", () => {
    it("flattens items arrays and skips non-arrays / malformed lines", () => {
        const lines = linesFromOrderItems([
            { items: [{ product_id: "p1", quantity: 2, name: "Blue" }, { quantity: "3", name: "Oud" }] },
            { items: null },
            { items: [{ quantity: { bad: true } }] },
        ]);
        expect(lines).toEqual([
            { product_id: "p1", quantity: 2, name: "Blue" },
            { quantity: 3, name: "Oud" },
        ]);
    });
});

describe("foldUnitsSold", () => {
    it("sums units by product_id, falling back to sku then name", () => {
        const units = foldUnitsSold(
            [
                { product_id: "p1", quantity: 2 },
                { product_id: "gone", sku: "sku-1 ", quantity: 1 },
                { name: " wafer", quantity: 4 },
                { product_id: "p3", quantity: 0 },
                { name: "unknown", quantity: 9 },
            ],
            products,
        );
        expect(Object.fromEntries(units)).toEqual({ p1: 3, p2: 4 });
    });
});

describe("sortByRecentSales", () => {
    it("puts top sellers first by units, then the rest in original order", () => {
        const units = new Map([["p3", 5], ["p2", 1]]);
        expect(sortByRecentSales(products, units).map((p) => p.id)).toEqual(["p3", "p2", "p1", "p4"]);
    });

    it("is stable for ties and leaves the list untouched with no sales", () => {
        expect(sortByRecentSales(products, new Map([["p4", 2], ["p2", 2]])).map((p) => p.id)).toEqual(["p2", "p4", "p1", "p3"]);
        expect(sortByRecentSales(products, new Map()).map((p) => p.id)).toEqual(["p1", "p2", "p3", "p4"]);
    });
});
