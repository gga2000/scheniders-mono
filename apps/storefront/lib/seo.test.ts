import { beforeEach, describe, expect, it, vi } from "vitest";

const headerStore = new Map<string, string>();
vi.mock("next/headers", () => ({
  headers: async () => ({ get: (k: string) => headerStore.get(k) ?? null }),
}));
import type { PageConfig } from "@scheniders/shared";
import {
  articleJsonLd,
  faqItemsFromPage,
  faqJsonLd,
  itemListJsonLd,
  productJsonLd,
  returnPolicyJsonLd,
  shippingDetailsJsonLd,
  storeCanonical,
  storeDisplayName,
} from "./seo";

describe("itemListJsonLd", () => {
  const items = [
    { name: "عطر فيوجن", url: "https://x.test/products/fusion" },
    { name: "عطر ويفر", url: "https://x.test/products/wayfarer" },
  ];

  it("lists the products in render order, pointing at their own pages", () => {
    const ld = itemListJsonLd({ name: "الأكثر مبيعاً", items }) as Record<
      string,
      unknown
    >;
    expect(ld["@type"]).toBe("ItemList");
    expect(ld.numberOfItems).toBe(2);
    const els = ld.itemListElement as { position: number; url: string }[];
    expect(els.map((e) => e.position)).toEqual([1, 2]);
    expect(els[0].url).toBe("https://x.test/products/fusion");
  });

  it("does not restate the products themselves", () => {
    // The full Product markup lives on each product's own page. A second
    // copy on a listing page is what gets flagged as mismatched.
    const ld = JSON.stringify(itemListJsonLd({ name: "x", items }));
    expect(ld).not.toContain('"@type":"Product"');
    expect(ld).not.toContain("priceCurrency");
    expect(ld).not.toContain("availability");
  });

  it("returns null rather than describing nothing", () => {
    expect(itemListJsonLd({ name: "x", items: [] })).toBeNull();
  });
});

describe("faqJsonLd", () => {
  it("emits only pairs that have both a question and an answer", () => {
    const ld = faqJsonLd([
      { question: "الدفع عند الاستلام؟", answer: "نعم." },
      { question: "سؤال بلا جواب", answer: "   " },
      { question: "  ", answer: "جواب بلا سؤال" },
    ]) as Record<string, unknown>;
    const entities = ld.mainEntity as { name: string }[];
    expect(entities).toHaveLength(1);
    expect(entities[0].name).toBe("الدفع عند الاستلام؟");
  });

  it("returns null when nothing is answerable", () => {
    expect(faqJsonLd([])).toBeNull();
    expect(faqJsonLd([{ question: "س", answer: "" }])).toBeNull();
  });
});

describe("productJsonLd — rating honesty", () => {
  const base = {
    name: "عطر",
    url: "https://x.test/p",
    price: 36750,
    inStock: true,
    brand: "شنايدر",
  };

  it("omits aggregateRating entirely when there are no reviews", () => {
    // An aggregateRating of 0 from 0 reviews is a fabricated rating.
    const ld = JSON.stringify(
      productJsonLd({ ...base, ratingCount: 0, ratingAverage: 0 }),
    );
    expect(ld).not.toContain("aggregateRating");
  });

  it("prices in IQD and reflects real stock", () => {
    const out = productJsonLd({ ...base, inStock: false }) as {
      offers: Record<string, unknown>;
    };
    expect(out.offers.priceCurrency).toBe("IQD");
    expect(out.offers.availability).toBe("https://schema.org/OutOfStock");
  });
});

// W7.5 — structured data. The rule these tests exist to hold: a rich result
// may only ever repeat something the store actually says. A missing
// recommended field is a Search Console warning; a wrong one is a lie in a
// search result, so every builder omits rather than invents.

/** Narrows a builder's result for the assertions that follow. */
function defined<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) {
    throw new Error("expected the builder to emit a value");
  }
  return value;
}

