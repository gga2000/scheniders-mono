// =====================================================================
// product_reviews — the opt-in quiet layout
// =====================================================================
// Static-markup checks for `layout: "quiet"`: schema back-compat, the
// summary card, quiet review cards, and the folded form. Interaction
// lives in _product-reviews-quiet-dom.test.tsx.
// =====================================================================

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { StoreBaseProvider } from "./helpers/store-context";
import product_reviews from "./product_reviews";
import type { SectionRenderContext } from "./_types";
import type { Product } from "./types";
import {
  BASELINE_REVIEWS,
  plainProduct,
  productCtx,
  productRuntime,
  saleProduct,
} from "./_pdp-fixtures";
import { QuietSummary } from "./product_reviews/quiet-summary";
import { QuietReviewCard } from "./product_reviews/quiet-review-card";
import type { RatingSummary } from "@scheniders/shared";

const Reviews = product_reviews.render;

function render(
  input: unknown,
  product: Product | undefined,
  overrides: Partial<SectionRenderContext> = {},
): string {
  return renderToStaticMarkup(
    <StoreBaseProvider base="/s/fixture-store">
      <Reviews
        props={product_reviews.schema.parse(input)}
        ctx={productCtx(product, overrides)}
      />
    </StoreBaseProvider>,
  );
}

const LIVE = {
  heading_i18n: { ar: "آراء العملاء", en: "Customer reviews" },
  show_form: true,
};
const QUIET = { ...LIVE, layout: "quiet" };
const reviewed: Product = { ...saleProduct, reviews: BASELINE_REVIEWS };

describe("product_reviews quiet — schema", () => {
  it("absent layout parses to absent", () => {
    expect(product_reviews.schema.parse(LIVE).layout).toBeUndefined();
  });

  it("a junk layout falls back to the historical render", () => {
    expect(render({ ...LIVE, layout: "loud" }, reviewed)).toBe(render(LIVE, reviewed));
  });

  it("accepts quiet", () => {
    expect(product_reviews.schema.parse(QUIET).layout).toBe("quiet");
  });
});

const SUMMARY: RatingSummary = {
  average: 4.5,
  count: 4,
  distribution: { 1: 0, 2: 0, 3: 1, 4: 0, 5: 3 },
};

describe("QuietSummary", () => {
  const html = (locale: "ar" | "en" | "ku", known = true) =>
    renderToStaticMarkup(
      <QuietSummary summary={SUMMARY} distributionKnown={known} locale={locale} />,
    );

  it("shows the big average, the stars and «N تقييم»", () => {
    const out = html("ar");
    expect(out).toContain(">4.5<");
    expect(out).toContain('aria-label="التقييم 4.5 من 5"');
    expect(out).toContain("4 تقييم");
    expect(out).toContain("data-reviews-summary");
  });

  it("draws one labelled bar row per star with the real counts", () => {
    const out = html("ar");
    expect(out).toContain('data-star-count="5">3<');
    expect(out).toContain('data-star-count="3">1<');
    expect(out).toContain('data-star-count="1">0<');
    expect(out).toContain('aria-label="5 من 5: 3 تقييم"');
    expect(out).toContain("width:75%");
  });

  it("hides the bars when only the aggregate is known", () => {
    expect(html("ar", false)).not.toContain("data-star-count");
  });

  it("flips the visual order for Arabic and Kurdish only, never with dir", () => {
    expect(html("ar")).toContain("flex-row-reverse");
    expect(html("ku")).toContain("flex-row-reverse");
    expect(html("en")).not.toContain("flex-row-reverse");
    expect(html("ar")).not.toContain('dir="');
  });

  it("uses the quiet hairline card, not the heavy border", () => {
    const out = html("ar");
    expect(out).toContain("rounded-bk-card");
    expect(out).toContain("border-bk-divider");
    expect(out).not.toContain("border-2");
  });
});

describe("QuietReviewCard", () => {
  const card = (i: number, locale: "ar" | "en" = "ar") =>
    renderToStaticMarkup(
      <ul>
        <QuietReviewCard
          review={BASELINE_REVIEWS[i]}
          locale={locale}
          onOpenPhoto={() => undefined}
        />
      </ul>,
    );

  it("shows the name, the stars and the body", () => {
    const out = card(0);
    expect(out).toContain("حازم السيد");
    expect(out).toContain('aria-label="5 من 5"');
    expect(out).toContain("وهسة جربت الانتنس");
  });

  it("never claims a verified buyer for an anonymous review", () => {
    expect(card(2)).toContain(">زبون<");
    expect(card(3)).toContain(">زبون<");
    expect(card(2)).not.toContain("موثّق");
    expect(card(2, "en")).toContain(">Customer<");
  });

  it("keeps the title as a heading and photos as 64px tap targets", () => {
    const out = card(2);
    expect(out).toContain("<h3");
    expect(out).toContain("ثبات");
    expect(out).toContain('aria-label="تكبير الصورة"');
    expect(out).toContain("h-16 w-16");
  });

  it("is a quiet hairline card, flipped for Arabic with classes", () => {
    const out = card(0);
    expect(out).toContain("rounded-bk-card border-bk border-bk-divider");
    expect(out).toContain("flex-row-reverse");
    expect(out).toContain("text-right");
    expect(out).not.toContain('dir="');
    expect(card(0, "en")).not.toContain("flex-row-reverse");
  });
});

describe("product_reviews quiet — wired section", () => {
  it("renders the summary card and quiet cards, not the classic list", () => {
    const out = render(QUIET, reviewed);
    expect(out).toContain('id="reviews"');
    expect(out).toContain("data-reviews-summary");
    expect(out).toContain("4 تقييم");
    expect(out).not.toContain("مشترٍ موثّق");
    expect(out).not.toContain("border-2 border-bk-ink/10");
  });

  it("folds the form behind a modest entry button", () => {
    const out = render(QUIET, reviewed);
    expect(out).not.toContain("<form");
    expect(out).toContain("اكتب تقييمك");
    expect(out).toContain("data-review-entry");
    expect(out).toContain("min-h-11");
  });

  it("no entry button when the merchant hides the form", () => {
    const out = render({ ...QUIET, show_form: false }, reviewed);
    expect(out).not.toContain("data-review-entry");
  });

  it("an empty product gets one honest line plus the entry, no 0.0", () => {
    const out = render(QUIET, { ...plainProduct, reviews: [] });
    expect(out).toContain("بعد ماكو تقييمات، كون أول واحد يقيّم");
    expect(out).toContain("data-review-entry");
    expect(out).not.toContain("0.0");
    expect(out).not.toContain("data-reviews-summary");
  });

  it("aggregate-only shows the average without bars", () => {
    const out = render(QUIET, { ...saleProduct });
    expect(out).toContain(">4.6<");
    expect(out).toContain("12 تقييم");
    expect(out).not.toContain("data-star-count");
  });

  it("english reads left to right", () => {
    const out = render(QUIET, reviewed, {
      runtime: { ...productRuntime, locale: "en" },
    });
    expect(out).toContain("4 reviews");
    expect(out).toContain("Write your review");
  });
});
