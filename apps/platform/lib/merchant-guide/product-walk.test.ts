import { describe, expect, it } from "vitest";
import { productWalkFilled, productWalkStage } from "./product-walk";

const blank = { name: "", imageUrl: "", price: 0, stock: 0 };

describe("productWalkStage", () => {
    it("starts at the name, and with no draft yet too", () => {
        expect(productWalkStage(null)).toBe(0);
        expect(productWalkStage(blank)).toBe(0);
        expect(productWalkStage({ ...blank, name: "   " })).toBe(0);
    });

    it("moves on by itself as each field fills", () => {
        expect(productWalkStage({ ...blank, name: "Oud" })).toBe(1);
        expect(productWalkStage({ ...blank, name: "Oud", imageUrl: "https://cdn/a.jpg" })).toBe(2);
        expect(productWalkStage({ name: "Oud", imageUrl: "https://cdn/a.jpg", price: 35000, stock: 0 })).toBe(3);
        expect(productWalkStage({ name: "Oud", imageUrl: "https://cdn/a.jpg", price: 35000, stock: 12 })).toBe(4);
    });

    it("goes back to the first gap when a field is cleared", () => {
        expect(productWalkStage({ name: "Oud", imageUrl: "", price: 35000, stock: 12 })).toBe(1);
    });
});

describe("productWalkFilled", () => {
    it("never marks save as filled", () => {
        expect(productWalkFilled({ name: "Oud", imageUrl: "x", price: 1, stock: 1 }).save).toBe(false);
    });
});
