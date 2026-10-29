// Express identity row, `identity_rating: "summary_link"` (spec §1.2): the
// real rating renders whenever the product has reviews — no
// `rating_chip_i18n` needed — as a link to the reviews summary that never
// opens the review form, drawn with exact stars from `displayRating`.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { LocaleCode } from "@scheniders/shared";
import { StoreBaseProvider } from "../helpers/store-context";
import pdp_direct_order from "../pdp_direct_order";
import type { Props } from "../pdp_direct_order";
import {
  EXPRESS_IRAQ_DRAFT_PDP_PROPS,
  productCtx,
  saleProduct,
} from "../_pdp-fixtures";
import type { Product } from "../types";
import { IdentityLabel, reviewCountLabel } from "./identity-label";

function identity(reviewCount: number, avgRating: number, locale: LocaleCode = "ar"): string {
  return renderToStaticMarkup(
    <IdentityLabel
      product={saleProduct}
      locale={locale}
      reviewCount={reviewCount}
      avgRating={avgRating}
      showRating
      ratingLink
    />,
  );
}

describe("reviewCountLabel", () => {
  it.each([
    [1, "تقييم واحد"],
    [2, "تقييمين"],
    [6, "6 تقييمات"],
    [10, "10 تقييمات"],
    [11, "11 تقييم"],
    [120, "120 تقييم"],
  ])("ar %i → %s", (count, expected) => {
    expect(reviewCountLabel(count, "ar")).toBe(expected);
  });

  it.each([
    [1, "1 review"],
    [6, "6 reviews"],
  ])("en %i → %s", (count, expected) => {
    expect(reviewCountLabel(count, "en")).toBe(expected);
  });

  it("ku follows the ar plural rules with its own words", () => {
    expect(reviewCountLabel(1, "ku")).toBe("یەک هەڵسەنگاندن");
    expect(reviewCountLabel(6, "ku")).toBe("6 هەڵسەنگاندن");
  });
});

describe("IdentityLabel ratingLink", () => {
  it("links to #reviews-summary with the display rating and exact stars", () => {
    const html = identity(6, 4.667);
    expect(html).toContain('href="#reviews-summary"');
    expect(html).toContain('data-rating-link="summary"');
    expect(html).toContain(">4.7</bdi>");
    expect(html).toContain("(6 تقييمات)");
    expect(html).toContain('aria-label="4.7 / 5"');
    // Exact stars: the fifth star is clipped to 70%.
    expect(html).toContain("width:70%");
    expect(html).not.toContain('href="#reviews"');
  });

  it("renders nothing for a product without reviews", () => {
    expect(identity(0, 0)).not.toContain("data-rating-link");
  });

  it("english", () => {
    const html = identity(1, 5, "en");
    expect(html).toContain(">5.0</bdi>");
    expect(html).toContain("(1 review)");
  });
});

describe('pdp_direct_order express — identity_rating "summary_link"', () => {
  function render(props: Props, product: Product): string {
    return renderToStaticMarkup(
      <StoreBaseProvider base="/s/fixture-store">
        <pdp_direct_order.render props={props} ctx={productCtx(product)} />
      </StoreBaseProvider>,
    );
  }

  it("shows the rating without rating_chip_i18n", () => {
    expect(EXPRESS_IRAQ_DRAFT_PDP_PROPS.rating_chip_i18n).toBeUndefined();
    const off = render(EXPRESS_IRAQ_DRAFT_PDP_PROPS, saleProduct);
    const on = render({ ...EXPRESS_IRAQ_DRAFT_PDP_PROPS, identity_rating: "summary_link" }, saleProduct);
    expect(off).not.toContain("data-rating-link");
    expect(on).toContain('data-rating-link="summary"');
    expect(on).toContain("(12 تقييم)");
  });

  it("is absent for a product with no reviews", () => {
    const html = render(
      { ...EXPRESS_IRAQ_DRAFT_PDP_PROPS, identity_rating: "summary_link" },
      { ...saleProduct, review_count: 0, avg_rating: 0 },
    );
    expect(html).not.toContain("data-rating-link");
  });
});
