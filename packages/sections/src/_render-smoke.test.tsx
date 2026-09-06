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
import policy_content from "./policy_content";
import search_results_grid from "./search_results_grid";
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
    // Phase 1C: pills read semantic tokens, never the Candy palette.
    expect(html).toContain("var(--bk-success");
    expect(html).not.toMatch(/bg-candy-/);
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
    // 3.4 rounds to 3 filled stars + 2 faded — never a blanket 5/5. The
    // `Stars` primitive draws SVGs: filled = accent fill, empty = faint ink.
    expect(html).toContain('aria-label="3.4 / 5"');
    expect(html.match(/fill="var\(--bk-accent/g)?.length).toBe(3);
    expect(html.match(/fill="var\(--bk-ink-faint/g)?.length).toBe(2);
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

// ── Phase 0 (signature audit): PDP layout + honest urgency ──

describe("pdp_direct_order gallery layout (P0-1)", () => {
  it("clamps both grid columns so a long thumbnail strip cannot widen the page", () => {
    const Render = pdp_direct_order.render;
    const html = renderToStaticMarkup(
      React.createElement(
        StoreBaseProvider,
        { base: "", children: null },
        React.createElement(Render, {
          props: { ...pdp_direct_order.defaultProps, show_gallery: true },
          ctx: {
            ...renderCtx,
            product: {
              ...baseProduct,
              image_url: "https://example.com/main.jpg",
              gallery_urls: Array.from(
                { length: 12 },
                (_, i) => `https://example.com/g${i}.jpg`,
              ),
            },
          },
        } as never),
      ),
    );
    expect(html).toContain("grid-cols-[minmax(0,1fr)]");
    expect(html).toContain("lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]");
    // Gallery column, thumbnail strip and order card all opt out of the
    // min-width:auto grid default.
    expect(html.match(/min-w-0/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    // The form is addressable by the sticky bar's scroll_to_form kind.
    expect(html).toContain('id="direct-order"');
  });
});

describe("pdp_direct_order stock urgency threshold (P1-4)", () => {
  const urgencyProps = {
    ...pdp_direct_order.defaultProps,
    stock_urgency_i18n: { en: "Only {count} left", ar: "باقي {count}" },
  };
  function renderUrgency(stock: number, max?: number): string {
    const Render = pdp_direct_order.render;
    return renderToStaticMarkup(
      React.createElement(
        StoreBaseProvider,
        { base: "", children: null },
        React.createElement(Render, {
          props:
            max === undefined
              ? urgencyProps
              : { ...urgencyProps, urgency_max_stock: max },
          ctx: {
            ...renderCtx,
            product: { ...baseProduct, stock_quantity: stock },
          },
        } as never),
      ),
    );
  }
  it("shows the line at or below the threshold", () => {
    expect(renderUrgency(5)).toContain("Only 5 left");
    expect(renderUrgency(10)).toContain("Only 10 left");
  });
  it("hides the line above the threshold (51 units is not scarcity)", () => {
    expect(renderUrgency(51)).not.toContain("left");
  });
  it("honours a custom threshold and 0 = never", () => {
    expect(renderUrgency(51, 100)).toContain("Only 51 left");
    expect(renderUrgency(1, 0)).not.toContain("left");
  });
});

// ── Phase 1C (signature audit): commerce sections tokenised ──

describe("policy_content (P1-9, P3-11)", () => {
  function renderPolicy(
    extra: Partial<typeof policy_content.defaultProps>,
  ): string {
    const Render = policy_content.render;
    return renderToStaticMarkup(
      React.createElement(
        StoreBaseProvider,
        { base: "", children: null },
        React.createElement(Render, {
          props: { ...policy_content.defaultProps, ...extra },
          ctx: renderCtx,
        } as never),
      ),
    );
  }

  it("renders the policy title as the page h1 with an eyebrow", () => {
    const html = renderPolicy({});
    expect(html).toMatch(/<h1[^>]*>Our policy<\/h1>/);
    expect(html).toContain("Policies");
    expect(html).not.toContain("scribble-underline");
  });

  it("hides the last-updated line without a date, and formats it when set", () => {
    expect(renderPolicy({})).not.toContain("Last updated");
    const html = renderPolicy({ last_updated: "2026-09-01" });
    expect(html).toContain("Last updated");
    // React keeps the camelCase attribute name in static markup.
    expect(html).toContain('dateTime="2026-09-01"');
    expect(html).toContain("September 1, 2026");
  });

  it("renders [text](url) links for safe schemes only", () => {
    const html = renderPolicy({
      body_md_i18n: {
        en: "Call [us](tel:+9647700000000) or [visit](https://example.com). Never [this](javascript:alert(1)).",
      },
    });
    expect(html).toContain('href="tel:+9647700000000"');
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).not.toContain("javascript:");
    expect(html).toContain("this");
  });
});

describe("search_results_grid (P0-7 partial)", () => {
  it("renders a GET search form and localised card copy", () => {
    const Render = search_results_grid.render;
    const html = renderToStaticMarkup(
      React.createElement(
        StoreBaseProvider,
        { base: "/s/demo", children: null },
        React.createElement(Render, {
          props: search_results_grid.defaultProps,
          ctx: {
            ...renderCtx,
            runtime: { ...runtime, locale: "ar" },
            products: [baseProduct],
          },
        } as never),
      ),
    );
    expect(html).toContain('action="/s/demo/search"');
    expect(html).toContain('name="q"');
    expect(html).toContain("اشترِ الآن");
    expect(html).not.toContain("Buy Now");
  });
});
