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
