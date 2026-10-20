import { describe, it, expect } from "vitest";
import { mapLegacyToV2 } from "./mapper";
import { LEGACY_MINIMAL } from "./__fixtures__/legacy-minimal";
import { LEGACY_SCHNEIDERS_FULL } from "./__fixtures__/legacy-schneiders-full";
import { LEGACY_EMPTY } from "./__fixtures__/legacy-empty";
import { EMPTY_BRAND_KIT } from "@scheniders/shared/types";

describe("mapLegacyToV2", () => {
  it("produces a valid v2 shape from an empty legacy config", () => {
    const v2 = mapLegacyToV2(LEGACY_EMPTY);
    expect(v2.schema_version).toBe(2);
    expect(v2.pages).toHaveLength(16);
    expect(v2.pages.find((p) => p.page_id === "home")?.sections).toEqual([]);
    expect(v2.brand_kit.colors.primary).toBe(EMPTY_BRAND_KIT.colors.primary);
    // EC32: a fresh store ships Arabic — the Iraq-market default the shared
    // resolver applies.
    expect(v2.default_locale).toBe("ar");
    expect(v2.enabled_locales).toEqual(["ar"]);
    expect(v2.experiments).toEqual([]);
    expect(v2.segments).toEqual([]);
    expect(v2.schedules).toEqual([]);
  });

  it("maps a minimal legacy config (no schneiders block) correctly", () => {
    const v2 = mapLegacyToV2(LEGACY_MINIMAL);
    const home = v2.pages.find((p) => p.page_id === "home")!;

    // Brand kit derived from design_tokens
    expect(v2.brand_kit.colors.primary).toBe("#0066ff");
    expect(v2.brand_kit.colors.secondary).toBe("#22cc88");
    expect(v2.brand_kit.typography.display).toBe("Poppins");
    expect(v2.brand_kit.typography.body).toBe("Inter");
    expect(v2.brand_kit.identity.logo_url).toBe("https://cdn.example.com/logo.png");
    expect(v2.brand_kit.shape.radius).toBe("soft"); // md → soft

    // Hero, about, and 1 dynamic section (promo-1) — no trust/testimonial
    expect(home.sections).toHaveLength(3);
    expect(home.sections[0].type).toBe("hero_image");
    expect(home.sections[0].base).toMatchObject({
      title_i18n: { en: "Welcome to Acme" },
      subtitle_i18n: { en: "The best stuff in town" },
      cta_label_i18n: { en: "Shop now" },
      cta_href: "#products",
      image_url: "https://cdn.example.com/hero.jpg",
    });
    expect(home.sections[1].type).toBe("about_block");
    expect(home.sections[2].type).toBe("promotions");

    // Globals: no schneiders → no promo_bar / analytics / newsletter_popup
    expect(v2.globals.promo_bar).toBeUndefined();
    expect(v2.globals.analytics_pixels).toBeUndefined();
    expect(v2.globals.newsletter_popup).toBeUndefined();
  });

  it("maps a full schneiders-template config including trust pills + testimonial", () => {
    const v2 = mapLegacyToV2(LEGACY_SCHNEIDERS_FULL);
    const home = v2.pages.find((p) => p.page_id === "home")!;

    // Home sections respect sections_order: hero, trust, customer_love, testimonials-block, newsletter-block
    // (about_block is also built but appended at end because not in order list)
    const types = home.sections.map((s) => s.type);
    expect(types).toEqual([
      "hero_image",
      "trust_strip",
      "testimonial_card",
      "testimonials",
      "newsletter",
      "about_block",
    ]);

    // trust pill data
    const trust = home.sections.find((s) => s.type === "trust_strip");
    expect(trust).toBeDefined();
    const pills = (trust!.base as { pills: Array<{ label_i18n: { en: string } }> }).pills;
    expect(pills).toHaveLength(4);
    expect(pills[0].label_i18n).toEqual({ en: "Cash on Delivery" });

    // testimonial card
    const tc = home.sections.find((s) => s.type === "testimonial_card");
    expect(tc!.base).toMatchObject({
      quote_i18n: { en: "The delivery was incredibly fast!" },
      reviewer_name_i18n: { en: "Lina K." },
      rating: 5,
    });

    // about disabled — section still emitted, enabled=false
    const about = home.sections.find((s) => s.type === "about_block")!;
    expect(about.enabled).toBe(false);

    // Globals from schneiders block
    expect(v2.globals.promo_bar).toBeDefined();
    expect(v2.globals.promo_bar!.base).toEqual({
      messages_i18n: [
        { en: "24h delivery" },
        { en: "Cash on delivery" },
        { en: "Free shipping over 75k IQD" },
      ],
    });
    expect(v2.globals.analytics_pixels!.base).toMatchObject({
      meta_pixel_id: "123456789",
      tiktok_pixel_id: "CABCDEF",
      google_analytics_id: "G-XXXXXX",
    });
    expect(v2.globals.newsletter_popup!.enabled).toBe(true);

    // brand_kit honors candy palette + identity
    expect(v2.brand_kit.colors.primary).toBe("#ff5a8a");
    expect(v2.brand_kit.identity.logo_url).toBe("https://cdn.example.com/schneiders-logo.svg");
    expect(v2.brand_kit.identity.og_image_url).toBe("https://cdn.example.com/og.jpg");
    expect(v2.brand_kit.shape.rotation_intensity).toBe("playful");
    expect(v2.brand_kit.shape.radius).toBe("round"); // lg → round
  });

  it("is idempotent: same legacy input → byte-identical v2 output", () => {
    const a = JSON.stringify(mapLegacyToV2(LEGACY_SCHNEIDERS_FULL));
    const b = JSON.stringify(mapLegacyToV2(LEGACY_SCHNEIDERS_FULL));
    expect(a).toBe(b);
  });

  it("creates all 16 pages for every legacy input", () => {
    for (const legacy of [LEGACY_EMPTY, LEGACY_MINIMAL, LEGACY_SCHNEIDERS_FULL]) {
      const v2 = mapLegacyToV2(legacy);
      expect(v2.pages).toHaveLength(16);
      const ids = v2.pages.map((p) => p.page_id).sort();
      expect(ids).toContain("policy_shipping");
      expect(ids).toContain("policy_returns");
      expect(ids).toContain("policy_privacy");
      expect(ids).toContain("policy_terms");
    }
  });

  it("maps contact + whatsapp + custom_css into commerce/custom_css", () => {
    const v2 = mapLegacyToV2({
      contact: { whatsapp_number: "+9647", instagram: "ig" },
      enable_whatsapp_order: true,
      custom_css: ".x{}",
    });
    expect(v2.commerce?.whatsapp_number).toBe("+9647");
    expect(v2.commerce?.enable_whatsapp_order).toBe(true);
    expect(v2.commerce?.socials?.instagram).toBe("ig");
    expect(v2.custom_css).toBe(".x{}");
  });

  it("synthesizes a footer global from contact socials", () => {
    const v2 = mapLegacyToV2({ contact: { instagram: "ig", email: "a@b.c" } });
    expect(v2.globals.footer).toBeTruthy();
  });

  it("omits commerce sub-objects when legacy has no such data (no empty noise)", () => {
    const v2 = mapLegacyToV2({});
    // commerce may be undefined or an object with all-undefined fields; footer must be absent
    expect(v2.globals.footer).toBeUndefined();
    expect(v2.commerce).toBeUndefined();
  });

  it("does not emit delivery_promise when the legacy object is empty", () => {
    const v2 = mapLegacyToV2({ schneiders: { delivery_promise: {} } });
    expect(v2.commerce?.delivery_promise).toBeUndefined();
  });
});
