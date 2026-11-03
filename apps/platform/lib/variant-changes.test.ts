import { describe, it, expect } from "vitest";
import type { VariantFormData } from "@/hooks/use-product-editor";
import { variantChanges } from "./variant-changes";

const loaded: VariantFormData = {
    id: "v1",
    name: "50 ml",
    price: 30000,
    cost: 12000,
    stock_quantity: 4,
    sku: "ENV-50",
    option_values: { size: "50 ml" },
    image_url: "a.jpg",
    is_enabled: true,
};

describe("variantChanges", () => {
    it("sends nothing when the editor changed nothing, so a price set elsewhere is not undone", () => {
        expect(variantChanges(loaded, { ...loaded, option_values: { size: "50 ml" } }, true)).toEqual({});
    });

    it("saves a SKU trimmed and ignores spaces-only edits", () => {
        expect(variantChanges(loaded, { ...loaded, sku: " ENV-50 " }, true)).toEqual({});
        expect(variantChanges(loaded, { ...loaded, sku: " ENV-100 " }, true)).toEqual({ sku: "ENV-100" });
    });

    it("sends only the changed fields", () => {
        expect(variantChanges(loaded, { ...loaded, name: "50ml", stock_quantity: 9 }, true)).toEqual({ name: "50ml" });
    });

    it("never sends cost for someone who cannot see it", () => {
        expect(variantChanges(loaded, { ...loaded, cost: 0, price: 32000 }, false)).toEqual({ price: 32000 });
        expect(variantChanges(loaded, { ...loaded, cost: 13000 }, true)).toEqual({ cost: 13000 });
    });

    it("sends every field when the loaded copy is missing", () => {
        expect(Object.keys(variantChanges(undefined, loaded, false)).sort()).toEqual(
            ["image_url", "is_enabled", "name", "option_values", "price", "sku"],
        );
    });
});
