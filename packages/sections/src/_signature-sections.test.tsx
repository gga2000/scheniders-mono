// Phase 1B (signature audit) — shared primitives + touch/motion adoption
// across the signature sections. Static-markup renders only (no DOM lib in
// this package): each case pins a structural guarantee the audit called
// out, so a future "quick restyle" cannot quietly regress it.

import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StoreBaseProvider } from "./helpers/store-context";
import { formatCount } from "./helpers/format";

import pillars_grid from "./pillars_grid";
import faq_contact_split from "./faq_contact_split";
import product_reviews from "./product_reviews";
import countdown_announcement from "./countdown_announcement";
import hero_card_float from "./hero_card_float";
import product_grid from "./product_grid";
import image_gallery from "./image_gallery";
import testimonial_cards from "./testimonial_cards";
import trust_badge_row from "./trust_badge_row";
import category_spotlight_pair from "./category_spotlight_pair";
import type { SectionDefinition, SectionRenderContext } from "./_types";
import type { Product } from "./types";

const runtime = {
  page_id: "home" as const,
  breakpoint: "mobile" as const,
  locale: "ar" as const,
  audience_segments: [],
  ab_test_arms: {},
  now: new Date("2026-09-07T00:00:00Z"),
};

const tenant = {
  id: "tenant-1",
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

/** Every `<a …>…</a>` slice of the markup. */
function anchors(html: string): string[] {
  return html.match(/<a\b[^>]*>[\s\S]*?<\/a>/g) ?? [];
}

const baseProduct: Product = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "عطر تجريبي",
  price: 25000,
  stock_quantity: 10,
  reserved_quantity: 0,
  is_archived: false,
};

describe("CenteredSectionHeader adoption", () => {
  it("pillars_grid renders the eyebrow chip + an h2 on the fluid scale with i18n hooks", () => {
    const html = render(pillars_grid, pillars_grid.defaultProps);
    expect(html).toContain('data-i18n-field="eyebrow_i18n"');
    expect(html).toContain("ميزاتنا");
    const h2 = html.match(/<h2[^>]*data-i18n-field="title_i18n"[^>]*>/)?.[0];
    expect(h2).toBeDefined();
    expect(h2).toContain("text-bk-h2");
    expect(h2).toContain("text-balance");
    expect(html).toContain("ليش تختارنا؟");
    // The old hand-rolled sizes are gone.
    expect(html).not.toMatch(/text-3xl|sm:text-4xl/);
  });

  it("pillars_grid survives a single pillar (was .min(2))", () => {
    const one = {
      ...pillars_grid.defaultProps,
      items: pillars_grid.defaultProps.items.slice(0, 1),
    };
    expect(pillars_grid.schema.safeParse(one).success).toBe(true);
  });
});

describe("faq_contact_split — native <details>", () => {
  it("keeps closed answers in the markup and gives every row the same name", () => {
    const html = render(faq_contact_split, faq_contact_split.defaultProps);
    const details = html.match(/<details\b[^>]*>/g) ?? [];
    expect(details).toHaveLength(faq_contact_split.defaultProps.items.length);
    // Exactly one row is open by default…
    expect(details.filter((d) => /\bopen(=""|\s|>)/.test(d))).toHaveLength(1);
    // …and every row shares one exclusive-open group.
    const names = new Set(
      details.map((d) => d.match(/name="([^"]+)"/)?.[1] ?? ""),
    );
    expect(names.size).toBe(1);
    expect([...names][0]).toMatch(/^faq-/);
    // Closed answers are still server-rendered (FAQ rich results).
    for (const item of faq_contact_split.defaultProps.items) {
      expect(html).toContain(item.a_i18n.ar);
    }
    expect(html).not.toContain("<button");
  });

  it("renders the WhatsApp CTA as the shared primitive on --bk-success", () => {
    const html = render(faq_contact_split, faq_contact_split.defaultProps);
    const wa = anchors(html).find((a) => a.includes("wa.me/9647701234567"));
    expect(wa).toBeDefined();
    expect(wa).toContain("var(--bk-success");
    expect(wa).not.toContain("--bk-mint");
    expect(wa).toContain('data-i18n-field="contact.cta_label_i18n"');
  });
});

describe("product_reviews — zero-review state", () => {
  it("shows one honest line + the form, never 0.0 or empty bars", () => {
    const html = render(product_reviews, product_reviews.defaultProps, {
      product: baseProduct,
    });
    expect(html).toContain("كن أول من يقيّم هذا المنتج");
    expect(html).not.toContain("0.0");
    expect(html).not.toContain('aria-label="5 / 5"');
    expect(html).toContain("<form");
    expect(html).not.toMatch(/text-red-\d+/);
  });

  it("renders the real average with shared SVG stars when reviews exist", () => {
    const html = render(product_reviews, product_reviews.defaultProps, {
      product: { ...baseProduct, review_count: 12, avg_rating: 4.2 },
    });
    expect(html).toContain("4.2");
    expect(html).toContain('aria-label="4.2 / 5"');
    expect(html).toContain("12 تقييماً");
    expect(html).not.toContain("★");
    expect(html).not.toContain('material-symbols-outlined">star');
  });
});

