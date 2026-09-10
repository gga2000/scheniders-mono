// W7.5 — structured data. The rule these tests exist to hold: a rich result
// may only ever repeat something the store actually says. A missing
// recommended field is a Search Console warning; a wrong one is a lie in a
// search result, so every builder omits rather than invents.
import { describe, expect, it } from "vitest";
import type { PageConfig } from "@scheniders/shared";
import {
    faqItemsFromPage,
    faqPageJsonLd,
    itemListJsonLd,
    productJsonLd,
    returnPolicyJsonLd,
    shippingDetailsJsonLd,
} from "./seo";

const base = { name: "عطر", url: "https://x.iq/products/p", price: 25000, inStock: true, brand: "متجر" };

describe("productJsonLd", () => {
    it("names the seller and the sku, and prices in IQD with no tax", () => {
        const ld = productJsonLd({ ...base, sku: "SKU-1" }) as Record<string, never>;
        const offer = ld.offers as unknown as Record<string, unknown>;
        expect(ld.sku).toBe("SKU-1");
        expect(offer.priceCurrency).toBe("IQD");
        expect(offer.seller).toEqual({ "@type": "Organization", name: "متجر" });
        expect(offer.availability).toBe("https://schema.org/InStock");
    });

    it("emits no rating until real reviews exist", () => {
        expect(productJsonLd(base).aggregateRating).toBeUndefined();
        expect(productJsonLd({ ...base, ratingCount: 0, ratingAverage: 5 }).aggregateRating).toBeUndefined();
        const rated = productJsonLd({ ...base, ratingCount: 3, ratingAverage: 4.666 });
        expect(rated.aggregateRating).toEqual({ "@type": "AggregateRating", ratingValue: 4.67, reviewCount: 3 });
    });

    it("never claims a condition or a price expiry it cannot know", () => {
        const offer = productJsonLd(base).offers as Record<string, unknown>;
        expect(offer.itemCondition).toBeUndefined();
        expect(offer.priceValidUntil).toBeUndefined();
    });

    it("omits shipping and returns when the merchant configured neither", () => {
        const offer = productJsonLd(base).offers as Record<string, unknown>;
        expect(offer.shippingDetails).toBeUndefined();
        expect(offer.hasMerchantReturnPolicy).toBeUndefined();
    });
});

describe("shippingDetailsJsonLd", () => {
    it("states one rate when the fee is the same everywhere", () => {
        const d = shippingDetailsJsonLd({ minFeeIqd: 5000, maxFeeIqd: 5000 })!;
        expect(d.shippingRate).toEqual({ "@type": "MonetaryAmount", currency: "IQD", value: 5000 });
        expect(d.deliveryTime).toBeUndefined();
    });

    it("states the range when governorates differ — the same range the product page shows", () => {
        const d = shippingDetailsJsonLd({ minFeeIqd: 5000, maxFeeIqd: 8000 })!;
        expect(d.shippingRate).toEqual({ "@type": "MonetaryAmount", currency: "IQD", minValue: 5000, maxValue: 8000 });
    });

    it("gives a delivery time only when the merchant published an ETA, rounded up to whole days", () => {
        expect(shippingDetailsJsonLd({ minFeeIqd: 5000, maxFeeIqd: 5000, etaHours: null })!.deliveryTime).toBeUndefined();
        const d = shippingDetailsJsonLd({ minFeeIqd: 5000, maxFeeIqd: 5000, etaHours: { min: 18, max: 48 } })!;
        expect((d.deliveryTime as Record<string, Record<string, unknown>>).transitTime).toMatchObject({
            minValue: 1,
            maxValue: 2,
            unitCode: "DAY",
        });
    });

    it("says nothing at all for a nonsense fee", () => {
        expect(shippingDetailsJsonLd({ minFeeIqd: -1, maxFeeIqd: 5000 })).toBeUndefined();
        expect(shippingDetailsJsonLd({ minFeeIqd: Number.NaN, maxFeeIqd: 0 })).toBeUndefined();
    });
});

describe("returnPolicyJsonLd", () => {
    it("states the merchant's own window, and nothing when they set none", () => {
        expect(returnPolicyJsonLd(7)).toEqual({
            "@type": "MerchantReturnPolicy",
            applicableCountry: "IQ",
            returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
            merchantReturnDays: 7,
        });
        for (const v of [undefined, null, 0, -3, Number.NaN]) {
            expect(returnPolicyJsonLd(v as number)).toBeUndefined();
        }
    });

    it("claims nothing about who pays for the return", () => {
        const p = returnPolicyJsonLd(14)!;
        expect(p.returnFees).toBeUndefined();
        expect(p.returnMethod).toBeUndefined();
    });
});

describe("faqItemsFromPage / faqPageJsonLd", () => {
    const page = (sections: unknown[]) => ({ page_id: "faq", sections } as unknown as PageConfig);
    const q = (ar: string, a: string) => ({ q_i18n: { ar }, a_i18n: { ar: a } });

    it("reads the merchant's own questions out of either FAQ section", () => {
        const items = faqItemsFromPage(
            page([
                { id: "1", type: "faq_accordion", enabled: true, base: { items: [q("سؤال؟", "جواب.")] } },
                { id: "2", type: "faq_contact_split", enabled: true, base: { items: [q("ثاني؟", "ثاني.")] } },
                { id: "3", type: "product_grid", enabled: true, base: {} },
            ]),
            "ar",
        );
        expect(items).toEqual([
            { question: "سؤال؟", answer: "جواب." },
            { question: "ثاني؟", answer: "ثاني." },
        ]);
    });

    it("skips a disabled section, and a half-filled question", () => {
        expect(
            faqItemsFromPage(
                page([
                    { id: "1", type: "faq_accordion", enabled: false, base: { items: [q("مخفي؟", "مخفي.")] } },
                    { id: "2", type: "faq_accordion", enabled: true, base: { items: [{ q_i18n: { ar: "بلا جواب؟" } }] } },
                ]),
                "ar",
            ),
        ).toEqual([]);
    });

    it("emits no FAQPage for a page with no questions", () => {
        expect(faqPageJsonLd([])).toBeUndefined();
        expect(faqPageJsonLd([{ question: "  ", answer: "x" }])).toBeUndefined();
        expect(faqItemsFromPage(null, "ar")).toEqual([]);
        const ld = faqPageJsonLd([{ question: "س؟", answer: "ج." }])!;
        expect((ld.mainEntity as unknown[])).toHaveLength(1);
    });
});

describe("itemListJsonLd", () => {
    it("lists the collection in the order shoppers see it", () => {
        const ld = itemListJsonLd({ name: "عطور", items: [{ name: "a", url: "u1" }, { name: "b", url: "u2" }] })!;
        expect(ld.numberOfItems).toBe(2);
        expect((ld.itemListElement as { position: number; name: string }[])[1]).toMatchObject({ position: 2, name: "b" });
    });

    it("says nothing for an empty collection", () => {
        expect(itemListJsonLd({ name: "عطور", items: [] })).toBeUndefined();
    });
});
