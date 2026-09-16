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

function render(p: Product, opts: { showDiscountBadge?: boolean } = {}): string {
  return renderToStaticMarkup(
    React.createElement(
      StoreBaseProvider,
      { base: "", children: null },
      React.createElement(PricePillCard, {
        product: p,
        locale: "ar" as never,
        showDiscountBadge: opts.showDiscountBadge ?? true,
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
    const photoEnd = html.indexOf("</div></div>");
    const photo = html.slice(0, photoEnd);
    expect(photo).not.toContain("36,750");
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
});
