// delivery_promise: the merchant's shipping config is the truth; the
// section's own hours and list are only the fallback.

import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StoreBaseProvider } from "./helpers/store-context";
import delivery_promise from "./delivery_promise";
import type { SectionRenderContext } from "./_types";

function render(shipping: unknown, governorate?: string): string {
  return renderToStaticMarkup(
    React.createElement(
      StoreBaseProvider,
      { base: "", children: null },
      React.createElement(delivery_promise.render, {
        props: delivery_promise.defaultProps,
        ctx: {
          tenant: {
            id: "t1",
            business_name: "متجر",
            store_config_v2: shipping === undefined ? null : { commerce: { shipping } },
          } as never,
          runtime: {
            page_id: "home" as const,
            breakpoint: "mobile" as const,
            locale: "ar" as const,
            audience_segments: [],
            ab_test_arms: {},
            now: new Date("2026-09-10T00:00:00Z"),
            governorate,
          },
          products: [],
          categories: [],
        } as SectionRenderContext,
      }),
    ),
  );
}

describe("delivery_promise", () => {
  it("falls back to its own hours and list with no shipping config", () => {
    const html = render(undefined);
    expect(html).toContain("6 ساعات");   // baghdad_hours default
    expect(html).toContain("يومين");     // provinces_hours 48h — the dual, not "2 أيام"
    // The section's own list, localised by the section — so Arabic here.
    expect(html).toContain("بغداد");
    expect(html).toContain("أربيل");     // present in the fallback list, absent from a BG+BA-only config
  });

  it("shows the merchant's ETAs when the config carries them", () => {
    const html = render({
      default_rate: { fee_iqd: 5000, eta_hours: 72 },
      rates: { BG: { fee_iqd: 5000, eta_hours: 12 } },
    });
    expect(html).toContain("12 ساعة");
    expect(html).toContain("3 أيام");
    expect(html).not.toContain("6 ساعات");
  });

  it("covers every governorate when there is a default rate", () => {
    const html = render({ default_rate: { fee_iqd: 5000 } });
    // Localised names from the shared list, not the section's English defaults.
    expect(html).toContain("بغداد");
    expect(html).toContain("البصرة");
    expect(html).not.toContain("Baghdad");
  });

  it("covers only the governorates with rates when there is no default", () => {
    const html = render({ rates: { BG: { fee_iqd: 4000 }, BA: { fee_iqd: 6000 } } });
    expect(html).toContain("بغداد");
    expect(html).toContain("البصرة");
    expect(html).not.toContain("أربيل");
  });

  it("keeps its own hours when the config has fees but no ETA", () => {
    // A merchant who set fees and not times has not told us the time.
    const html = render({ default_rate: { fee_iqd: 5000 } });
    expect(html).toContain("6 ساعات");
  });
});
