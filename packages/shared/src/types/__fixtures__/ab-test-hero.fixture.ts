import type { RuntimeContext, SectionInstance } from "../store-config-v2";

/**
 * Hero with two A/B arms. Includes one variant that ANDs ab_test +
 * breakpoint conditions — that variant should only apply when BOTH match.
 */

const EXPERIMENT_ID = "exp_hero_2026q2";

const instance: SectionInstance = {
  id: "hero-ab",
  type: "hero_image",
  enabled: true,
  base: {
    headline: "Default headline",
    subline: "Default subline",
  },
  variants: [
    {
      id: "v-arm-a",
      label: "Arm A — control",
      priority: 5,
      conditions: [{ kind: "ab_test", experiment_id: EXPERIMENT_ID, arm: "a" }],
      override: { headline: "Headline A" },
    },
    {
      id: "v-arm-b",
      label: "Arm B — treatment",
      priority: 5,
      conditions: [{ kind: "ab_test", experiment_id: EXPERIMENT_ID, arm: "b" }],
      override: { headline: "Headline B" },
    },
    {
      id: "v-arm-b-mobile",
      label: "Arm B mobile-specific",
      priority: 10,
      conditions: [
        { kind: "ab_test", experiment_id: EXPERIMENT_ID, arm: "b" },
        { kind: "breakpoint", values: ["mobile"] },
      ],
      override: { subline: "Optimized for mobile" },
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

export const abTestHeroFixture = {
  instance,
  experimentId: EXPERIMENT_ID,
  contexts: [
    {
      label: "no arm assigned — base",
      ctx: baseCtx(),
      expected_props: {
        headline: "Default headline",
        subline: "Default subline",
      },
    },
    {
      label: "arm a, desktop",
      ctx: { ...baseCtx(), ab_test_arms: { [EXPERIMENT_ID]: "a" } },
      expected_props: {
        headline: "Headline A",
        subline: "Default subline",
      },
    },
    {
      label: "arm b, desktop — mobile variant must NOT apply",
      ctx: { ...baseCtx(), ab_test_arms: { [EXPERIMENT_ID]: "b" } },
      expected_props: {
        headline: "Headline B",
        subline: "Default subline",
      },
    },
    {
      label: "arm b, mobile — both AND'd conditions match",
      ctx: {
        ...baseCtx(),
        breakpoint: "mobile" as const,
        ab_test_arms: { [EXPERIMENT_ID]: "b" },
      },
      expected_props: {
        headline: "Headline B",
        subline: "Optimized for mobile",
      },
    },
    {
      label: "arm a, mobile — mobile variant gated on arm b, so doesn't apply",
      ctx: {
        ...baseCtx(),
        breakpoint: "mobile" as const,
        ab_test_arms: { [EXPERIMENT_ID]: "a" },
      },
      expected_props: {
        headline: "Headline A",
        subline: "Default subline",
      },
    },
  ],
};
