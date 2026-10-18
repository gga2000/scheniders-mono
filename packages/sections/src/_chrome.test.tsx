// Phase 3G (signature audit) — global chrome: language switcher in the
// header (P1-6), footer phone formatting (P2-19), the chrome-strings table
// with Kurdish (P3-6), and the category breadcrumb hit area (P3-12).
// Static-markup renders only (no DOM lib in this package).

import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StoreBaseProvider } from "./helpers/store-context";
import { chromeString } from "./helpers/chrome-strings";
import { readEnabledLocales } from "./helpers/locale-switch";
import {  } from "./helpers/primitives";
import { PRESSABLE } from "./helpers/utils";

import site_header from "./site_header";
import site_footer from "./site_footer";
import product_grid from "./product_grid";
import sticky_cta_bar from "./sticky_cta_bar";
import accordion_richtext from "./accordion_richtext";
import policy_content from "./policy_content";
import cta_banner from "./cta_banner";
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

function tenantWith(enabled: string[] | undefined) {
  return {
    id: "tenant-1",
    business_name: "متجر",
    contact_phone: "+9647779703832",
    store_config: { contact: { whatsapp_number: "07701234567" } },
    store_config_v2: enabled ? { enabled_locales: enabled } : undefined,
  };
}

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
      React.createElement(Render, {
        props,
        ctx: {
          tenant: tenantWith(["ar", "en"]) as never,
          runtime,
          products: [],
          categories: [],
          ...ctx,
        },
      }),
    ),
  );
}

/** Every `<a …>…</a>` slice of the markup. */
function anchors(html: string): string[] {
  return html.match(/<a\b[^>]*>[\s\S]*?<\/a>/g) ?? [];
}

