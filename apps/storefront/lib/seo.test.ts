import { describe, expect, it } from "vitest";
import { itemListJsonLd, faqJsonLd, productJsonLd } from "./seo";

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
