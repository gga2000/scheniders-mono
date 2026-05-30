import type { RuntimeContext, SectionInstance } from "../store-config-v2";

/**
 * Multilingual home hero. One base (English title) plus two locale variants
 * for Arabic and Kurdish. Asserts that resolveSection picks the right
 * override per locale, including the base case (English).
 */

const instance: SectionInstance = {
  id: "hero-home",
  type: "hero_image",
  enabled: true,
  base: {
    title: "Welcome to Schneiders",
    subtitle: "Best store in town",
    cta_label: "Shop now",
  },
  variants: [
    {
      id: "v-ar",
      label: "Arabic",
      priority: 10,
      conditions: [{ kind: "locale", values: ["ar"] }],
      override: {
        title: "أهلاً بكم في شنايدرز",
        cta_label: "تسوّق الآن",
      },
    },
    {
      id: "v-ku",
      label: "Kurdish",
      priority: 10,
      conditions: [{ kind: "locale", values: ["ku"] }],
      override: {
        title: "بەخێربێیت بۆ شنایدەرس",
        cta_label: "ئێستا بکڕە",
      },
    },
  ],
};

function baseCtx(): RuntimeContext {
  return {
    page_id: "home",
    breakpoint: "desktop",
    locale: "en",
    audience_segments: [],
    ab_test_arms: {},
    now: new Date("2026-05-15T00:00:00Z"),
  };
}

export const multilingualHomeFixture = {
  instance,
  contexts: [
    {
      label: "english base",
      ctx: { ...baseCtx(), locale: "en" as const },
      expected_props: {
        title: "Welcome to Schneiders",
        subtitle: "Best store in town",
        cta_label: "Shop now",
      },
    },
    {
      label: "arabic overrides title + cta but keeps subtitle from base",
      ctx: { ...baseCtx(), locale: "ar" as const },
      expected_props: {
        title: "أهلاً بكم في شنايدرز",
        subtitle: "Best store in town",
        cta_label: "تسوّق الآن",
      },
    },
    {
      label: "kurdish overrides title + cta but keeps subtitle from base",
      ctx: { ...baseCtx(), locale: "ku" as const },
      expected_props: {
        title: "بەخێربێیت بۆ شنایدەرس",
        subtitle: "Best store in town",
        cta_label: "ئێستا بکڕە",
      },
    },
  ],
};
