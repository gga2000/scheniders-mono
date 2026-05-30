import type { RuntimeContext, SectionInstance } from "../store-config-v2";

/**
 * Promo bar with a Black-Friday variant active 2026-11-28 → 2026-12-01.
 * Before / during / after the window assertions.
 */

const instance: SectionInstance = {
  id: "promo-bar",
  type: "promo_bar",
  enabled: true,
  base: {
    message: "Free shipping over 50,000 IQD",
    background: "primary",
  },
  variants: [
    {
      id: "v-bf",
      label: "Black Friday",
      priority: 20,
      conditions: [
        {
          kind: "time_window",
          start_iso: "2026-11-28T00:00:00Z",
          end_iso: "2026-12-01T00:00:00Z",
        },
      ],
      override: {
        message: "Black Friday — 40% off everything",
        background: "danger",
      },
    },
  ],
};

function ctxAt(iso: string): RuntimeContext {
  return {
    page_id: "home",
    breakpoint: "desktop",
    locale: "en",
    audience_segments: [],
    ab_test_arms: {},
    now: new Date(iso),
  };
}

export const scheduledBannerFixture = {
  instance,
  contexts: [
    {
      label: "before window — uses base",
      ctx: ctxAt("2026-11-27T23:59:59Z"),
      expected_props: {
        message: "Free shipping over 50,000 IQD",
        background: "primary",
      },
    },
    {
      label: "during window — uses variant",
      ctx: ctxAt("2026-11-29T12:00:00Z"),
      expected_props: {
        message: "Black Friday — 40% off everything",
        background: "danger",
      },
    },
    {
      label: "after window — back to base",
      ctx: ctxAt("2026-12-02T00:00:01Z"),
      expected_props: {
        message: "Free shipping over 50,000 IQD",
        background: "primary",
      },
    },
  ],
};
