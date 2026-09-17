// =====================================================================
// The product card's four numbers
// =====================================================================
// Name, price paid, price struck through, and what the sale saves. The
// saving used to be stated twice in two disconnected places — a percent
// chip on the photo and a struck price in an overlay pill — and never in
// money, which is the figure a shopper actually weighs.
//
// The percent and the saving are derived from the same two fields, so a
// card can never contradict itself about the same product.
// =====================================================================

import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StoreBaseProvider } from "./helpers/store-context";
import { PricePillCard } from "./product_grid";
import type { Product } from "./types";

const product = (over: Partial<Product> = {}): Product =>
  ({
    id: "p1",
    slug: "p1",
    name: "عطر ويفر انتنس",
    price: 36750,
    compare_at_price: 48500,
    stock_quantity: 5,
    reserved_quantity: 0,
    image_url: "https://example.test/a.jpg",
    ...over,
  }) as Product;

function render(
  p: Product,
  opts: { showDiscountBadge?: boolean; showStars?: boolean } = {},
): string {
  return renderToStaticMarkup(
    React.createElement(
      StoreBaseProvider,
      { base: "", children: null },
      React.createElement(PricePillCard, {
        product: p,
        locale: "ar" as never,
        showDiscountBadge: opts.showDiscountBadge ?? true,
        showStars: opts.showStars ?? false,
      }),
    ),
  );
}

