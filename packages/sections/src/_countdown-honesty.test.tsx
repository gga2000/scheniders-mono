// countdown_announcement: a deadline nobody set is not a deadline.
import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StoreBaseProvider } from "./helpers/store-context";
import countdown_announcement from "./countdown_announcement";
import type { SectionRenderContext } from "./_types";

function render(props: Partial<typeof countdown_announcement.defaultProps>): string {
  return renderToStaticMarkup(
    React.createElement(
      StoreBaseProvider,
      { base: "", children: null },
      React.createElement(countdown_announcement.render, {
        props: { ...countdown_announcement.defaultProps, ...props },
        ctx: {
          tenant: { id: "t1", business_name: "متجر" } as never,
          runtime: { page_id: "home" as const, breakpoint: "mobile" as const, locale: "ar" as const,
                     audience_segments: [], ab_test_arms: {}, now: new Date("2026-09-10T00:00:00Z") },
          products: [], categories: [],
        } as SectionRenderContext,
      }),
    ),
  );
}

describe("countdown_announcement honesty", () => {
  it("draws no clock for an evergreen loop — the label stays, the fake deadline goes", () => {
    const html = render({ mode: "evergreen_minutes", duration_minutes: 150, label_i18n: { ar: "ينتهي عرض الخصم خلال:" } });
    expect(html).toContain("ينتهي عرض الخصم خلال:");
    expect(html).not.toContain('aria-live="off"'); // the clock wrapper is gone
    expect(html).not.toContain("ساعات");             // no unit labels
  });

  it("still draws the clock for a real fixed end date", () => {
    const html = render({ mode: "fixed_end", ends_at: "2026-12-31T20:00:00Z" });
    expect(html).toContain('aria-live="off"');
    expect(html).toContain("ساعات");
  });

  it("still parses a stored evergreen config — the section is never dropped", () => {
    const parsed = countdown_announcement.schema.safeParse({
      ...countdown_announcement.defaultProps, mode: "evergreen_minutes", duration_minutes: 150,
    });
    expect(parsed.success).toBe(true);
  });
});
