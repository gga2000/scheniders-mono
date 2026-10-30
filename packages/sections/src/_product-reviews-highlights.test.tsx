// =====================================================================
// product_reviews `layout: "highlights"` — server markup (spec §1.6)
// =====================================================================
// Wayfarer's six live reviews through the real section render: the
// summary card is the #reviews-summary target with «4.7», exact stars and
// «من 6 تقييمات»; the word buttons read 3/2/2/2; the cards come in D10
// order with Ahmed's 3★ last; key phrases are tinted; a reply renders
// only when the merchant wrote one; `hash_only` keeps the form out. The
// opted-out layouts are pinned by the baseline snapshots.
// =====================================================================

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { LocaleCode } from "@scheniders/shared";
import { StoreBaseProvider } from "./helpers/store-context";
import product_reviews from "./product_reviews";
import type { Product } from "./types";
import { productCtx, productRuntime } from "./_pdp-fixtures";
import { IRAQ_REDESIGN_TENANT } from "./_pdp-redesign-fixtures";
import { WAYFER_REVIEWS, wayferProduct } from "./_pdp-wayfer-fixtures";

const AHMED = "cd25b071-10d9-4de5-a324-ea6a0793559b";
const AHMED_PHRASE = "العطر كلش راقي وثباته يطول يوم كامل على الملابس";

const HIGHLIGHTS = {
  heading_i18n: { ar: "شنو گالوا اللي جرّبوه", en: "What people who tried it said" },
  show_form: true,
  layout: "highlights",
  form_entry: "hash_only",
  visible_count: 3,
  heading_style: "chapter",
  theme_words: [
    { key: "longevity", label_i18n: { ar: "الثبات", en: "Longevity" }, match_terms: ["ثبات"] },
    { key: "tester", label_i18n: { ar: "التيستر", en: "The tester" }, match_terms: ["تيستر"] },
    { key: "luxury", label_i18n: { ar: "فخامة", en: "Luxury" }, match_terms: ["فخم"] },
    {
      key: "packaging",
      label_i18n: { ar: "العلبة والتغليف", en: "Box and packaging" },
      match_terms: ["تغليف", "علبه"],
    },
  ],
};

function render(input: unknown, product: Product, locale: LocaleCode = "ar"): string {
  return renderToStaticMarkup(
    <StoreBaseProvider base="/s/fixture-store">
      <product_reviews.render
        props={product_reviews.schema.parse(input)}
        ctx={productCtx(product, { tenant: IRAQ_REDESIGN_TENANT, runtime: { ...productRuntime, locale } })}
      />
    </StoreBaseProvider>,
  );
}

function count(html: string, needle: string): number {
  return html.split(needle).length - 1;
}

function cardOrder(html: string): string[] {
  return [...html.matchAll(/data-review-card="([^"]+)"/g)].map((m) => {
    const r = WAYFER_REVIEWS.find((x) => x.id === m[1]);
    return r?.author_name ?? "?";
  });
}

describe("summary card", () => {
  const html = render(HIGHLIGHTS, wayferProduct);

  it("is the #reviews-summary target, inside #reviews", () => {
    expect(count(html, 'id="reviews-summary"')).toBe(1);
    expect(html.indexOf('id="reviews"')).toBeLessThan(html.indexOf('id="reviews-summary"'));
  });

  it("prints «4.7» and draws the same number with exact stars", () => {
    expect(html).toContain("<bdi>4.7</bdi>");
    expect(html).toContain('aria-label="التقييم 4.7 من 5"');
  });

  it("«من 6 تقييمات», plural-correct", () => {
    expect(html).toContain("من 6 تقييمات");
  });

  it("five amber bars from the real counts", () => {
    expect(count(html, "data-star-count=")).toBe(5);
    expect(html).toContain('data-star-count="5">5<');
    expect(html).toContain('data-star-count="3">1<');
    expect(count(html, "bg-bk-accent")).toBe(5);
  });
});

describe("word buttons", () => {
  const html = render(HIGHLIGHTS, wayferProduct);

  it("الثبات 3 · التيستر 2 · فخامة 2 · العلبة والتغليف 2, none pressed", () => {
    const buttons = [...html.matchAll(/data-theme-word="([a-z]+)" aria-pressed="false"[^>]*><span>([^<]+)<\/span><bdi[^>]*>(\d+)<\/bdi>/g)].map(
      (m) => `${m[2]} ${m[3]}`,
    );
    expect(buttons).toEqual(["الثبات 3", "التيستر 2", "فخامة 2", "العلبة والتغليف 2"]);
  });

  it("are hidden when fewer than two topics have a hit", () => {
    const one = { ...HIGHLIGHTS, theme_words: HIGHLIGHTS.theme_words.slice(0, 1) };
    expect(render(one, wayferProduct)).not.toContain("data-theme-word=");
  });
});

