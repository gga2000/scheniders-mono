import { describe, expect, it } from "vitest";
import { productWriteErrorKey } from "./product-write-error";

describe("productWriteErrorKey", () => {
    it("maps the stock-floor refusal to the below-zero message", () => {
        expect(productWriteErrorKey({ code: "22023", message: "stock cannot go below zero" }))
            .toBe("products.stockAdjust.belowZero");
    });

    it("names a unique violation instead of asking for a retry", () => {
        expect(productWriteErrorKey({ code: "23505", message: "duplicate key value violates unique constraint" }))
            .toBe("products.errors.duplicate");
    });

    it("reports a refused write as not permitted", () => {
        expect(productWriteErrorKey({ code: "42501" })).toBe("products.errors.notPermitted");
    });

    it("reports a record still in use elsewhere", () => {
        expect(productWriteErrorKey({ code: "23503" })).toBe("products.errors.inUse");
    });

    it("names the recipe rule a supply change broke", () => {
        expect(productWriteErrorKey({ code: "23503", message: "supply 1 is used in recipes" })).toBe("products.errors.supplyInRecipe");
        expect(productWriteErrorKey({ code: "23514", message: "recipe supply 1 is not a supply" })).toBe("products.errors.recipeNotSupply");
        expect(productWriteErrorKey({ code: "23505", message: "recipe lists the same supply twice" })).toBe("products.errors.recipeDuplicate");
        expect(productWriteErrorKey({ code: "23505", message: "duplicate key value violates unique constraint \"bom_items_product_id_supply_id_unit_key\"" })).toBe("products.errors.recipeDuplicate");
        expect(productWriteErrorKey({ code: "23505", message: "duplicate key value violates unique constraint \"idx_products_tenant_sku\"" })).toBe("products.errors.duplicate");
    });

    it("reports a paused store", () => {
        expect(productWriteErrorKey({ message: "tenant is paused" })).toBe("products.errors.storePaused");
    });

    it("tells the merchant a later price edit blocked the undo", () => {
        expect(productWriteErrorKey({ code: "40001" })).toBe("products.priceChangedSinceUndo");
    });

    it("falls back to a retryable save failure", () => {
        expect(productWriteErrorKey(new Error("fetch failed"))).toBe("products.errors.saveFailed");
    });
});
