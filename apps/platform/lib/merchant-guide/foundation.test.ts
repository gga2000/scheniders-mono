import { describe, expect, it } from "vitest";
import { IRAQ_GOVERNORATES, type StoreConfigV2 } from "@scheniders/shared";
import {
    foundationDoneCount,
    foundationStatus,
    hasDeliveryPrices,
    hasShopDetails,
    nextFoundationStep,
} from "./foundation";

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

const complete = config({ name: "Perfume House", logo: "https://cdn/logo.png", shipping: { default_rate: { fee_iqd: 5000 } } });

describe("hasShopDetails", () => {
    it("needs both a name and a logo", () => {
        expect(hasShopDetails(config({ name: "Shop" }))).toBe(false);
        expect(hasShopDetails(config({ logo: "https://cdn/l.png" }))).toBe(false);
        expect(hasShopDetails(config({ name: "  ", logo: "https://cdn/l.png" }))).toBe(false);
        expect(hasShopDetails(config({ name: "Shop", logo: "https://cdn/l.png" }))).toBe(true);
        expect(hasShopDetails(null)).toBe(false);
    });
});

describe("hasDeliveryPrices", () => {
    it("is false with nothing set, since checkout would fall back to the platform fee", () => {
        expect(hasDeliveryPrices(config({}))).toBe(false);
        expect(hasDeliveryPrices(config({ shipping: {} }))).toBe(false);
    });

    it("is true for free delivery, one price for all, and a default plus overrides", () => {
        expect(hasDeliveryPrices(config({ shipping: { default_rate: { fee_iqd: 0 } } }))).toBe(true);
        expect(hasDeliveryPrices(config({ shipping: { default_rate: { fee_iqd: 5000 } } }))).toBe(true);
        expect(
            hasDeliveryPrices(config({ shipping: { default_rate: { fee_iqd: 5000 }, rates: { BG: { fee_iqd: 3000 } } } })),
        ).toBe(true);
    });

    it("per-governorate prices with no default count only when every governorate has one", () => {
        const first = IRAQ_GOVERNORATES[0].code;
        expect(hasDeliveryPrices(config({ shipping: { rates: { [first]: { fee_iqd: 4000 } } } }))).toBe(false);
        const all = Object.fromEntries(IRAQ_GOVERNORATES.map((g) => [g.code, { fee_iqd: 6000 }]));
        expect(hasDeliveryPrices(config({ shipping: { rates: all } }))).toBe(true);
    });
});

describe("foundationStatus", () => {
    it("an empty new shop has every step to do, starting with the shop details", () => {
        const status = foundationStatus({ working: null, published: null, readyProducts: 0 });
        expect(status).toEqual({ shop: false, product: false, delivery: false, open: false });
        expect(nextFoundationStep(status)).toBe("shop");
        expect(foundationDoneCount(status)).toBe(0);
    });

    it("reads shop details and delivery from the draft, but opening from what is live", () => {
        const status = foundationStatus({ working: complete, published: null, readyProducts: 1 });
        expect(status).toEqual({ shop: true, product: true, delivery: true, open: false });
        expect(nextFoundationStep(status)).toBe("open");
    });

    it("a published store without delivery prices is not open yet", () => {
        const live = config({ name: "Perfume House", logo: "https://cdn/logo.png" });
        expect(foundationStatus({ working: complete, published: live, readyProducts: 1 }).open).toBe(false);
    });

    it("is finished when all four are true", () => {
        const status = foundationStatus({ working: complete, published: complete, readyProducts: 3 });
        expect(nextFoundationStep(status)).toBeNull();
        expect(foundationDoneCount(status)).toBe(4);
    });

    it("skips done steps: a shop with a product but no name still starts at the shop details", () => {
        const status = foundationStatus({ working: config({}), published: null, readyProducts: 2 });
        expect(nextFoundationStep(status)).toBe("shop");
        expect(foundationDoneCount(status)).toBe(1);
    });
});