describe("cards", () => {
  it("D10: the two strongest, then Ahmed's 3★; the first is featured", () => {
    const html = render(HIGHLIGHTS, wayferProduct);
    expect(cardOrder(html)).toEqual(["احمد الشمري", "حازم السيد", "Ahmed"]);
    expect(count(html, "data-featured")).toBe(1);
    expect(html.indexOf("data-featured")).toBeLessThan(html.indexOf("حازم السيد"));
  });

  it("names sit in <bdi>, so «eng. سيف» keeps its order", () => {
    const html = render({ ...HIGHLIGHTS, visible_count: 6 }, wayferProduct);
    expect(html).toContain("<bdi");
    expect(html).toContain(">eng. سيف</bdi>");
  });

  it("key phrases by rule: the first 3–14-word clause naming a topic; none for Ahmed", () => {
    const html = render(HIGHLIGHTS, wayferProduct);
    const marks = [...html.matchAll(/<mark data-key-phrase=""[^>]*>([^<]+)<\/mark>/g)].map((m) => m[1]);
    expect(marks).toEqual([
      "بس وصلتني العلبة مرتبة والتيستر فكرة تخبل",
      "ريحته حمضيات ع انتعاش ع سوسن بالبداية وبعدين تصير فخمة",
    ]);
  });

  it("the merchant's key phrase wins", () => {
    const curated = { ...HIGHLIGHTS, review_curation: [{ review_id: AHMED, highlight: AHMED_PHRASE }] };
    const html = render(curated, wayferProduct);
    expect(html).toContain(`<mark data-key-phrase="" class="rounded-sm text-bk-ink bg-bk-primary/25">${AHMED_PHRASE}</mark>`);
  });

  it("no reply without the merchant's text; «رد شنايدر» with it", () => {
    expect(render(HIGHLIGHTS, wayferProduct)).not.toContain("data-store-reply");
    const replied = {
      ...HIGHLIGHTS,
      review_curation: [{ review_id: AHMED, reply_i18n: { ar: "حقك علينا يا أحمد." } }],
    };
    const html = render(replied, wayferProduct);
    expect(count(html, "data-store-reply")).toBe(1);
    expect(html).toContain("<span>رد شنايدر</span>");
    expect(html).toContain("حقك علينا يا أحمد.");
  });

  it("«شوف كل التقييمات (6)» when cards are hidden; none when all fit", () => {
    expect(render(HIGHLIGHTS, wayferProduct)).toContain("شوف كل التقييمات (6)");
    expect(render({ ...HIGHLIGHTS, visible_count: 6 }, wayferProduct)).not.toContain("data-reviews-show-all");
  });

  it("no dates and no «verified» badge", () => {
    const html = render(HIGHLIGHTS, wayferProduct);
    expect(html).not.toContain("2026-02-24");
    expect(html).not.toContain("موثّق");
  });
});

describe("heading, form and missing data", () => {
  it("heading_style chapter sets the heading at the chapter scale", () => {
    expect(render(HIGHLIGHTS, wayferProduct)).toContain("text-bk-chapter");
    const { heading_style: _h, ...section } = HIGHLIGHTS;
    expect(render(section, wayferProduct)).not.toContain("text-bk-chapter");
  });

  it("hash_only: no «اكتب تقييمك» and no form for a cold visitor", () => {
    const html = render(HIGHLIGHTS, wayferProduct);
    expect(html).not.toContain("data-review-entry");
    expect(html).not.toContain("<form");
  });

  it("form_entry always: the entry button", () => {
    expect(render({ ...HIGHLIGHTS, form_entry: "always" }, wayferProduct)).toContain("data-review-entry");
  });

  it("0 reviews: the honest line, no summary, no buttons", () => {
    const html = render(HIGHLIGHTS, { ...wayferProduct, review_count: 0, avg_rating: 0, reviews: [] });
    expect(html).toContain("بعد ماكو تقييمات على هذا العطر");
    expect(html).not.toContain("reviews-summary");
    expect(html).not.toContain("data-theme-word");
  });

  it("1 review: no bars, no word buttons, no «شوف كل»", () => {
    const one = WAYFER_REVIEWS.filter((r) => r.author_name === "احمد الشمري");
    const html = render(HIGHLIGHTS, { ...wayferProduct, review_count: 1, avg_rating: 5, reviews: one });
    expect(html).toContain('id="reviews-summary"');
    expect(html).not.toContain("data-star-count");
    expect(html).not.toContain("data-theme-word");
    expect(html).not.toContain("data-reviews-show-all");
  });

  it("adds no dir attribute", () => {
    expect(count(render(HIGHLIGHTS, wayferProduct), 'dir="')).toBe(0);
  });

  it("English chrome", () => {
    const html = render(HIGHLIGHTS, wayferProduct, "en");
    expect(html).toContain("from 6 reviews");
    expect(html).toContain("See all reviews (6)");
    expect(html).toContain("Mentioned most");
  });
});
