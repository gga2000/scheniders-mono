import { describe, expect, it } from "vitest";
import { matchProductReply, type CatalogProduct } from "./telegram-product-match";

const plain = (id: string, name: string, price: number): CatalogProduct => ({
    id,
    name,
    price,
    product_name: name,
    variant_id: null,
    variant_name: null,
});

const size = (variantId: string, variantName: string, price: number): CatalogProduct => ({
    id: "shirt",
    name: `قميص (${variantName})`,
    price,
    product_name: "قميص",
    variant_id: variantId,
    variant_name: variantName,
});

const catalog: CatalogProduct[] = [
    plain("wafer", "ويفر", 3000),
    size("v-m-white", "M / أبيض", 20000),
    size("v-xl-white", "XL / أبيض", 22000),
    size("v-xl-black", "XL / أسود", 22000),
];

describe("matchProductReply", () => {
    it("picks the exact size by its number in the list", () => {
        const match = matchProductReply("3 x 2", catalog);
        expect(match?.product.variant_id).toBe("v-xl-white");
        expect(match?.product.product_name).toBe("قميص");
        expect(match?.quantity).toBe(2);
    });

    it("picks a size when the words name only one", () => {
        expect(matchProductReply("قميص xl أسود", catalog)?.product.variant_id).toBe("v-xl-black");
        expect(matchProductReply("قميص M", catalog)?.product.variant_id).toBe("v-m-white");
    });

    it("never guesses a size when the name fits several", () => {
        expect(matchProductReply("قميص", catalog)).toBeNull();
        expect(matchProductReply("قميص XL", catalog)).toBeNull();
    });

    it("still matches a product without sizes by name", () => {
        const match = matchProductReply("ويفر 2", catalog);
        expect(match?.product.id).toBe("wafer");
        expect(match?.product.variant_id).toBeNull();
        expect(match?.quantity).toBe(2);
    });
});
