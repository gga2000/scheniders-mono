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

  it("drops a metric slot when there are no stats at all", () => {
    const html = render(trust_badge_row, ledgeProps);
    expect(html).not.toContain("+2600");
    // Static slots survive — they are merchant claims, not derived.
    expect(html).toContain("توصيل خلال ٢٤ ساعة");
    expect(html).toContain("الدفع عند الاستلام");
  });

  it("drops a metric slot whose value is zero rather than printing 0", () => {
    const html = render(trust_badge_row, ledgeProps, {
      public_stats: { completed_orders: 0, customers: 0, governorates_served: 18 },
    });
    expect(html).not.toMatch(/>0</);
    expect(html).toContain("18");
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