describe("productJsonLd — seller, sku and honest omissions", () => {
  const base = {
    name: "عطر",
    url: "https://x.iq/products/p",
    price: 25000,
    inStock: true,
    brand: "متجر",
  };

  it("names the seller and the sku, and prices in IQD with no tax", () => {
    const ld = productJsonLd({ ...base, sku: "SKU-1" });
    const offer = ld.offers as Record<string, unknown>;
    expect(ld.sku).toBe("SKU-1");
    expect(offer.priceCurrency).toBe("IQD");
    expect(offer.seller).toEqual({ "@type": "Organization", name: "متجر" });
    expect(offer.availability).toBe("https://schema.org/InStock");
  });

  it("omits the sku when the merchant set none", () => {
    expect(productJsonLd({ ...base, sku: null }).sku).toBeUndefined();
    expect(productJsonLd({ ...base, sku: "" }).sku).toBeUndefined();
  });

  it("rounds a real rating and emits none without reviews", () => {
    expect(productJsonLd(base).aggregateRating).toBeUndefined();
    expect(
      productJsonLd({ ...base, ratingCount: 0, ratingAverage: 5 })
        .aggregateRating,
    ).toBeUndefined();
    const rated = productJsonLd({
      ...base,
      ratingCount: 3,
      ratingAverage: 4.666,
    });
    expect(rated.aggregateRating).toEqual({
      "@type": "AggregateRating",
      ratingValue: 4.67,
      reviewCount: 3,
    });
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

  it("carries the shipping and returns it is given into the offer", () => {
    const shippingDetails = defined(
      shippingDetailsJsonLd({ minFeeIqd: 5000, maxFeeIqd: 5000 }),
    );
    const returnPolicy = defined(returnPolicyJsonLd(7));
    const offer = productJsonLd({ ...base, shippingDetails, returnPolicy })
      .offers as Record<string, unknown>;
    expect(offer.shippingDetails).toBe(shippingDetails);
    expect(offer.hasMerchantReturnPolicy).toBe(returnPolicy);
  });
});

describe("shippingDetailsJsonLd", () => {
  it("states one rate when the fee is the same everywhere", () => {
    const d = defined(
      shippingDetailsJsonLd({ minFeeIqd: 5000, maxFeeIqd: 5000 }),
    );
    expect(d.shippingRate).toEqual({
      "@type": "MonetaryAmount",
      currency: "IQD",
      value: 5000,
    });
    expect(d.shippingDestination).toEqual({
      "@type": "DefinedRegion",
      addressCountry: "IQ",
    });
    expect(d.deliveryTime).toBeUndefined();
  });

  it("states free delivery as a zero rate, not as no rate", () => {
    const d = defined(shippingDetailsJsonLd({ minFeeIqd: 0, maxFeeIqd: 0 }));
    expect(d.shippingRate).toEqual({
      "@type": "MonetaryAmount",
      currency: "IQD",
      value: 0,
    });
  });

  it("states the range when governorates differ — the same range the product page shows", () => {
    const d = defined(
      shippingDetailsJsonLd({ minFeeIqd: 5000, maxFeeIqd: 8000 }),
    );
    expect(d.shippingRate).toEqual({
      "@type": "MonetaryAmount",
      currency: "IQD",
      minValue: 5000,
      maxValue: 8000,
    });
  });

  it("gives a delivery time only when the merchant published an ETA, rounded up to whole days", () => {
    expect(
      defined(
        shippingDetailsJsonLd({
          minFeeIqd: 5000,
          maxFeeIqd: 5000,
          etaHours: null,
        }),
      ).deliveryTime,
    ).toBeUndefined();
    const d = defined(
      shippingDetailsJsonLd({
        minFeeIqd: 5000,
        maxFeeIqd: 5000,
        etaHours: { min: 18, max: 48 },
      }),
    );
    expect(
      (d.deliveryTime as Record<string, Record<string, unknown>>).transitTime,
    ).toMatchObject({ minValue: 1, maxValue: 2, unitCode: "DAY" });
  });

  it("says nothing at all for a nonsense fee", () => {
    expect(
      shippingDetailsJsonLd({ minFeeIqd: -1, maxFeeIqd: 5000 }),
    ).toBeUndefined();
    expect(
      shippingDetailsJsonLd({ minFeeIqd: Number.NaN, maxFeeIqd: 0 }),
    ).toBeUndefined();
  });

  it("states the min alone rather than a null max", () => {
    // An unusable max used to serialise as `"maxValue": null`, which is a
    // malformed Offer — Google reads a broken shipping rate, not a missing
    // one, and a wrong field is worse than an absent one.
    for (const maxFeeIqd of [Number.NaN, Number.POSITIVE_INFINITY]) {
      const d = defined(shippingDetailsJsonLd({ minFeeIqd: 5000, maxFeeIqd }));
      expect(d.shippingRate).toEqual({
        "@type": "MonetaryAmount",
        currency: "IQD",
        value: 5000,
      });
      expect(JSON.stringify(d)).not.toContain("null");
    }
  });

  it("ignores a max below the min", () => {
    const d = defined(
      shippingDetailsJsonLd({ minFeeIqd: 5000, maxFeeIqd: 1000 }),
    );
    expect(d.shippingRate).toEqual({
      "@type": "MonetaryAmount",
      currency: "IQD",
      value: 5000,
    });
  });
});

describe("returnPolicyJsonLd", () => {
  it("states the merchant's own window, and nothing when they set none", () => {
    expect(returnPolicyJsonLd(7)).toEqual({
      "@type": "MerchantReturnPolicy",
      applicableCountry: "IQ",
      returnPolicyCategory:
        "https://schema.org/MerchantReturnFiniteReturnWindow",
      merchantReturnDays: 7,
    });
    for (const v of [undefined, null, 0, -3, Number.NaN]) {
      expect(returnPolicyJsonLd(v)).toBeUndefined();
    }
  });

  it("claims nothing about who pays for the return", () => {
    const p = defined(returnPolicyJsonLd(14));
    expect(p.returnFees).toBeUndefined();
    expect(p.returnMethod).toBeUndefined();
  });
});

describe("faqItemsFromPage", () => {
  const page = (sections: unknown[]) =>
    ({ page_id: "faq", sections }) as unknown as PageConfig;
  const q = (ar: string, a: string) => ({ q_i18n: { ar }, a_i18n: { ar: a } });

  it("reads the merchant's own questions out of either FAQ section", () => {
    const items = faqItemsFromPage(
      page([
        {
          id: "1",
          type: "faq_accordion",
          enabled: true,
          base: { items: [q("سؤال؟", "جواب.")] },
        },
        {
          id: "2",
          type: "faq_contact_split",
          enabled: true,
          base: { items: [q("ثاني؟", "ثاني.")] },
        },
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
          {
            id: "1",
            type: "faq_accordion",
            enabled: false,
            base: { items: [q("مخفي؟", "مخفي.")] },
          },
          {
            id: "2",
            type: "faq_accordion",
            enabled: true,
            base: { items: [{ q_i18n: { ar: "بلا جواب؟" } }] },
          },
        ]),
        "ar",
      ),
    ).toEqual([]);
  });

  it("feeds an FAQPage only when the page has questions", () => {
    expect(faqItemsFromPage(null, "ar")).toEqual([]);
    expect(faqJsonLd(faqItemsFromPage(null, "ar"))).toBeNull();
    const ld = defined(
      faqJsonLd(
        faqItemsFromPage(
          page([
            {
              id: "1",
              type: "faq_accordion",
              enabled: true,
              base: { items: [q("س؟", "ج.")] },
            },
          ]),
          "ar",
        ),
      ),
    );
    expect(ld.mainEntity as unknown[]).toHaveLength(1);
  });
});

describe("articleJsonLd", () => {
  const base = { headline: "كيف تختار عطرك", url: "https://x.iq/p/guide" };

  it("describes a guide with only the fields the merchant set", () => {
    const ld = defined(
      articleJsonLd({
        ...base,
        description: "دليل قصير",
        imageUrl: "https://cdn.x.iq/cover.jpg",
        datePublished: "2026-09-01",
        author: "سارة",
        publisherName: "متجر",
      }),
    );
    expect(ld["@type"]).toBe("Article");
    expect(ld.mainEntityOfPage).toEqual({
      "@type": "WebPage",
      "@id": base.url,
    });
    expect(ld.image).toEqual(["https://cdn.x.iq/cover.jpg"]);
    expect(ld.datePublished).toBe("2026-09-01");
    expect(ld.author).toEqual({ "@type": "Person", name: "سارة" });
    expect(ld.publisher).toEqual({ "@type": "Organization", name: "متجر" });
  });

  it("invents no author, date, image, description or publisher", () => {
    const ld = defined(
      articleJsonLd({ ...base, author: "  ", description: " " }),
    );
    for (const key of [
      "author",
      "datePublished",
      "dateModified",
      "image",
      "description",
      "publisher",
    ]) {
      expect(ld[key]).toBeUndefined();
    }
  });

  it("emits nothing without a headline", () => {
    expect(articleJsonLd({ ...base, headline: "   " })).toBeUndefined();
  });
});

describe("storeCanonical", () => {
  beforeEach(() => headerStore.clear());

  it("builds the absolute URL on a custom domain", async () => {
    headerStore.set("host", "shop.example.iq");
    headerStore.set("x-store-base", "");
    expect(await storeCanonical("__domain__shop.example.iq", "/policies/returns")).toEqual({
      alternates: { canonical: "https://shop.example.iq/policies/returns" },
    });
  });

  it("keeps the /s/<slug> prefix in path mode", async () => {
    headerStore.set("host", "scheniders-storefront.vercel.app");
    expect(await storeCanonical("acme", "/about")).toEqual({
      alternates: { canonical: "https://scheniders-storefront.vercel.app/s/acme/about" },
    });
  });

  it("emits nothing without a host", async () => {
    expect(await storeCanonical("acme", "/about")).toEqual({});
  });
});

describe("storeDisplayName", () => {
  it("prefers the builder brand name over the legal business name", () => {
    expect(
      storeDisplayName({
        business_name: "Scheniders Iraq",
        store_config_v2: { brand_kit: { identity: { name: " شنايدر " } } },
      }),
    ).toBe("شنايدر");
  });

  it("falls back to the business name when no brand name is set", () => {
    expect(storeDisplayName({ business_name: "Scheniders Iraq", store_config_v2: null })).toBe("Scheniders Iraq");
    expect(
      storeDisplayName({
        business_name: "Scheniders Iraq",
        store_config_v2: { brand_kit: { identity: { name: "  " } } },
      }),
    ).toBe("Scheniders Iraq");
  });
});