describe("site_header language switcher (P1-6)", () => {
  it("renders a segmented control with native labels + aria-pressed when 2 locales are enabled", () => {
    for (const layout of ["bento", "floating_pill"] as const) {
      const html = render(site_header, { ...site_header.defaultProps, layout });
      expect(html).toContain('role="group"');
      expect(html).toContain('aria-label="اللغة"');
      expect(html).toContain('aria-pressed="true"');
      expect(html).toContain('aria-pressed="false"');
      expect(html).toContain(">العربية<");
      expect(html).toContain(">English<");
      // 44px hit area on every option.
      const pressed = html.match(/<button[^>]*aria-pressed[^>]*>/g) ?? [];
      expect(pressed.length).toBe(2);
      for (const b of pressed) expect(b).toContain("min-h-11");
      // Never a `dir` flip — the app stays LTR in every locale.
      expect(html).not.toMatch(/\sdir="/);
    }
  });

  it("renders nothing for a single-locale store", () => {
    const html = render(site_header, site_header.defaultProps, {
      tenant: tenantWith(["ar"]) as never,
    });
    expect(html).not.toContain('role="group"');
    expect(html).not.toContain("aria-pressed");
  });

  it("renders nothing when the tenant carries no store_config_v2 at all", () => {
    const html = render(site_header, site_header.defaultProps, {
      tenant: tenantWith(undefined) as never,
    });
    expect(html).not.toContain("aria-pressed");
  });

  it("dedupes + drops unknown codes when reading enabled_locales off the tenant", () => {
    expect(readEnabledLocales(tenantWith(["ar", "en", "ar", "xx"]))).toEqual([
      "ar",
      "en",
    ]);
    expect(readEnabledLocales(null)).toEqual([]);
    expect(
      readEnabledLocales({ store_config_v2: { enabled_locales: "ar" } }),
    ).toEqual([]);
  });

  it("wires the toggle to the sheet (aria-controls + aria-expanded) and localises the labels", () => {
    const html = render(site_header, site_header.defaultProps);
    const toggle = html.match(/<button[^>]*aria-expanded[^>]*>/)?.[0];
    expect(toggle).toBeDefined();
    expect(toggle).toContain('aria-controls="');
    expect(toggle).toContain('aria-label="القائمة"');
    expect(html).toContain('aria-label="سلة التسوّق (0)"');
    // Logo picker hint for the editor (P2-20).
    expect(site_header.schema.safeParse(site_header.defaultProps).success).toBe(
      true,
    );
  });

  it("uses the Kurdish chrome labels for a ku visitor", () => {
    const html = render(site_header, site_header.defaultProps, {
      runtime: { ...runtime, locale: "ku" },
      tenant: tenantWith(["ar", "ku"]) as never,
    });
    expect(html).toContain('aria-label="مێنیو"');
    expect(html).toContain('aria-label="سەبەتە (0)"');
    expect(html).toContain('aria-label="زمان"');
    expect(html).toContain(">کوردی<");
  });
});

describe("site_footer phone (P2-19)", () => {
  const infoPanel = {
    ...site_footer.defaultProps,
    layout: "info_panel" as const,
    contact: { phone: "+9647779703832" },
    social_links: {
      instagram: "https://instagram.com/x",
      tiktok: "https://tiktok.com/@x",
    },
  };

  it("renders the phone as a tel: link with the Iraqi display grouping and a 44px hit area", () => {
    const html = render(site_footer, infoPanel);
    const tel = anchors(html).find((a) => a.includes('href="tel:'));
    expect(tel).toBeDefined();
    expect(tel).toContain('href="tel:+9647779703832"');
    expect(tel).toContain(">0777 970 3832<");
    expect(tel).toContain("min-h-11");
    expect(html).not.toContain(">+9647779703832<");
  });

  it("keeps social icons and link rows at ≥44px", () => {
    const html = render(site_footer, infoPanel);
    const socials = anchors(html).filter((a) => a.includes('target="_blank"'));
    expect(socials.length).toBe(2);
    for (const a of socials) expect(a).toMatch(/\bh-11\b.*\bw-11\b/);
    const rows = anchors(html).filter((a) => a.includes('href="/policies/'));
    expect(rows.length).toBeGreaterThan(0);
    for (const a of rows) expect(a).toContain("min-h-11");
  });

  it("localises the bento footer chrome via the strings table", () => {
    const ku = render(site_footer, site_footer.defaultProps, {
      runtime: { ...runtime, locale: "ku" },
    });
    expect(ku).toContain("پارەدان لە کاتی وەرگرتن");
    // No Kurdish entry for the rights line → Arabic, never English.
    expect(ku).toContain("صُنع بحب في العراق");
    expect(ku).not.toContain("Made with love");
  });
});

describe("chromeString fallback chain (P3-6)", () => {
  it("ku → ku when present, → ar when missing, never en", () => {
    expect(chromeString("close", "ku")).toBe("داخستن");
    expect(chromeString("home", "ku")).toBe("سەرەکی");
    expect(chromeString("made_in_iraq", "ku")).toBe("صُنع بحب في العراق 🇮🇶");
    expect(chromeString("company_legal_name_label", "ku")).toBe(
      "الاسم القانوني للشركة:",
    );
  });

  it("ar and en resolve directly", () => {
    expect(chromeString("cart", "ar")).toBe("سلة التسوّق");
    expect(chromeString("cart", "en")).toBe("Cart");
    expect(chromeString("see_all", "en")).toBe("See all");
  });
});

describe("product_grid category breadcrumb (P3-12)", () => {
  const product: Product = {
    id: "11111111-1111-4111-8111-111111111111",
    name: "عطر تجريبي",
    price: 25000,
    stock_quantity: 10,
    reserved_quantity: 0,
    is_archived: false,
  };
  const category = { id: "c1", name: "عطور", slug: "perfumes" };

  it("gives the Home crumb a 44px hit area + press feedback in both card styles", () => {
    for (const card_style of ["standard", "price_pill"] as const) {
      // Annotated so `render<P>` infers P from the definition, not a widened
      // `{ card_style: string }` literal.
      const props: typeof product_grid.defaultProps = {
        ...product_grid.defaultProps,
        card_style,
      };
      const html = render(product_grid, props, {
        products: [product],
        category: category as never,
      });
      const crumb = anchors(html).find((a) => a.includes(">الرئيسية<"));
      expect(crumb).toBeDefined();
      expect(crumb).toContain("min-h-11");
      expect(crumb).toContain(PRESSABLE);
    }
  });

  it("labels the crumb in Kurdish for a ku visitor", () => {
    const props: typeof product_grid.defaultProps = {
      ...product_grid.defaultProps,
      card_style: "price_pill",
    };
    const html = render(product_grid, props, {
      products: [product],
      category: category as never,
      runtime: { ...runtime, locale: "ku" },
    });
    expect(html).toContain(">سەرەکی<");
  });
});

// ── Heading levels follow the page, not the section ──

describe("heading ownership", () => {
  function renderOn(
    def: { render: React.ComponentType<{ props: never; ctx: never }>; defaultProps: unknown },
    pageId: string,
    props?: Record<string, unknown>,
  ): string {
    return renderToStaticMarkup(
      React.createElement(
        StoreBaseProvider,
        { base: "", children: null },
        React.createElement(def.render, {
          props: { ...(def.defaultProps as object), ...(props ?? {}) },
          ctx: {
            tenant: { id: "t1", business_name: "Demo" },
            runtime: {
              page_id: pageId,
              breakpoint: "mobile",
              locale: "ar",
              audience_segments: [],
              ab_test_arms: {},
              now: new Date("2026-05-15T00:00:00Z"),
            },
            products: [],
            categories: [],
          },
        } as never),
      ),
    );
  }

  it("policy_content owns the h1 on a policy page", () => {
    expect(renderOn(policy_content, "policy_returns")).toContain("<h1");
  });

  it("policy_content steps down on the contact page, which already has one", () => {
    const html = renderOn(policy_content, "contact");
    expect(html).not.toContain("<h1");
    expect(html).toContain("<h2");
  });

  it("cta_banner owns the h1 on the 404 page", () => {
    expect(renderOn(cta_banner, "not_found")).toContain("<h1");
  });

  it("cta_banner is an h2 anywhere else, and never nests a button in a link", () => {
    const html = renderOn(cta_banner, "home");
    expect(html).not.toContain("<h1");
    expect(html).toContain("<h2");
    expect(html).not.toMatch(/<a[^>]*>\s*<button/);
  });
});

// ── No fixed Candy pastels on brand surfaces ──

describe("WhatsApp CTAs use the brand's success green, not Candy mint", () => {
  it("sticky_cta_bar's WhatsApp link reads --bk-success", () => {
    const html = renderToStaticMarkup(
      React.createElement(
        StoreBaseProvider,
        { base: "", children: null },
        React.createElement(sticky_cta_bar.render, {
          props: { ...sticky_cta_bar.defaultProps, secondary_kind: "whatsapp" },
          ctx: {
            tenant: {
              id: "t1",
              contact_phone: "07801234567",
              store_config: { contact: { whatsapp_number: "07801234567" } },
            },
            runtime: {
              page_id: "product",
              breakpoint: "mobile",
              locale: "ar",
              audience_segments: [],
              ab_test_arms: {},
              now: new Date("2026-05-15T00:00:00Z"),
            },
            products: [],
            categories: [],
          },
        } as never),
      ),
    );
    expect(html).toContain("--bk-success");
    // --bk-mint is a fixed pastel a tenant cannot recolour; it must not
    // carry a brand CTA.
    expect(html).not.toContain("--bk-mint");
  });

  it("accordion_richtext tints derive from the tenant palette", () => {
    const html = renderToStaticMarkup(
      React.createElement(
        StoreBaseProvider,
        { base: "", children: null },
        React.createElement(accordion_richtext.render, {
          props: accordion_richtext.defaultProps,
          ctx: {
            tenant: { id: "t1" },
            runtime: {
              page_id: "product",
              breakpoint: "mobile",
              locale: "ar",
              audience_segments: [],
              ab_test_arms: {},
              now: new Date("2026-05-15T00:00:00Z"),
            },
            products: [],
            categories: [],
          },
        } as never),
      ),
    );
    expect(html).not.toContain("--bk-mint");
    expect(html).not.toContain("--bk-lilac");
    expect(html).not.toContain("--bk-sky");
  });
});
