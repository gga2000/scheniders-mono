// =====================================================================
// Sticky chrome must live on the section WRAPPER
// =====================================================================
// A sticky element only travels inside its parent's content box. Every
// section is wrapped in a per-section div whose height is exactly the
// section's own height, so `position: sticky` on the element inside has
// nowhere to travel and scrolls away as though it were static. The site
// header was configured sticky and did not stick for exactly this reason.
// =====================================================================

import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StoreBaseProvider } from "./helpers/store-context";
import { RenderSection } from "./RenderSection";
import site_header from "./site_header";
import type { SectionInstance, SectionRenderContext } from "./_types";

const runtime = {
  page_id: "home" as const,
  breakpoint: "mobile" as const,
  locale: "ar" as const,
  audience_segments: [],
  ab_test_arms: {},
  now: new Date("2026-09-16T00:00:00Z"),
};

const renderCtx = {
  tenant: { id: "t", business_name: "متجر", store_config: {} } as never,
  runtime,
  products: [],
  categories: [],
} as unknown as SectionRenderContext;

function wrapperOf(sticky: boolean): string {
  const instance: SectionInstance = {
    id: "hdr",
    type: "site_header",
    enabled: true,
    base: { ...site_header.defaultProps, sticky },
  } as SectionInstance;
  const html = renderToStaticMarkup(
    React.createElement(
      StoreBaseProvider,
      { base: "", children: null },
      React.createElement(RenderSection, { instance, runtime, renderCtx }),
    ),
  );
  // Just the opening tag of the section wrapper.
  return html.slice(0, html.indexOf(">") + 1);
}

describe("RenderSection — sticky chrome", () => {
  it("puts the sticky on the wrapper when the header asks for it", () => {
    const tag = wrapperOf(true);
    expect(tag).toContain("position:sticky");
    expect(tag).toContain("top:0");
  });

  it("marks sticky chrome so the scroll-reveal leaves it alone", () => {
    // The reveal animates a transform on the wrapper. On a sticky wrapper
    // that fights the stick — and a header should not fade in anyway.
    expect(wrapperOf(true)).toContain('data-section-chrome="true"');
  });

  it("leaves a non-sticky header in a plain relative box", () => {
    const tag = wrapperOf(false);
    expect(tag).toContain("position:relative");
    expect(tag).not.toContain("position:sticky");
    expect(tag).not.toContain("data-section-chrome");
  });

  it("keeps the wrapper a real box, because the editor measures it", () => {
    // The preview bridge calls getBoundingClientRect() on [data-section-id]
    // to place the selection overlay. `display: contents` would have fixed
    // the sticky just as well and returned a zero rect, breaking selection
    // of the header in the builder.
    const tag = wrapperOf(true);
    expect(tag).toContain('data-section-id="hdr"');
    expect(tag).not.toContain("display:contents");
  });
});