describe("countdown_announcement — hydration-safe placeholder", () => {
  it("renders -- for every unit on the server, never 00", () => {
    const html = render(
      countdown_announcement,
      countdown_announcement.defaultProps,
    );
    expect(html.match(/>--</g)).toHaveLength(3);
    expect(html).not.toContain(">00<");
    expect(html).toContain("text-[11px]");
    expect(html).not.toContain("text-[9px]");
    expect(html).toContain("var(--bk-on-secondary");
    expect(html).not.toContain("color:#ffffff");
  });
});

describe("hero_card_float — link CTAs", () => {
  const props = {
    ...hero_card_float.defaultProps,
    bg_image_url: "https://images.unsplash.com/photo-1",
  };

  it("never nests a <button> inside an <a>", () => {
    const html = render(hero_card_float, props);
    expect(html).not.toContain("<button");
    const links = anchors(html);
    expect(links.length).toBeGreaterThanOrEqual(2);
    expect(links.some((a) => a.includes("<button"))).toBe(false);
  });

  it("uses the shared WhatsApp primitive for the secondary CTA", () => {
    const html = render(hero_card_float, props);
    const wa = anchors(html).find((a) => a.includes("wa.me/9647701234567"));
    expect(wa).toBeDefined();
    expect(wa).toContain("var(--bk-success");
    expect(wa).toContain('data-i18n-field="secondary_cta_label_i18n"');
  });

  it("stacks the photo above the card on mobile and keeps it as the LCP", () => {
    const html = render(hero_card_float, props);
    expect(html).toMatch(/sm:absolute[^"]*aspect-\[5\/4\]/);
    // `priority` surfaces as a preload hint in static SSR output.
    expect(html).toContain('<link rel="preload" as="image"');
    const h1 = html.match(/<h1[^>]*>/)?.[0];
    expect(h1).toContain("text-bk-h1");
    expect(h1).toContain("text-balance");
  });

  it("crops the mobile photo landscape unless the merchant says otherwise", () => {
    // A landscape source in a portrait box makes `cover` upscale a
    // downscaled candidate — a blurred LCP — and slice the subject.
    expect(render(hero_card_float, props)).toContain("aspect-[5/4]");
    expect(
      render(hero_card_float, { ...props, media_ratio: "portrait" as const }),
    ).toContain("aspect-[4/5]");
    expect(
      render(hero_card_float, { ...props, media_ratio: "square" as const }),
    ).toContain("aspect-square");
  });

  it("asks for a taller candidate below sm so the LCP is never upscaled", () => {
    const html = render(hero_card_float, props);
    expect(html).toContain('sizes="(max-width: 639px) 125vw, 100vw"');
  });

  it("emits no object-position until a focal point is set", () => {
    expect(render(hero_card_float, props)).not.toContain("object-position");
    const shifted = render(hero_card_float, {
      ...props,
      focal_x: "left" as const,
    });
    expect(shifted).toMatch(/object-position:\s*left center/);
    const both = render(hero_card_float, {
      ...props,
      focal_x: "right" as const,
      focal_y: "top" as const,
    });
    expect(both).toMatch(/object-position:\s*right top/);
  });

  it("shades only the card's side of the photo, in brand ink not black", () => {
    const html = render(hero_card_float, {
      ...props,
      card_align: "end" as const,
    });
    // The old flat wash dulled the product for no gain — the card is opaque.
    expect(html).not.toContain("bg-black/15");
    expect(html).toContain("linear-gradient(to left");
    expect(html).toContain("var(--bk-ink");
    expect(html).not.toMatch(/linear-gradient\([^)]*rgba?\(0/);
    expect(
      render(hero_card_float, { ...props, card_align: "start" as const }),
    ).toContain("linear-gradient(to right");
  });

  it("gives both hero CTAs the same edge on mobile", () => {
    const html = render(hero_card_float, props);
    const [primary, secondary] = anchors(html);
    expect(primary).toContain("w-full");
    expect(primary).toContain("sm:w-auto");
    expect(secondary).toContain("wa.me/");
    expect(secondary).toContain("w-full");
    expect(secondary).toContain("sm:w-auto");
  });

  it("puts the real best discount in the offer badge", () => {
    const onSale: Product[] = [
      { ...baseProduct, id: `${baseProduct.id.slice(0, -1)}1`, price: 38500, compare_at_price: 60000 },
      { ...baseProduct, id: `${baseProduct.id.slice(0, -1)}2`, price: 31000, compare_at_price: 45000 },
    ];
    const html = render(
      hero_card_float,
      {
        ...props,
        offer_badge: "max_discount" as const,
        badge_i18n: { ar: "خصم لحد {pct}", en: "Up to {pct} off" },
      },
      { products: onSale },
    );
    // 60000 -> 38500 is 36%; 45000 -> 31000 is 31%. The badge takes the best.
    // The number is isolated so the Arabic percent sign cannot drift off it.
    // Sign lives INSIDE the isolate, or bidi drags it off its number.
    expect(html).toContain("خصم لحد <bdi>36٪</bdi>");
    expect(html).not.toContain("{pct}");
  });

  it("prefers the catalogue-wide discount over the loaded slice", () => {
    // The page loads 24 of 43 products. A deeper discount outside that
    // slice must still be what "up to N%" reports, or the hero silently
    // understates the moment the catalogue outgrows the fetch limit.
    const sliceOnly: Product[] = [
      { ...baseProduct, price: 90, compare_at_price: 100 }, // 10% in-slice
    ];
    const html = render(
      hero_card_float,
      {
        ...props,
        offer_badge: "max_discount" as const,
        badge_i18n: { ar: "خصم لحد {pct}", en: "Up to {pct} off" },
      },
      { products: sliceOnly, max_discount_percent: 36 },
    );
    expect(html).toContain("36٪");
    expect(html).not.toContain("10٪");
  });

  it("falls back to the loaded products when no catalogue figure is given", () => {
    const html = render(
      hero_card_float,
      {
        ...props,
        offer_badge: "max_discount" as const,
        badge_i18n: { ar: "خصم لحد {pct}", en: "Up to {pct} off" },
      },
      { products: [{ ...baseProduct, price: 90, compare_at_price: 100 }] },
    );
    expect(html).toContain("10٪");
  });

  it("shows no offer badge when nothing is actually discounted", () => {
    const template = { ar: "خصم لحد {pct}", en: "Up to {pct} off" };
    const fullPrice: Product[] = [
      { ...baseProduct, price: 25000, compare_at_price: null },
      // compare_at BELOW price is not a discount, and a zero price is not
      // 100% off — neither may produce a badge.
      { ...baseProduct, id: `${baseProduct.id.slice(0, -1)}3`, price: 25000, compare_at_price: 20000 },
      { ...baseProduct, id: `${baseProduct.id.slice(0, -1)}4`, price: 0, compare_at_price: 50000 },
    ];
    const html = render(
      hero_card_float,
      { ...props, offer_badge: "max_discount" as const, badge_i18n: template },
      { products: fullPrice },
    );
    expect(html).not.toContain("{pct}");
    expect(html).not.toContain("خصم لحد");
    expect(html).not.toContain('data-i18n-field="badge_i18n"');
  });

  it("never leaks the raw {pct} token when the badge is static", () => {
    const html = render(hero_card_float, {
      ...props,
      badge_i18n: { ar: "خصم لحد {pct}", en: "Up to {pct} off" },
    });
    // offer_badge unset — no live number exists, so the chip stays away
    // rather than rendering a placeholder at a shopper.
    expect(html).not.toContain("{pct}");
  });

  it("leaves a plain badge untouched when there is no {pct} token", () => {
    const html = render(hero_card_float, {
      ...props,
      badge_i18n: { ar: "الدفع عند الاستلام", en: "Cash on delivery" },
    });
    expect(html).toContain("الدفع عند الاستلام");
  });

  it("keeps the offer chip out of the card/photo seam on mobile", () => {
    const html = render(
      hero_card_float,
      {
        ...props,
        offer_badge: "max_discount" as const,
        badge_i18n: { ar: "خصم لحد {pct}", en: "Up to {pct} off" },
      },
      { products: [{ ...baseProduct, price: 38500, compare_at_price: 60000 }] },
    );
    const chip = html.match(/<span[^>]*data-i18n-field="badge_i18n"[^>]*>/)?.[0];
    expect(chip).toBeDefined();
    // In flow on mobile (the card already overlaps the photo there),
    // corner-overlapped only from `sm` up where the card floats free.
    expect(chip).toContain("mb-3");
    expect(chip).toContain("sm:absolute");
    expect(chip).toContain("sm:-top-4");
    expect(chip).toContain("sm:mb-0");
    expect(chip).not.toMatch(/class="[^"]*(?<!sm:)\babsolute\b/);
  });

  it("keeps defaultProps free of the new optional fields", () => {
    // A required new field silently DROPS the section at parse time for
    // every store that predates it. These must stay absent + optional.
    expect(hero_card_float.defaultProps).not.toHaveProperty("media_ratio");
    expect(hero_card_float.defaultProps).not.toHaveProperty("focal_x");
    expect(hero_card_float.defaultProps).not.toHaveProperty("focal_y");
    expect(hero_card_float.defaultProps).not.toHaveProperty("offer_badge");
    expect(
      hero_card_float.schema.safeParse(hero_card_float.defaultProps).success,
    ).toBe(true);
  });
});

describe("product_grid price_pill — priority + sold-out", () => {
  // Distinct URLs: React dedupes preload hints for an identical href.
  const products: Product[] = [0, 1, 2].map((i) => ({
    ...baseProduct,
    id: `${baseProduct.id.slice(0, -1)}${i}`,
    image_url: `https://images.unsplash.com/photo-${i}`,
  }));
  const props = {
    ...product_grid.defaultProps,
    card_style: "price_pill" as const,
  };

  it("preloads nothing when the grid sits under a hero (home)", () => {
    const html = render(product_grid, props, { products });
    expect(html).not.toContain('rel="preload"');
  });

  it("preloads only the first two cards when the grid leads the page", () => {
    const html = render(product_grid, props, {
      products,
      runtime: { ...runtime, page_id: "search" },
    });
    expect(html.match(/<link rel="preload" as="image"/g)).toHaveLength(2);
  });

  it("marks a sold-out product with a chip", () => {
    const html = render(product_grid, props, {
      products: [{ ...products[0], stock_quantity: 0 }],
    });
    expect(html).toContain("نفد المخزون");
  });
});

describe("product_grid — buyable shelf", () => {
  const p = (over: Partial<Product>): Product => ({
    ...baseProduct,
    id: `11111111-1111-4111-8111-${String(over.bestseller_rank ?? 0).padStart(12, "0")}`,
    stock_quantity: 50,
    reserved_quantity: 0,
    ...over,
  });
  const pool = [
    p({ name: "A", bestseller_rank: 1 }),
    p({ name: "B", bestseller_rank: 2, stock_quantity: 5, reserved_quantity: 12 }), // oversold
    p({ name: "C", bestseller_rank: 3 }),
  ];
  const props = {
    ...product_grid.defaultProps,
    card_style: "price_pill" as const,
    mode: "auto" as const,
    query: { sort: "bestsellers" as const, limit: 6, exclude_out_of_stock: true },
  };

  it("drops an oversold product from an auto grid", () => {
    const html = render(product_grid, props, { products: pool });
    expect(html).toContain(">A<");
    expect(html).toContain(">C<");
    expect(html).not.toContain(">B<");
  });

  it("keeps it when the flag is off", () => {
    const html = render(product_grid, {
      ...props,
      query: { sort: "bestsellers" as const, limit: 6 },
    }, { products: pool });
    expect(html).toContain(">B<");
  });

  it("falls back rather than rendering an empty grid", () => {
    // Category and thank-you pages run this section too. An empty section
    // is worse than a greyed card.
    const allOut = [p({ name: "Z", bestseller_rank: 1, stock_quantity: 0 })];
    const html = render(product_grid, props, { products: allOut });
    expect(html).toContain(">Z<");
  });

  it("chips the real discount, and nothing when there is no saving", () => {
    const onSale = p({ name: "S", bestseller_rank: 1, price: 36750, compare_at_price: 45000 });
    const flat = p({ name: "F", bestseller_rank: 2, price: 48000, compare_at_price: null });
    const html = render(product_grid, { ...props, show_discount_badge: true }, {
      products: [onSale, flat],
    });
    // 45000 -> 36750 is 18%. The seal renders the number and the sign as
    // separate glyph runs so it can size them differently, so assert the
    // runs rather than a contiguous "18٪".
    expect(html).toContain(">18<");
    expect(html).toContain(">٪<");
    // The flat-priced product gets no seal at all — not a "0٪" one.
    expect(html.match(/data-discount-seal/g) ?? []).toHaveLength(1);
  });

  it("badges low stock only at or below the threshold", () => {
    const low = p({ name: "L", bestseller_rank: 1, stock_quantity: 3, reserved_quantity: 0 });
    const fine = p({ name: "N", bestseller_rank: 2, stock_quantity: 4, reserved_quantity: 0 });
    const html = render(product_grid, { ...props, low_stock_threshold: 3 }, {
      products: [low, fine],
    });
    const badges = html.match(/data-low-stock/g) ?? [];
    expect(badges).toHaveLength(1);
  });

  it("never badges a negative remainder as a number", () => {
    const oversold = p({ name: "O", bestseller_rank: 1, stock_quantity: 5, reserved_quantity: 12 });
    const html = render(product_grid, {
      ...props,
      low_stock_threshold: 3,
      query: { sort: "bestsellers" as const, limit: 6 },
    }, { products: [oversold] });
    expect(html).not.toContain("-7");
    expect(html).not.toContain("data-low-stock");
  });

  it("reserves the meta row so cards share a baseline", () => {
    // Two of eight cards having a star row and six not is what made the
    // old row read as separate objects rather than one shelf.
    const withReviews = p({ name: "R", bestseller_rank: 1, review_count: 6, avg_rating: 5 });
    const without = p({ name: "W", bestseller_rank: 2, review_count: 0 });
    const html = render(product_grid, { ...props, show_stars: true }, {
      products: [withReviews, without],
    });
    const rows = html.match(/data-meta-row/g) ?? [];
    expect(rows).toHaveLength(2);
  });

  it("reserves enough height for the tallest thing each row can hold", () => {
    // Measured in a browser: the star row is 21px, so a 20px floor left the
    // two cards that have reviews 1px taller than the other four at 1512.
    // The name used to need a two-line floor of its own for the same
    // reason: a short name (ايبسكو) sat a whole line higher than a long one,
    // 17px apart at 390. It no longer does, because the name now sits
    // INSIDE the fixed-ratio photograph, where its length cannot move the
    // card's height at all — a stronger guarantee than a min-height.
    const html = render(product_grid, props, {
      products: [p({ name: "A", bestseller_rank: 1 })],
    });
    expect(html).toContain("min-h-[22px]");
    const photo = html.slice(html.indexOf("data-photo"), html.indexOf("data-price-line"));
    expect(photo).toContain("aspect-square");
    expect(photo).toContain("<h3");
  });

  it("keeps the new fields out of defaultProps", () => {
    expect(product_grid.defaultProps).not.toHaveProperty("low_stock_threshold");
    expect(product_grid.defaultProps).not.toHaveProperty("show_discount_badge");
    expect(product_grid.schema.safeParse(product_grid.defaultProps).success).toBe(true);
  });
});

describe("image_gallery — tokens + carousel semantics", () => {
  it("renders one neutral placeholder frame for the untouched defaults (editor canvas)", () => {
    const html = render(image_gallery, image_gallery.defaultProps);
    expect(html).toContain("data-gallery-placeholder");
    expect(html).toContain("ألبوم صور");
    expect(html).not.toContain("<img");
    expect(html).toContain("var(--bk-surface-alt");
  });

  it("drops empty-url entries and returns nothing once the list was edited", () => {
    // Same empty urls, but a merchant-edited list (one entry removed).
    expect(
      render(image_gallery, {
        ...image_gallery.defaultProps,
        images: image_gallery.defaultProps.images.slice(0, 3),
      }),
    ).toBe("");
    expect(
      render(image_gallery, { ...image_gallery.defaultProps, images: [] }),
    ).toBe("");
  });

  it("frames real images with tokens and labels the carousel", () => {
    const html = render(image_gallery, {
      ...image_gallery.defaultProps,
      layout: "carousel",
      images: [
        { url: "https://images.unsplash.com/a" },
        { url: "" },
        { url: "https://cdn.example.com/b" },
      ],
    });
    expect(html).toContain('aria-roledescription="carousel"');
    expect(html).toContain("scroll-px-4");
    expect(html.match(/<img/g)).toHaveLength(2);
    expect(html).not.toContain('rel="preload"');
    expect(html).not.toMatch(/candy-ink|shadow-bento/);
    expect(html).toContain('sizes="280px"');
  });
});

describe("formatCount (Intl.PluralRules)", () => {
  const forms = {
    one: "تقييم واحد",
    two: "تقييمان",
    few: "{count} تقييمات",
    many: "{count} تقييماً",
    other: "{count} تقييم",
  };
  it("picks the Arabic category for each count", () => {
    expect(formatCount(1, "ar", forms)).toBe("تقييم واحد");
    expect(formatCount(2, "ar", forms)).toBe("تقييمان");
    expect(formatCount(3, "ar", forms)).toBe("3 تقييمات");
    expect(formatCount(11, "ar", forms)).toBe("11 تقييماً");
    expect(formatCount(100, "ar", forms)).toBe("100 تقييم");
    expect(formatCount(2, "ku", forms)).toBe("تقييمان");
  });
  it("falls back to `other` for a missing category", () => {
    expect(
      formatCount(2, "en", { one: "1 review", other: "{count} reviews" }),
    ).toBe("2 reviews");
  });
});

describe("trust_badge_row — one object, one measure", () => {
  const props = {
    ...trust_badge_row.defaultProps,
    items: trust_badge_row.defaultProps.items.map((it, i) => ({
      ...it,
      icon_url: `https://cdn.example.com/icon-${i}.svg`,
    })),
  };

  it("seats every merchant icon on an identical disc", () => {
    const html = render(trust_badge_row, props);
    // Merchant SVGs differ in stroke weight and optical size; the disc is
    // what makes four of them read as a set instead of clipart.
    const discs = html.match(/h-11 w-11 shrink-0 items-center justify-center rounded-full/g);
    expect(discs).toHaveLength(props.items.length);
    expect(html).toContain("var(--bk-accent");
    // Icon sits INSIDE the disc, at a uniform size.
    expect(html).toMatch(/rounded-full"[^>]*>[\s\S]{0,200}?class="h-6 w-6 object-contain"/);
  });

  it("start-aligns each badge so the mobile columns share an edge", () => {
    const html = render(trust_badge_row, props);
    // Centring per cell put the four discs at four different x positions,
    // because the labels differ in width.
    expect(html).toContain("justify-start");
    expect(html).not.toContain("items-center justify-center gap-3");
  });

  it("puts the gutter outside the measure, like every other section", () => {
    const html = render(trust_badge_row, props);
    // `px-4` INSIDE `max-w-6xl` made this row 1120px against everything
    // else's 1152 — the page lined up with nothing.
    expect(html).toContain('class="px-4"');
    expect(html).toContain('class="mx-auto max-w-6xl"');
    expect(html).not.toContain("mx-auto max-w-6xl px-4");
  });
});

describe("category_spotlight_pair — the diptych", () => {
  const props = {
    ...category_spotlight_pair.defaultProps,
    items: [
      { image_url: "https://images.unsplash.com/a", label_i18n: { ar: "عطور مختارة" }, href: "/categories/picked" },
      { image_url: "https://images.unsplash.com/b", label_i18n: { ar: "الاكثر مبيعاً" }, href: "/categories/top" },
    ],
  };

  it("shares the page's content measure at 2-up", () => {
    const html = render(category_spotlight_pair, props);
    // max-w-3xl left the cards at 376px inside a 1512px viewport.
    expect(html).toContain("max-w-6xl");
    expect(html).not.toContain("max-w-3xl");
  });

  it("derives the image width hint from the column count", () => {
    const two = render(category_spotlight_pair, props);
    expect(two).toContain('sizes="(max-width: 640px) 100vw, (max-width: 1200px) 50vw, 576px"');
    const four = render(category_spotlight_pair, {
      ...props,
      items: [...props.items, ...props.items].map((it, i) => ({ ...it, href: `/c/${i}` })),
    });
    expect(four).toContain('sizes="(max-width: 640px) 50vw, (max-width: 1200px) 25vw, 288px"');
    // The old blanket hint over-fetched at every count but 2.
    expect(two).not.toContain("33vw");
  });

  it("anchors the label to the card's start corner, never floating at centre", () => {
    const html = render(category_spotlight_pair, props);
    // Centred, the label covered the product it was selling.
    expect(html).toContain("bottom-4 start-4");
    expect(html).not.toContain("bottom-4 left-1/2");
    expect(html).not.toContain("-translate-x-1/2");
  });

  it("scrims in brand ink, not black", () => {
    const html = render(category_spotlight_pair, props);
    expect(html).not.toContain("from-black/25");
    expect(html).toMatch(/linear-gradient\(to top[^"]*var\(--bk-ink/);
  });

  it("keeps the decorative side art hugging the cards, not the viewport", () => {
    const html = render(category_spotlight_pair, {
      ...props,
      side_image_left_url: "https://images.unsplash.com/l",
      side_image_right_url: "https://images.unsplash.com/r",
    });
    // Pinned to a bare full-width parent it sat at the viewport edges,
    // 356px adrift of the band it was supposed to flank.
    expect(html).toContain("-left-28");
    expect(html).toContain("-right-28");
    expect(html).not.toMatch(/absolute left-0 top-1\/2/);
    expect(html).not.toMatch(/absolute right-0 top-1\/2/);
  });
});

describe("trust_badge_row — proof ledge", () => {
  const ledgeProps = {
    band_style: "tinted" as const,
    items: [
      { icon_url: "", metric: "completed_orders" as const, label_i18n: { ar: "طلب وصل" } },
      { icon_url: "", label_i18n: { ar: "توصيل خلال ٢٤ ساعة" } },
      { icon_url: "", metric: "governorates" as const, label_i18n: { ar: "محافظة" } },
      { icon_url: "", label_i18n: { ar: "الدفع عند الاستلام" } },
    ],
  };
  const stats = { completed_orders: 2693, customers: 4465, governorates_served: 18 };

  it("renders the rounded-down count and the exact small one", () => {
    const html = render(trust_badge_row, ledgeProps, { public_stats: stats });
    expect(html).toContain("+2600");
    expect(html).toContain("18");
    expect(html).not.toContain("2693");
  });

  /** How many badge slots the row actually rendered. */
  const slotCount = (html: string) =>
    (html.match(/data-i18n-field="items\[/g) ?? []).length;

  it("drops a metric slot when there are no stats at all", () => {
    const html = render(trust_badge_row, ledgeProps);
    // Counting slots, not just looking for the missing figure: without
    // stats a metric slot must VANISH. Asserting only that "+2600" is
    // absent passes even when the slot degrades into a plain badge
    // labelled "طلب وصل" — a unit with no number, live on the page.
    expect(slotCount(html)).toBe(2);
    expect(html).not.toContain("+2600");
    expect(html).not.toContain("طلب وصل");
    expect(html).not.toContain("محافظة");
    // Static slots survive — they are merchant claims, not derived.
    expect(html).toContain("توصيل خلال ٢٤ ساعة");
    expect(html).toContain("الدفع عند الاستلام");
  });

  it("drops a metric slot whose value is zero rather than printing 0", () => {
    const html = render(trust_badge_row, ledgeProps, {
      public_stats: { completed_orders: 0, customers: 0, governorates_served: 18 },
    });
    // 3 = two static slots + the one governorate metric that has a value.
    expect(slotCount(html)).toBe(3);
    expect(html).not.toMatch(/>0</);
    expect(html).not.toContain("طلب وصل");
    expect(html).toContain("18");
  });

  it("renders every slot when every metric has a value", () => {
    const html = render(trust_badge_row, ledgeProps, { public_stats: stats });
    expect(slotCount(html)).toBe(4);
  });

  it("leaves a plain badge row untouched when no item declares a metric", () => {
    const html = render(trust_badge_row, trust_badge_row.defaultProps, { public_stats: stats });
    expect(html).not.toContain("+2600");
    expect(html).toContain("توصيل سريع");
  });

  it("keeps `metric` out of defaultProps so old configs still parse", () => {
    for (const item of trust_badge_row.defaultProps.items) {
      expect(item).not.toHaveProperty("metric");
    }
    expect(trust_badge_row.schema.safeParse(trust_badge_row.defaultProps).success).toBe(true);
  });

  it("lays the ledge on surface-alt, not the accent wash", () => {
    const html = render(trust_badge_row, { ...ledgeProps, band_style: "ledge" as const }, { public_stats: stats });
    expect(html).toContain("var(--bk-surface-alt");
    expect(html).not.toContain("var(--bk-accent, #ffd84a) 12%");
    expect(html).toContain("sm:divide-x");
  });

  it("keeps plain and tinted meaning exactly what they meant before", () => {
    const plain = render(trust_badge_row, { ...trust_badge_row.defaultProps, band_style: "plain" as const });
    expect(plain).not.toContain("var(--bk-surface-alt");
    expect(plain).not.toContain("sm:divide-x");
    const tinted = render(trust_badge_row, { ...trust_badge_row.defaultProps, band_style: "tinted" as const });
    expect(tinted).toContain("var(--bk-accent, #ffd84a) 12%");
  });
});

describe("category_spotlight_pair — occasion triptych", () => {
  const cats = [
    { id: "c1", tenant_id: "t", name: "عطور للدوام", slug: "work", description: null, image_url: "https://images.unsplash.com/w", parent_id: null, display_order: 10 },
    { id: "c2", tenant_id: "t", name: "عطور للطلعات", slug: "outings", description: null, image_url: "https://images.unsplash.com/o", parent_id: null, display_order: 11 },
    { id: "c3", tenant_id: "t", name: "عطور للمناسبات", slug: "occasions", description: null, image_url: "https://images.unsplash.com/x", parent_id: null, display_order: 12 },
  ] as never;
  // Membership, not counts — the count is the array length.
  const counts = {
    c1: Array.from({ length: 19 }, (_, i) => `w${i}`),
    c2: Array.from({ length: 19 }, (_, i) => `o${i}`),
    c3: Array.from({ length: 17 }, (_, i) => `x${i}`),
  };
  const srcProps = {
    ...category_spotlight_pair.defaultProps,
    source: "categories" as const,
    category_slugs: ["work", "outings", "occasions"],
    show_counts: true,
  };

  it("builds its doors from real categories, in the order given", () => {
    const html = render(category_spotlight_pair, srcProps, {
      categories: cats,
      category_product_ids: counts,
    });
    expect(html).toContain("عطور للدوام");
    expect(html).toContain("عطور للطلعات");
    expect(html).toContain("عطور للمناسبات");
    expect(html.indexOf("عطور للدوام")).toBeLessThan(html.indexOf("عطور للمناسبات"));
  });

  it("labels each door with its real depth", () => {
    const html = render(category_spotlight_pair, srcProps, {
      categories: cats,
      category_product_ids: counts,
    });
    expect(html).toContain("19");
    expect(html).toContain("17");
  });

  it("omits the count when the category is empty rather than showing 0", () => {
    const html = render(category_spotlight_pair, srcProps, {
      categories: cats,
      category_product_ids: { c1: counts.c1, c2: counts.c2, c3: [] },
    });
    expect(html).not.toMatch(/>0</);
  });

  it("skips a slug that has no matching category", () => {
    const html = render(category_spotlight_pair, {
      ...srcProps,
      category_slugs: ["work", "does-not-exist"],
    }, { categories: cats, category_product_ids: counts });
    expect(html).toContain("عطور للدوام");
    expect(html).not.toContain("does-not-exist");
  });

  it("crops portrait, because perfume bottles are vertical", () => {
    const html = render(category_spotlight_pair, srcProps, {
      categories: cats,
      category_product_ids: counts,
    });
    expect(html).toContain("aspect-[3/4]");
    expect(html).not.toContain("aspect-[4/3]");
  });

  it("falls back to config items untouched when source is unset", () => {
    const html = render(category_spotlight_pair, {
      ...category_spotlight_pair.defaultProps,
      items: [{ image_url: "https://images.unsplash.com/a", label_i18n: { ar: "قديم" }, href: "/categories" }],
    });
    expect(html).toContain("قديم");
  });

  it("keeps the new fields out of defaultProps", () => {
    expect(category_spotlight_pair.defaultProps).not.toHaveProperty("source");
    expect(category_spotlight_pair.defaultProps).not.toHaveProperty("category_slugs");
    expect(category_spotlight_pair.defaultProps).not.toHaveProperty("show_counts");
    expect(
      category_spotlight_pair.schema.safeParse(category_spotlight_pair.defaultProps).success,
    ).toBe(true);
  });
});

describe("testimonial_cards — the quote is the content", () => {
  const props = testimonial_cards.defaultProps;

  it("leads with the quote, not the name", () => {
    const html = render(testimonial_cards, props);
    // A testimonial where the customer's name outranks what they said
    // buries the only thing the section exists to deliver.
    expect(html.indexOf("<blockquote")).toBeLessThan(html.indexOf("<figcaption"));
  });

  it("sets the quote in full ink and the attribution in muted ink", () => {
    const html = render(testimonial_cards, props);
    const quote = html.slice(html.indexOf("<blockquote"), html.indexOf("</blockquote>"));
    const caption = html.slice(html.indexOf("<figcaption"), html.indexOf("</figcaption>"));
    expect(quote).toContain("var(--bk-ink,");
    expect(quote).not.toContain("var(--bk-ink-soft");
    expect(caption).toContain("var(--bk-ink-soft");
  });

  it("anchors the attribution to the card's bottom edge", () => {
    // Quotes run 28 to 146 characters. Without a bottom anchor the short
    // one leaves a hollow box instead of deliberate space.
    const html = render(testimonial_cards, props);
    expect(html).toContain("justify-between");
  });

  it("gives each name an initial disc", () => {
    const html = render(testimonial_cards, props);
    const discs = html.match(/data-initial/g) ?? [];
    expect(discs).toHaveLength(props.items.length);
    // First letter of "محمد علي".
    expect(html).toContain(">م<");
  });

  it("never implies a verification it cannot make", () => {
    // These came from WhatsApp. There is no purchase record behind them.
    const html = render(testimonial_cards, props);
    expect(html).not.toMatch(/verified|موثق|مشتري مؤكد/i);
  });

  it("keeps the decorative side art hugging the cards, not the viewport", () => {
    const html = render(testimonial_cards, {
      ...props,
      side_image_left_url: "https://images.unsplash.com/l",
      side_image_right_url: "https://images.unsplash.com/r",
    });
    expect(html).not.toMatch(/absolute left-2 top-1\/2/);
    expect(html).not.toMatch(/absolute right-2 top-1\/2/);
    expect(html).toContain("-left-20");
    expect(html).toContain("-right-20");
  });
});

describe("product_grid — catalogue controls", () => {
  const cat = (id: string, name: string) =>
    ({ id, tenant_id: "t", name, slug: id, description: null, image_url: null, parent_id: null, display_order: 0 }) as never;
  const prod = (id: string, over: Partial<Product> = {}) =>
    ({ ...baseProduct, id, name: id, price: 40000, ...over }) as Product;

  const products = [prod("a", { price: 30000 }), prod("b", { price: 60000 }), prod("c", { price: 90000 })];
  const categories = [cat("work", "دوام"), cat("empty", "فاضي")] as never;
  // "gone" is a member row whose product is not in the catalogue (archived,
  // hidden, a supply item). A count taken from this list reads 3; the chip
  // must read what it actually yields, which is 2.
  const ids = { work: ["a", "b", "gone"] };
  const props = {
    ...product_grid.defaultProps,
    card_style: "price_pill" as const,
    catalog_controls: true,
  };

  it("renders the rail, the sort control and the result count", () => {
    const html = render(product_grid, props, { products, categories, category_product_ids: ids });
    expect(html).toContain("data-catalog-grid");
    expect(html).toContain("data-catalog-sort");
    expect(html).toContain("data-result-count");
  });

  it("shows a chip's count as the number of cards that chip yields", () => {
    const html = render(product_grid, props, { products, categories, category_product_ids: ids });
    // The count and the filtered list come from one function, so the chip
    // cannot advertise a membership row whose product never renders.
    expect(html).toMatch(/دوام[\s\S]{0,200}?>2</);
    expect(html).not.toMatch(/دوام[\s\S]{0,200}?>3</);
  });

  it("does not render a chip that would open onto nothing", () => {
    const html = render(product_grid, props, { products, categories, category_product_ids: ids });
    expect(html).not.toContain("فاضي");
  });

  it("never spends the buy-yellow on a filter chip", () => {
    // --bk-primary means "act". Diluting it across controls weakens the one
    // colour that carries the purchase. Every chip is the aria-pressed
    // control, so read the style off those elements rather than guessing at
    // a slice of the markup.
    const html = render(product_grid, props, { products, categories, category_product_ids: ids });
    const chipStyles = [...html.matchAll(/aria-pressed="[^"]*"[^>]*style="([^"]*)"/g)].map(
      (m) => m[1],
    );
    expect(chipStyles.length).toBeGreaterThan(0);
    for (const style of chipStyles) expect(style).not.toContain("--bk-primary");
  });

  it("leaves markup untouched when catalog_controls is unset", () => {
    const html = render(product_grid, { ...product_grid.defaultProps, card_style: "price_pill" as const }, { products, categories });
    expect(html).not.toContain("data-catalog-grid");
    expect(html).not.toContain("data-load-more");
  });

  it("keeps the catalogue fields out of defaultProps", () => {
    expect(product_grid.defaultProps).not.toHaveProperty("catalog_controls");
    expect(product_grid.defaultProps).not.toHaveProperty("catalog_page_size");
    expect(product_grid.schema.safeParse(product_grid.defaultProps).success).toBe(true);
  });
});
