import { describe, expect, it } from "vitest";
import { DEFAULT_FORM_DATA } from "./use-product-editor";

describe("a new product's starting form (Fermi B11)", () => {
    it("starts Active and shown on the store, so the first product a merchant saves can sell", () => {
        expect(DEFAULT_FORM_DATA.status).toBe("active");
        expect(DEFAULT_FORM_DATA.is_visible).toBe(true);
    });

    it("starts with no stock typed, so the field shows its 0 placeholder instead of a leading zero", () => {
        expect(DEFAULT_FORM_DATA.stock_quantity).toBe(0);
    });
});
