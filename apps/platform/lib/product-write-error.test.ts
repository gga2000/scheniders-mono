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
