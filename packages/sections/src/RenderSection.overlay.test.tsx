// =====================================================================
// Overlay sections (sticky bar, exit-intent) must not be wrapped in the
// `content-visibility: auto` lazy boundary: containment turns the wrapper
// into the containing block for `position: fixed`, so the bar renders
// inside the section box (off-screen) instead of pinned to the viewport.
// Static-markup renders on purpose: no extra test deps, and the wrapper
// attributes under test are all server-emitted.
// =====================================================================

import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { RenderPage } from "./RenderSection";
import { getSection } from "./_registry";
import { StoreBaseProvider } from "./helpers/store-context";
import trust_strip from "./trust_strip";
import sticky_cta_bar from "./sticky_cta_bar";
import exit_intent_offer from "./exit_intent_offer";
import countdown_announcement from "./countdown_announcement";

const runtime = {
  page_id: "product" as const,
  breakpoint: "mobile" as const,
  locale: "en" as const,
  audience_segments: [],
  ab_test_arms: {},
  now: new Date("2026-05-15T00:00:00Z"),
};
const renderCtx = { tenant: {} as never, runtime, products: [], categories: [] };

function section(id: string, type: string, base: unknown) {
  return { id, type, enabled: true, base } as never;
}

function renderPage(sections: unknown[], base = ""): string {
  return renderToStaticMarkup(
    React.createElement(
      StoreBaseProvider,
      { base, children: null },
      React.createElement(RenderPage, {
        page: { page_id: "product", sections },
        runtime,
        renderCtx,
      } as never),
    ),
  );
}

describe("overlay sections bypass the lazy boundary", () => {
  it("flags the two viewport-anchored sections", () => {
    expect(getSection("sticky_cta_bar")?.overlay).toBe(true);
    expect(getSection("exit_intent_offer")?.overlay).toBe(true);
    expect(exit_intent_offer.overlay).toBe(true);
    expect(getSection("trust_strip")?.overlay).toBeUndefined();
  });

  it("renders a below-the-fold sticky bar outside LazySection", () => {
    const html = renderPage([
      section("a", "trust_strip", trust_strip.defaultProps),
      section("b", "trust_strip", trust_strip.defaultProps),
      section("c", "trust_strip", trust_strip.defaultProps),
      section("bar", "sticky_cta_bar", sticky_cta_bar.defaultProps),
    ]);
    // Third trust strip (index 2) is lazy — the mechanism still works.
    expect(html).toContain('data-lazy-for="c"');
    // The bar (index 3) is not, and carries the overlay marker the
    // storefront reveal script uses to skip it.
    expect(html).not.toContain('data-lazy-for="bar"');
    expect(html).toMatch(/data-section-id="bar"[^>]*data-section-overlay="true"/);
  });
});

describe("sticky_cta_bar primary kinds", () => {
  it("link kind renders a store-prefixed anchor, never a button inside an anchor", () => {
    const html = renderPage(
      [section("bar", "sticky_cta_bar", sticky_cta_bar.defaultProps)],
      "/s/demo",
    );
    expect(html).toContain('href="/s/demo/checkout"');
    expect(html).not.toMatch(/<a[^>]*>\s*<button/);
    // Safe-area padding for the iPhone home indicator.
    expect(html).toContain("env(safe-area-inset-bottom)");
  });

  it("scroll_to_form kind renders a button instead of a link", () => {
    const html = renderPage(
      [
        section("bar", "sticky_cta_bar", {
          ...sticky_cta_bar.defaultProps,
          primary_kind: "scroll_to_form",
          primary_label_i18n: { en: "Order now", ar: "اطلب الآن" },
        }),
      ],
      "/s/demo",
    );
    expect(html).not.toContain('href="/s/demo/checkout"');
    expect(html).toMatch(/<button[^>]*type="button"[^>]*>[^<]*Order now/);
  });
});

describe("countdown_announcement reads hours → minutes → seconds in LTR", () => {
  it("emits the unit labels in reading order", () => {
    const html = renderPage([
      section("cd", "countdown_announcement", countdown_announcement.defaultProps),
    ]);
    expect(html.indexOf("Hours")).toBeGreaterThan(-1);
    expect(html.indexOf("Hours")).toBeLessThan(html.indexOf("Mins"));
    expect(html.indexOf("Mins")).toBeLessThan(html.indexOf("Secs"));
  });
});
