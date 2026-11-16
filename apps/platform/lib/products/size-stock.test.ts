import { describe, expect, it } from "vitest";
import type { Product, ProductVariant } from "@/types/product";
import { getAvailableStock, getStockStatus } from "@/types/product";
import { withSizeStock } from "./size-stock";

const product = (variants: Partial<ProductVariant>[] = []): Product =>
    ({
        id: "p1",
        name: "قميص",
        price: 20000,
        stock_quantity: 0,
        reserved_quantity: 0,
        open_box_quantity: 0,
        low_stock_threshold: 5,
        variants: variants.map((v, i) => ({ id: `v${i}`, product_id: "p1", name: `S${i}`, stock_quantity: 0, ...v })),
    }) as Product;

describe("withSizeStock (B10)", () => {
    it("a shirt with stock only on its sizes is in stock, not sold out", () => {
        const shirt = withSizeStock(
            product([
                { stock_quantity: 12, reserved_quantity: 2, open_box_quantity: 1 },
                { stock_quantity: 3, reserved_quantity: 1 },
                { stock_quantity: 40, reserved_quantity: 0, is_enabled: false },
            ]),
        );
        expect(shirt).toMatchObject({ stock_quantity: 15, reserved_quantity: 3, open_box_quantity: 1, stock_by_size: true });
        expect(getAvailableStock(shirt)).toBe(12);
        expect(getStockStatus(shirt)).toBe("in_stock");
    });

    it("an oversold size keeps its minus in the total", () => {
        const shirt = withSizeStock(product([{ stock_quantity: 1, reserved_quantity: 4 }]));
        expect(getAvailableStock(shirt)).toBe(-3);
    });

    it("a product without sizes is left exactly as it was", () => {
        const plain = { ...product(), stock_quantity: 9 };
        expect(withSizeStock(plain)).toBe(plain);
        const allOff = product([{ stock_quantity: 5, is_enabled: false }]);
        expect(withSizeStock(allOff)).toBe(allOff);
    });
});
