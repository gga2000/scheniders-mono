import { describe, expect, it } from "vitest";
import { orderItemLabel } from "./item-label";

describe("orderItemLabel", () => {
    it("names the size or colour after the product", () => {
        expect(orderItemLabel({ name: "قميص", variant_name: "XL / أبيض" })).toBe("قميص (XL / أبيض)");
    });

    it("is the product alone when the line has no size, or only spaces", () => {
        expect(orderItemLabel({ name: "عطر" })).toBe("عطر");
        expect(orderItemLabel({ name: "عطر", variant_name: null })).toBe("عطر");
        expect(orderItemLabel({ name: "عطر", variant_name: "  " })).toBe("عطر");
    });
});
