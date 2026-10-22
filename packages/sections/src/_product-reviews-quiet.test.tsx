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