describe("PricePillCard", () => {
  it("states the saving in money, not only as a percent", () => {
    // 48,500 - 36,750 = 11,750. "24٪" is abstract; the dinars are not.
    const html = render(product());
    expect(html).toContain("data-saving");
    expect(html).toContain("11,750");
    expect(html).toContain("وفّر");
  });

  it("never lets the percent and the saving disagree", () => {
    // Both read the same two fields. If one can appear without the other,
    // a card can show "24٪ off" with no saving, or a saving with no badge.
    const onSale = render(product());
    expect(onSale.includes("data-saving")).toBe(true);
    expect(onSale.includes("٪")).toBe(true);

    const flat = render(product({ compare_at_price: null }));
    expect(flat.includes("data-saving")).toBe(false);
    expect(flat.includes("٪")).toBe(false);
  });

  it("shows no saving when the compare-at is not above the price", () => {
    // A compare-at equal to or below the price is not a discount; printing
    // "وفّر 0 د.ع" would be worse than printing nothing.
    expect(render(product({ compare_at_price: 36750 }))).not.toContain(
      "data-saving",
    );
    expect(render(product({ compare_at_price: 30000 }))).not.toContain(
      "data-saving",
    );
  });

  it("keeps the price off the photograph", () => {
    // The bottle is the product. The old layout floated a price pill across
    // the bottom of every photo, so legibility depended on the image and
    // the thing being sold was covered.
    const html = render(product());
    // Slice the photo container by its own marker rather than by counting
    // closing tags — the previous version of this test broke the moment the
    // card's structure changed, which is not the thing being protected.
    const start = html.indexOf("data-photo");
    const end = html.indexOf("data-price-line");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(html.slice(start, end)).not.toContain("36,750");
    expect(html).toContain("data-price-line");
  });

  it("never spends the buy-yellow on the discount marker", () => {
    // --bk-primary means "act". The marker states a fact about the price.
    const html = render(product());
    const marker = html.slice(html.indexOf("٪") - 400, html.indexOf("٪"));
    expect(marker).not.toContain("--bk-primary");
  });

  it("paints no marker when the badge is switched off, but still prices it", () => {
    // Back-compat: showDiscountBadge governs the marker only.
    const html = render(product(), { showDiscountBadge: false });
    expect(html).not.toContain("٪");
    expect(html).toContain("data-price-line");
    expect(html).toContain("data-compare-at");
  });

  it("says outright which price is which", () => {
    // The two numbers used to differ only by size, so a shopper had to
    // decode a strike-through. A convention is not a statement.
    const html = render(product());
    expect(html).toContain("بعد الخصم");
    expect(html).toContain("قبل الخصم");
  });

  it("calls it simply the price when nothing is discounted", () => {
    // "بعد الخصم" over a price that was never discounted is a lie.
    const html = render(product({ compare_at_price: null }));
    expect(html).toContain("السعر");
    expect(html).not.toContain("بعد الخصم");
    expect(html).not.toContain("قبل الخصم");
  });

  it("puts the name on the photograph, over a scrim", () => {
    // The name moved onto the photo so the well below can give the price
    // the size it needs. Without the scrim it sits on bare photography and
    // its legibility depends on whatever was shot that day.
    const html = render(product());
    const photo = html.slice(
      html.indexOf("data-photo"),
      html.indexOf("data-price-line"),
    );
    // Assert the gradient itself, not the attribute name: "data-scrim-x"
    // still contains "data-scrim", so the attribute check passed even with
    // the scrim renamed away.
    expect(photo).toContain("linear-gradient");
    // The heading itself, not the name text: the name also appears in the
    // image's alt attribute inside this same slice, so asserting the string
    // passed even with the <h3> removed entirely.
    expect(photo).toContain("<h3");
  });

  it("keeps the percent sign attached to its number in the seal", () => {
    // Split onto its own line the sign floated loose under the figure and
    // read as a stray glyph. This project has already had to fix a percent
    // sign separated from its number once, in the hero badge.
    const html = render(product());
    // Bound the slice to the seal itself. Running it to the end of the
    // document made the label assertion pass on "قبل الخصم" in the price
    // block below, which contains "خصم" as a substring.
    const start = html.indexOf("data-discount-seal");
    const seal = html.slice(start, html.indexOf("data-scrim", start));
    expect(seal).toContain(">24٪<");
    expect(seal).toContain(">خصم<");
  });

  it("keeps the star row from shifting the meta row off the shelf line", () => {
    // The meta row is bottom-anchored, so anything the star row adds to its
    // own box moves where that row starts. A stray mt-1 inside it put the
    // rating 4px higher than the low-stock line on the card beside it —
    // measured 379 vs 383 across one row at 1512.
    const html = render(
      product({ review_count: 6, avg_rating: 5 }),
      { showStars: true },
    );
    const meta = html.slice(html.indexOf("data-meta-row"));
    const inner = meta.slice(meta.indexOf("<div", meta.indexOf(">")));
    expect(inner.slice(0, 120)).not.toMatch(/\bmt-\d/);
  });

  it("colours the two prices by what they mean", () => {
    // Green is what you pay, red is what you would have paid. Both are
    // mixed against the ink token first — raw --bk-success measured 1.89:1
    // on this card and raw --bk-danger 3.48:1, neither readable.
    const html = render(product());
    const line = html.slice(
      html.indexOf("data-price-line"),
      html.indexOf("data-saving"),
    );
    expect(line).toContain("--bk-success");
    expect(line).toContain("--bk-danger");
    // Never the raw tokens on their own: they do not carry enough contrast.
    expect(line).not.toMatch(/color:\s*var\(--bk-success[^)]*\)\s*[,;"]/);
    expect(line).not.toMatch(/color:\s*var\(--bk-danger[^)]*\)\s*[,;"]/);
  });

  it("leaves an undiscounted price in plain ink", () => {
    // Green means "this is less than it was". A product that was never
    // discounted has nothing to be green about.
    const html = render(product({ compare_at_price: null }));
    const line = html.slice(html.indexOf("data-price-line"));
    expect(line.slice(0, 700)).not.toContain("--bk-success");
    expect(line.slice(0, 700)).toContain("--bk-ink");
  });

  it("prints the real average instead of rounding it into stars", () => {
    // `Stars` rounds to the nearest whole star by its own definition, so a
    // 4.6 average painted five filled stars — indistinguishable from a
    // perfect 5.0, and overstating the product by nearly half a star.
    const html = render(product({ review_count: 6, avg_rating: 4.6 }), {
      showStars: true,
    });
    expect(html).toContain("data-rating-value");
    expect(html).toContain(">4.6<");
    expect(html).toContain(">(6)<");
  });

  it("renders one star glyph, not a five-star gauge", () => {
    // Five accent-coloured shapes competed with the accent-coloured seal
    // two lines above them, and carried less information than the number.
    const html = render(product({ review_count: 6, avg_rating: 4.6 }), {
      showStars: true,
    });
    const meta = html.slice(html.indexOf("data-meta-row"));
    expect(meta.match(/<svg/g) ?? []).toHaveLength(1);
  });

  it("shows no rating at all when nobody has reviewed it", () => {
    // A rating row with no reviews behind it is decoration.
    const html = render(product({ review_count: 0 }), { showStars: true });
    expect(html).not.toContain("data-rating-value");
  });
});
