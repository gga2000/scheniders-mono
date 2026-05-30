// =====================================================================
// Section registry smoke tests
// =====================================================================
// Confirms the barrel import wires up every section, that each
// section's `defaultProps` validates against its own schema, and that
// the registry filters by `for_page` / `category` correctly.
// =====================================================================

import { describe, expect, it } from "vitest";

import { BUILTIN_SECTIONS, getSection, listSections } from "./index";

const EXPECTED_TYPES = [
  // Original 5
  "hero_image",
  "trust_strip",
  "product_grid",
  "faq_accordion",
  "newsletter_inline",
  // Hero family
  "hero_split",
  "hero_marquee",
  "hero_video",
  // Story family
  "about_block",
  "brand_story",
  "founder_note",
  "press_quotes",
  // Content family
  "testimonials_carousel",
  "image_gallery",
  "video_block",
  "marquee_strip",
  // Conversion family
  "promo_banner",
  "countdown_card",
  "free_gift_strip",
  "delivery_promise",
  "cta_banner",
  // PDP family
  "pdp_gallery",
  "pdp_buy_box",
  "pdp_info_tabs",
  "pdp_related_products",
  // Cart / checkout / track
  "cart_line_items",
  "cart_summary",
  "checkout_form",
  "checkout_order_summary",
  "track_order_lookup",
  // Content variety
  "category_grid",
  "feature_grid",
  "numbers_stat_strip",
  "instagram_grid",
  "accordion_richtext",
  // Escape hatch
  "html_embed",
];

describe("section registry", () => {
  it("registers exactly 36 built-in sections", () => {
    expect(BUILTIN_SECTIONS).toHaveLength(36);
    expect(listSections()).toHaveLength(36);
  });

  it("each section's defaultProps validates against its own schema", () => {
    for (const def of BUILTIN_SECTIONS) {
      const result = def.schema.safeParse(def.defaultProps);
      expect(result.success, `${def.type} defaultProps must parse`).toBe(true);
    }
  });

  it("each section is retrievable by type id", () => {
    for (const def of BUILTIN_SECTIONS) {
      expect(getSection(def.type)).toBe(def);
    }
  });

  it("registers all expected section types", () => {
    const types = BUILTIN_SECTIONS.map((s) => s.type).sort();
    expect(types).toEqual(EXPECTED_TYPES.slice().sort());
  });

  it("getSection('about_block') returns truthy (legacy migration coverage)", () => {
    expect(getSection("about_block")).toBeTruthy();
  });

  it("listSections({ category: 'hero' }) returns 4 hero sections", () => {
    const hero = listSections({ category: "hero" });
    const types = hero.map((s) => s.type).sort();
    expect(types).toEqual(
      ["hero_image", "hero_split", "hero_marquee", "hero_video"].sort(),
    );
    expect(hero).toHaveLength(4);
  });

  it("listSections({ for_page: 'about' }) returns at least 5 sections", () => {
    const about = listSections({ for_page: "about" });
    expect(about.length).toBeGreaterThanOrEqual(5);
  });

  it("listSections({ for_page: 'home' }) returns >= 3 sections", () => {
    const home = listSections({ for_page: "home" });
    expect(home.length).toBeGreaterThanOrEqual(3);
    expect(home.map((s) => s.type)).toContain("hero_image");
  });

  it("listSections({ category: 'products' }) returns the product_grid", () => {
    const products = listSections({ category: "products" });
    expect(products.map((s) => s.type)).toEqual(["product_grid"]);
  });

  it("listSections() filters compose (for_page AND category)", () => {
    const both = listSections({ for_page: "home", category: "trust" });
    expect(both.map((s) => s.type)).toEqual(["trust_strip"]);
  });

  it("getSection returns undefined for unknown types", () => {
    expect(getSection("nonexistent_section")).toBeUndefined();
  });

  it("listSections({ category: 'story' }) returns 4 story sections", () => {
    const story = listSections({ category: "story" });
    const types = story.map((s) => s.type).sort();
    expect(types).toEqual(
      ["about_block", "brand_story", "founder_note", "press_quotes"].sort(),
    );
  });

  it("listSections({ category: 'conversion' }) includes the 4 new conversion sections", () => {
    const conversion = listSections({ category: "conversion" });
    const types = conversion.map((s) => s.type);
    expect(types).toEqual(
      expect.arrayContaining([
        "newsletter_inline",
        "promo_banner",
        "countdown_card",
        "free_gift_strip",
        "delivery_promise",
      ]),
    );
  });
});
