// Phase 2E (signature audit) — PDP social proof + cross-sell + sticky bar.
// Static-markup renders only (no DOM lib in this package): each case pins
// a structural guarantee — SSR reviews without a fetch, gallery alt text,
// bestseller ordering / self-exclusion / limits, mobile snap carousel,
// price-aware sticky bar — so a later restyle cannot quietly regress it.

import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StoreBaseProvider } from "./helpers/store-context";

import product_reviews from "./product_reviews";
import image_gallery from "./image_gallery";
import product_grid from "./product_grid";
import collection_trio from "./collection_trio";
import sticky_cta_bar from "./sticky_cta_bar";
import type { SectionDefinition, SectionRenderContext } from "./_types";
import type { Product, ReviewSummaryItem } from "./types";

const runtime = {
  page_id: "product" as const,
  breakpoint: "mobile" as const,
  locale: "ar" as const,
  audience_segments: [],
  ab_test_arms: {},
  now: new Date("2026-09-07T00:00:00Z"),
};

const tenant = {
  id: "11111111-1111-4111-8111-000000000001",
  business_name: "متجر",
  store_config: { contact: { whatsapp_number: "07701234567" } },
};

const baseCtx = {
  tenant: tenant as never,
  runtime,
  products: [],
  categories: [],
};

function render<P>(
  def: SectionDefinition<P>,
  props: P,
  ctx: Partial<SectionRenderContext> = {},
): string {
  const Render = def.render;
  return renderToStaticMarkup(
    React.createElement(
      StoreBaseProvider,
      { base: "", children: null },
      React.createElement(Render, { props, ctx: { ...baseCtx, ...ctx } }),
    ),
  );
}

const baseProduct: Product = {
  id: "22222222-2222-4222-8222-222222222220",
  name: "عطر تجريبي",
  price: 25000,
  stock_quantity: 10,
  reserved_quantity: 0,
  is_archived: false,
};

function productN(i: number, extra: Partial<Product> = {}): Product {
  return {
    ...baseProduct,
    id: `${baseProduct.id.slice(0, -1)}${i}`,
    name: `منتج ${i}`,
    slug: `p-${i}`,
    display_order: i,
    ...extra,
  };
}

/** Product links in the rendered grid, in document order. */
function productHrefs(html: string): string[] {
  return (html.match(/href="\/products\/[^"]+"/g) ?? []).map((h) =>
    h.slice('href="/products/'.length, -1),
  );
}

