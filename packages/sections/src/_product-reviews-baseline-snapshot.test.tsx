// =====================================================================
// product_reviews baselines, frozen
// =====================================================================
// Server-markup snapshots of every historical product_reviews render.
// The opt-in `layout: "quiet"` field must leave all of them
// byte-identical. Each case goes through `schema.parse`, so the parse
// path is frozen too. A diff is a back-compat break, not a snapshot to
// refresh.
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

/** Frozen copy of scheniders-iraq's PDP reviews section
 *  (draft pages[2].sections[4].base at store_config_rev 38). */
const LIVE_IRAQ_PROPS = {
  heading_i18n: { ar: "آراء العملاء", en: "Customer reviews" },
  show_form: true,
};

const reviewed: Product = {
  ...saleProduct,
  review_count: 4,
  avg_rating: 4.5,
  reviews: BASELINE_REVIEWS,
};
/** saleProduct carries review_count 12 / avg 4.6 and no list. */
const aggregateOnly: Product = { ...saleProduct };
const noReviews: Product = { ...plainProduct, reviews: [] };

const products: [string, Product][] = [
  ["reviewed list", reviewed],
  ["aggregate only", aggregateOnly],
  ["no reviews", noReviews],
];

describe("product_reviews baseline — defaultProps", () => {
  it.each(products)("%s", (_label, product) => {
    expect(render(product_reviews.defaultProps, product)).toMatchSnapshot();
  });

  it("english locale", () => {
    expect(
      render(product_reviews.defaultProps, reviewed, {
        runtime: { ...productRuntime, locale: "en" },
      }),
    ).toMatchSnapshot();
  });

  it("kurdish locale", () => {
    expect(
      render(product_reviews.defaultProps, reviewed, {
        runtime: { ...productRuntime, locale: "ku" },
      }),
    ).toMatchSnapshot();
  });

  it("form hidden", () => {
    expect(
      render({ ...product_reviews.defaultProps, show_form: false }, reviewed),
    ).toMatchSnapshot();
  });

  it("no product renders nothing", () => {
    expect(render(product_reviews.defaultProps, undefined)).toBe("");
  });
});

describe("product_reviews baseline — frozen scheniders-iraq props", () => {
  it("the frozen props still satisfy the schema unchanged", () => {
    const parsed = product_reviews.schema.safeParse(LIVE_IRAQ_PROPS);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data).toEqual(LIVE_IRAQ_PROPS);
  });

  it.each(products)("%s", (_label, product) => {
    expect(render(LIVE_IRAQ_PROPS, product)).toMatchSnapshot();
  });
});
