import { describe, expect, it } from "vitest";
import type { TillProduct } from "./cart";
import { labelLines, labelSheetHtml } from "./labels";

const sized: TillProduct = {
    id: "p1",
    name: "Envoy",
    price: 45_000,
    image_url: null,
    tag_color: null,
    barcode: "999",
    sku: null,
    available: 18,
    on_hand: 21,
    low_at: 5,
    variants: [
        { id: "v30", name: "30 ml", price: 10_000, barcode: " ", sku: null, available: 4, on_hand: 5 },
        { id: "v100", name: "100 ml", price: 45_000, barcode: "111100", sku: null, available: 14, on_hand: 16 },
    ],
};

describe("labelLines", () => {
    it("gives each size its own price and code, treating a blank code as none", () => {
        expect(labelLines([sized]).map((l) => [l.key, l.price, l.barcode, l.on_hand])).toEqual([
            ["p1:v30", 10_000, null, 5],
            ["p1:v100", 45_000, "111100", 16],
        ]);
    });
});

describe("labelSheetHtml", () => {
    it("prints one label per copy and escapes names", () => {
        const html = labelSheetHtml("Schenider", [
            { name: "<b>Envoy</b>", variant_name: "100 ml", price: 45_000, barcode: "259948125372", copies: 3 },
            { name: "Bag", variant_name: null, price: 2_000, barcode: "222", copies: 0 },
        ]);
        expect(html.match(/<section class="label">/g)).toHaveLength(3);
        expect(html).toContain("&lt;b&gt;Envoy&lt;/b&gt; 100 ml");
        expect(html).not.toContain("Bag");
        expect(html).toContain("size: 50mm 30mm");
    });
});