describe("product_reviews — SSR list from product.reviews", () => {
  const reviews: ReviewSummaryItem[] = [
    {
      id: "r1",
      product_id: baseProduct.id,
      rating: 5,
      title: "رائع",
      body: "ثبات ممتاز",
      author_name: "سارة",
      photo_urls: ["https://images.unsplash.com/review-1"],
      created_at: "2026-09-01T00:00:00Z",
    },
    {
      id: "r2",
      product_id: baseProduct.id,
      rating: 4,
      title: null,
      body: "حلو",
      author_name: "علي",
      photo_urls: [],
      created_at: "2026-08-01T00:00:00Z",
    },
    {
      id: "r3",
      product_id: baseProduct.id,
      rating: 5,
      title: null,
      body: null,
      author_name: null,
      photo_urls: [],
      created_at: "2026-07-01T00:00:00Z",
    },
  ];

  it("paints names, stars, distribution and photos in the static HTML", () => {
    const html = render(product_reviews, product_reviews.defaultProps, {
      product: { ...baseProduct, review_count: 3, avg_rating: 4.67, reviews },
    });
    expect(html).toContain("سارة");
    expect(html).toContain("علي");
    expect(html).toContain("مشترٍ موثّق");
    expect(html).toContain('aria-label="5 / 5"');
    expect(html).toContain('aria-label="4 / 5"');
    // Average + count from the list itself (4.67 → 4.7, 3 reviews).
    expect(html).toContain("4.7");
    expect(html).toContain("3 تقييمات");
    // Distribution computed from the SSR list: two 5★, one 4★, no 3★.
    expect(html).toContain('data-star-count="5">2<');
    expect(html).toContain('data-star-count="4">1<');
    expect(html).toContain('data-star-count="3">0<');
    // Title is a heading, photo is a tap-to-enlarge button + native dialog.
    expect(html).toContain("<h3");
    expect(html).toContain("رائع");
    expect(html).toContain("تكبير الصورة");
    expect(html).toContain("<dialog");
    expect(html.match(/<img/g)).toHaveLength(1);
  });

  it("hides the distribution bars when only the aggregate is known", () => {
    const html = render(product_reviews, product_reviews.defaultProps, {
      product: { ...baseProduct, review_count: 12, avg_rating: 4.2 },
    });
    expect(html).toContain("4.2");
    expect(html).toContain("12 تقييماً");
    expect(html).not.toContain("data-star-count");
  });

  it("renders a custom photo picker with the native input visually hidden", () => {
    const html = render(product_reviews, product_reviews.defaultProps, {
      product: { ...baseProduct, reviews: [] },
    });
    expect(html).toContain("كن أول من يقيّم هذا المنتج");
    expect(html).toContain("أضف صور (حتى 4)");
    expect(html).toMatch(/<input[^>]*type="file"[^>]*class="sr-only"/);
    expect(html).toMatch(/<input[^>]*type="file"[^>]*aria-label="/);
  });
});

describe("image_gallery — alt_i18n", () => {
  it("uses alt_i18n, then the caption, then an empty alt", () => {
    const html = render(image_gallery, {
      ...image_gallery.defaultProps,
      layout: "carousel",
      images: [
        {
          url: "https://images.unsplash.com/a",
          caption_i18n: { ar: "تعليق" },
          alt_i18n: { ar: "محادثة واتساب مع زبونة" },
        },
        { url: "https://images.unsplash.com/b", caption_i18n: { ar: "ب" } },
        { url: "https://images.unsplash.com/c" },
      ],
    });
    expect(html).toContain('alt="محادثة واتساب مع زبونة"');
    expect(html).toContain('alt="ب"');
    expect(html).toContain('alt=""');
    expect(html).toContain('aria-roledescription="carousel"');
    expect(html).toContain("snap-mandatory");
    // Desktop-only prev/next arrows target the track.
    expect(html).toContain('aria-label="الصور السابقة"');
    expect(html).toContain('aria-label="الصور التالية"');
    const trackId = html.match(/<div id="([^"]+)" class="flex gap-bk-md/)?.[1];
    expect(trackId).toBeDefined();
    expect(html).toContain(`aria-controls="${trackId}"`);
    expect(html).toMatch(/hidden sm:flex/);
  });

  it("still parses stored configs without alt_i18n", () => {
    expect(
      image_gallery.schema.safeParse(image_gallery.defaultProps).success,
    ).toBe(true);
  });
});

describe("product_grid — bestseller sort, self-exclusion, limit", () => {
  const pill = {
    ...product_grid.defaultProps,
    card_style: "price_pill" as const,
  };

  it("ranks flagged bestsellers first, then display_order", () => {
    const products = [
      productN(3),
      productN(1),
      productN(4, { is_bestseller: true }),
      productN(2, { is_bestseller: true }),
    ];
    const html = render(
      product_grid,
      { ...pill, query: { sort: "bestsellers" } },
      { products, runtime: { ...runtime, page_id: "home" } },
    );
    expect(productHrefs(html)).toEqual(["p-2", "p-4", "p-1", "p-3"]);
  });

  it("never cross-sells the product being viewed", () => {
    const products = [productN(1), productN(2), productN(3)];
    const html = render(
      product_grid,
      { ...pill, query: { sort: "bestsellers", limit: 8 } },
      { products, product: products[1] },
    );
    expect(productHrefs(html)).toEqual(["p-1", "p-3"]);
  });

  it("honours query.limit on a category page and offers show more", () => {
    const products = [1, 2, 3, 4, 5].map((i) => productN(i));
    const category = {
      id: "cat-1",
      tenant_id: tenant.id,
      name: "عطور",
      slug: "perfumes",
    };
    const html = render(
      product_grid,
      { ...pill, query: { sort: "newest", limit: 2 } },
      {
        products,
        category: category as never,
        runtime: { ...runtime, page_id: "category" },
      },
    );
    expect(productHrefs(html)).toHaveLength(2);
    expect(html).toContain("عرض المزيد");
    expect(html).toContain("(3)");
  });

  it("renders no show-more when the catalogue fits the limit", () => {
    const products = [1, 2].map((i) => productN(i));
    const html = render(
      product_grid,
      { ...pill, query: { sort: "newest", limit: 24 } },
      {
        products,
        category: {
          id: "c",
          tenant_id: tenant.id,
          name: "x",
          slug: "x",
        } as never,
        runtime: { ...runtime, page_id: "category" },
      },
    );
    expect(productHrefs(html)).toHaveLength(2);
    expect(html).not.toContain("عرض المزيد");
  });
});

