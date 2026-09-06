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
    expect(html).toMatch(/aspect-\[4\/5\][^"]*sm:absolute/);
    // `priority` surfaces as a preload hint in static SSR output.
    expect(html).toContain('<link rel="preload" as="image"');
    const h1 = html.match(/<h1[^>]*>/)?.[0];
    expect(h1).toContain("text-bk-h1");
    expect(h1).toContain("text-balance");
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
  it("drops empty-url entries and returns nothing when none remain", () => {
    expect(render(image_gallery, image_gallery.defaultProps)).toBe("");
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
