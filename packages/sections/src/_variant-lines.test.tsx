// P1-2: a product sold by variant is never put in the cart, or posted to the
// checkout, as a variant-less line — the checkout refuses one, and a variant
// priced above its parent would otherwise be bought at the parent's price.
// Static markup only (no DOM lib in this package).

import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StoreBaseProvider } from "./helpers/store-context";
import { SchneidersProductCard } from "./helpers/product-card";
import pdp_direct_order from "./pdp_direct_order";
import pdp_add_to_cart from "./pdp_add_to_cart";
import type { SectionRenderContext } from "./_types";
import type { Product } from "./types";

const runtime = {
  page_id: "product" as const,
  breakpoint: "mobile" as const,
  locale: "ar" as const,
  audience_segments: [],
  ab_test_arms: {},
  now: new Date("2026-09-07T00:00:00Z"),
};

const base: Product = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "تيشيرت",
  price: 25000,
  stock_quantity: 10,
  reserved_quantity: 0,
  is_archived: false,
};

const withVariants: Product = {
  ...base,
  sold_by_variant: true,
  variants: [
    { id: "v-s", product_id: base.id, name: "S", price: 25000, stock_quantity: 4 },
    { id: "v-xl", product_id: base.id, name: "XL", price: 32000, stock_quantity: 4 },
  ],
};

function renderSection(
  def: { render: React.ComponentType<{ props: never; ctx: SectionRenderContext }>; defaultProps: unknown },
  product: Product,
): string {
  return renderToStaticMarkup(
    React.createElement(
      StoreBaseProvider,
      { base: "", children: null },
      React.createElement(def.render, {
        props: def.defaultProps as never,
        ctx: {
          tenant: { id: "t1", business_name: "متجر" } as never,
          runtime,
          products: [],
          categories: [],
          product,
        },
      }),
    ),
  );
}

describe("products sold by variant", () => {
  it("the direct-order form asks for the variant, with nothing pre-selected", () => {
    const html = renderSection(pdp_direct_order as never, withVariants);
    expect(html).toContain('data-layer="variants"');
    expect(html).toContain("XL");
    expect(html).toContain('aria-pressed="false"');
    expect(html).not.toContain('aria-pressed="true"');
  });

  it("the direct-order form shows no chooser for a plain product", () => {
    expect(renderSection(pdp_direct_order as never, base)).not.toContain('data-layer="variants"');
  });

  it("add-to-cart cannot add until a variant is chosen", () => {
    const html = renderSection(pdp_add_to_cart as never, withVariants);
    expect(html).toContain("اختر الخيار");
    // The add button is disabled while no variant is chosen…
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>(?:(?!<\/button>)[\s\S])*shopping_bag/);
    // …and a plain product needs no choice and stays addable.
    const plain = renderSection(pdp_add_to_cart as never, base);
    expect(plain).not.toContain("اختر الخيار");
    expect(plain).not.toMatch(/<button[^>]*disabled=""[^>]*>(?:(?!<\/button>)[\s\S])*shopping_bag/);
  });

  it("the product card offers no quick-add for it", () => {
    const card = (p: Product) =>
      renderToStaticMarkup(
        React.createElement(
          StoreBaseProvider,
          { base: "", children: null },
          React.createElement(SchneidersProductCard, { product: p, locale: "ar" }),
        ),
      );
    expect(card(base)).toContain("add_shopping_cart");
    expect(card(withVariants)).not.toContain("add_shopping_cart");
  });
});
