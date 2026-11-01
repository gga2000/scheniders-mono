import { describe, expect, it } from "vitest";
import { parseStorefrontStock } from "./storefront-stock";

describe("parseStorefrontStock", () => {
    it("treats an empty field as 'follow real stock'", () => {
        expect(parseStorefrontStock("")).toBeNull();
        expect(parseStorefrontStock("   ")).toBeNull();
    });

    it("keeps zero, which shows the product out of stock on the store", () => {
        expect(parseStorefrontStock("0")).toBe(0);
    });

    it("reads a whole number", () => {
        expect(parseStorefrontStock("17")).toBe(17);
    });

    it("never stores a negative count", () => {
        expect(parseStorefrontStock("-4")).toBe(0);
    });

    it("ignores text that is not a number", () => {
        expect(parseStorefrontStock("abc")).toBeNull();
    });
});
