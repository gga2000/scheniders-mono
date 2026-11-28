import { describe, expect, it } from "vitest";
import type { StoreConfigV2 } from "@scheniders/shared";
import { foundationDoneCount, foundationStatus, hasShopDetails, nextFoundationStep } from "./foundation";

function config(parts: {
    name?: string;
    logo?: string;
    shipping?: NonNullable<StoreConfigV2["commerce"]>["shipping"];
}): StoreConfigV2 {
    return {
        brand_kit: { identity: { name: parts.name, logo_url: parts.logo } },
        commerce: parts.shipping ? { shipping: parts.shipping } : undefined,
    } as unknown as StoreConfigV2;
}

const complete = config({ name: "Perfume House", logo: "https://cdn/logo.png" });

describe("hasShopDetails", () => {
    it("needs both a name and a logo", () => {
        expect(hasShopDetails(config({ name: "Shop" }))).toBe(false);
        expect(hasShopDetails(config({ logo: "https://cdn/l.png" }))).toBe(false);
        expect(hasShopDetails(config({ name: "  ", logo: "https://cdn/l.png" }))).toBe(false);
        expect(hasShopDetails(config({ name: "Shop", logo: "https://cdn/l.png" }))).toBe(true);
        expect(hasShopDetails(null)).toBe(false);
    });
});

describe("foundationStatus", () => {
    it("an empty new shop has every step to do, starting with the shop details", () => {
        const status = foundationStatus({ working: null, published: null, readyProducts: 0 });
        expect(status).toEqual({ shop: false, product: false, open: false });
        expect(nextFoundationStep(status)).toBe("shop");
        expect(foundationDoneCount(status)).toBe(0);
    });

    it("reads shop details from the draft, but opening from what is live", () => {
        const status = foundationStatus({ working: complete, published: null, readyProducts: 1 });
        expect(status).toEqual({ shop: true, product: true, open: false });
        expect(nextFoundationStep(status)).toBe("open");
    });

    it("a published store without its logo live is not open yet", () => {
        const live = config({ name: "Perfume House" });
        expect(foundationStatus({ working: complete, published: live, readyProducts: 1 }).open).toBe(false);
    });

    it("doesn't wait on delivery prices: checkout charges the default fee until they are set (Ali, 28 Nov)", () => {
        const status = foundationStatus({ working: complete, published: complete, readyProducts: 3 });
        expect(complete.commerce).toBeUndefined();
        expect(nextFoundationStep(status)).toBeNull();
        expect(foundationDoneCount(status)).toBe(3);
    });

    it("skips done steps: a shop with a product but no name still starts at the shop details", () => {
        const status = foundationStatus({ working: config({}), published: null, readyProducts: 2 });
        expect(nextFoundationStep(status)).toBe("shop");
        expect(foundationDoneCount(status)).toBe(1);
    });

    it("a logo put off for later comes after the product, before opening", () => {
        const none = { shop: false, product: false, open: false };
        expect(nextFoundationStep(none, true)).toBe("product");
        expect(nextFoundationStep({ ...none, product: true }, true)).toBe("shop");
        expect(nextFoundationStep({ shop: true, product: true, open: false }, true)).toBe("open");
    });
});