describe("collection_trio — mobile snap carousel", () => {
  it("emits the snap track + 85vw cards, grid from sm: up", () => {
    const html = render(collection_trio, collection_trio.defaultProps, {
      runtime: { ...runtime, page_id: "home" },
    });
    const track = html.match(
      /<div class="flex snap-x snap-mandatory[^"]*"/,
    )?.[0];
    expect(track).toBeDefined();
    expect(track).toContain("overflow-x-auto");
    expect(track).toContain("scroll-px-4");
    expect(track).toContain("[scrollbar-width:none]");
    expect(track).toContain("sm:grid");
    expect(track).toContain("sm:grid-cols-3");
    expect(
      html.match(/w-\[85vw\] shrink-0 snap-start sm:w-auto/g),
    ).toHaveLength(3);
    expect(html).not.toContain("<script");
  });
});

describe("sticky_cta_bar — product price", () => {
  const props = {
    ...sticky_cta_bar.defaultProps,
    primary_kind: "scroll_to_form" as const,
    primary_label_i18n: { ar: "اطلب الآن", en: "Order now" },
    show_product_price: true,
  };

  it("shows the live price (and struck compare-at) beside the button", () => {
    const html = render(sticky_cta_bar, props, {
      product: { ...baseProduct, price: 25000, compare_at_price: 33000 },
    });
    expect(html).toContain("data-product-price");
    expect(html).toContain("tabular-nums");
    expect(html).toMatch(/<s[^>]*>.*33,000/);
    expect(html).toContain("25,000");
    expect(html).toContain("اطلب الآن");
    // SSR renders the bar visible; hiding is a client-side observer.
    expect(html).not.toContain("translate-y-full");
    expect(html).not.toContain('aria-hidden="true" inert');
  });

  it("stays price-free when the flag is off or no product is in ctx", () => {
    expect(
      render(
        sticky_cta_bar,
        { ...props, show_product_price: false },
        {
          product: baseProduct,
        },
      ),
    ).not.toContain("data-product-price");
    expect(render(sticky_cta_bar, props)).not.toContain("data-product-price");
  });
});

// ── Real bestseller ranking (P2-6) ──

describe("product_grid bestsellers uses the real sales rank", () => {
  function renderBestsellers(products: Product[]): string {
    const Render = product_grid.render;
    return renderToStaticMarkup(
      React.createElement(
        StoreBaseProvider,
        { base: "", children: null },
        React.createElement(Render, {
          props: {
            ...product_grid.defaultProps,
            mode: "auto",
            card_style: "price_pill",
            query: { sort: "bestsellers", limit: 10 },
          },
          ctx: { ...baseCtx, products },
        } as never),
      ),
    );
  }

  const mk = (
    name: string,
    extra: Partial<Product> & { bestseller_rank?: number | null },
  ): Product =>
    ({
      id: name,
      name,
      price: 10000,
      stock_quantity: 5,
      reserved_quantity: 0,
      is_archived: false,
      slug: name,
      ...extra,
    }) as Product;

  it("ranks by sales, not the merchant's display order", () => {
    // Mirrors the live store before this shipped: the manual order led with
    // a product that had sold 13 units while the real best seller sat last.
    const html = renderBestsellers([
      mk("manual-first", { display_order: 1, bestseller_rank: 7 }),
      mk("real-best", { display_order: 9, bestseller_rank: 1 }),
      mk("mid", { display_order: 5, bestseller_rank: 3 }),
    ]);
    const order = ["real-best", "mid", "manual-first"].map((n) =>
      html.indexOf(n),
    );
    expect(order[0]).toBeGreaterThan(-1);
    expect(order[0]).toBeLessThan(order[1]);
    expect(order[1]).toBeLessThan(order[2]);
  });

  it("puts never-sold products after ranked ones", () => {
    const html = renderBestsellers([
      mk("never-sold", { display_order: 1 }),
      mk("sold", { display_order: 8, bestseller_rank: 2 }),
    ]);
    expect(html.indexOf("sold")).toBeLessThan(html.indexOf("never-sold"));
  });

  it("falls back to display_order when nothing is ranked", () => {
    const html = renderBestsellers([
      mk("second", { display_order: 2 }),
      mk("first", { display_order: 1 }),
    ]);
    expect(html.indexOf("first")).toBeLessThan(html.indexOf("second"));
  });
});
