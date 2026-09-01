// Optional smoke render — proves a section component returns markup
// when fed defaultProps + a fake runtime. Skipped from the acceptance
// command (which only runs `_registry.test.ts`), but a useful safety
// net during iteration. Run with `npx vitest run sections/_render-smoke`.

import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StoreBaseProvider } from "./helpers/store-context";

import trust_strip from "./trust_strip";
import hero_image from "./hero_image";
import pdp_direct_order from "./pdp_direct_order";
import product_grid from "./product_grid";
import type { Product } from "./types";

const runtime = {
  page_id: "home" as const,
  breakpoint: "mobile" as const,
  locale: "en" as const,
  audience_segments: [],
  ab_test_arms: {},
  now: new Date("2026-05-15T00:00:00Z"),
};

const renderCtx = {
  tenant: {} as never,
  runtime,
  products: [],
  categories: [],
};

describe("section render smoke", () => {
  it("trust_strip renders pills", () => {
    const Render = trust_strip.render;
    const html = renderToStaticMarkup(
      React.createElement(
        StoreBaseProvider,
        { base: "", children: null },
        React.createElement(Render, {
          props: trust_strip.defaultProps,
          ctx: renderCtx,
        } as never),
      ),
    );
    expect(html).toContain("Cash on delivery");
    expect(html).toMatch(/bg-candy-mint/);
  });

  it("hero_image renders title + CTA", () => {
    const Render = hero_image.render;
    const html = renderToStaticMarkup(
      React.createElement(
        StoreBaseProvider,
        { base: "", children: null },
        React.createElement(Render, {
          props: hero_image.defaultProps,
          ctx: renderCtx,
        } as never),
      ),
    );
    expect(html).toContain("The new collection has arrived");
    expect(html).toContain("Shop the drop");
  });
});

// ── Honest review stats: sections render REAL ratings, never fabricated ──

const baseProduct: Product = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Test product",
  price: 25000,
  stock_quantity: 10,
  reserved_quantity: 0,
  is_archived: false,
};

const chipProps = {
  ...pdp_direct_order.defaultProps,
  rating_chip_i18n: {
    en: "Over {count} positive reviews",
    ar: "أكثر من {count} تقييم إيجابي",
  },
};

function renderPdp(product: Product): string {
  const Render = pdp_direct_order.render;
  return renderToStaticMarkup(
    React.createElement(
      StoreBaseProvider,
      { base: "", children: null },
      React.createElement(Render, {
        props: chipProps,
        ctx: { ...renderCtx, product },
      } as never),
    ),
  );
}

describe("pdp_direct_order rating chip (honest numbers)", () => {
  it("replaces {count} with the real review count and fills real stars", () => {
    const html = renderPdp({
      ...baseProduct,
      review_count: 134,
      avg_rating: 3.4,
    });
    expect(html).toContain("Over 134 positive reviews");
    // 3.4 rounds to 3 filled stars + 2 faded — never a blanket ★★★★★.
    expect(html).toContain("★★★");
    expect(html).not.toContain("★★★★★");
  });

  it("hides the chip entirely when the product has no reviews", () => {
    const html = renderPdp(baseProduct);
    expect(html).not.toContain("positive reviews");
    expect(html).not.toContain("★");
    // Sanity: the rest of the section still rendered.
    expect(html).toContain("Test product");
  });
});

describe("product_grid price_pill stars (honest numbers)", () => {
  function renderGrid(product: Product): string {
    const Render = product_grid.render;
    return renderToStaticMarkup(
      React.createElement(
        StoreBaseProvider,
        { base: "", children: null },
        React.createElement(Render, {
          props: {
            ...product_grid.defaultProps,
            card_style: "price_pill",
            show_stars: true,
          },
          ctx: { ...renderCtx, products: [product] },
        } as never),
      ),
    );
  }

  it("renders real avg stars + count when reviews exist", () => {
    const html = renderGrid({
      ...baseProduct,
      review_count: 12,
      avg_rating: 4.2,
    });
    expect(html).toContain("(12)");
    expect(html).toContain('aria-label="4.2 / 5"');
  });

  it("renders no stars for a product without reviews, even with show_stars on", () => {
    const html = renderGrid(baseProduct);
    expect(html).not.toContain("aria-label=");
    expect(html).not.toContain("(0)");
    expect(html).toContain("Test product");
  });
});
