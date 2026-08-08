// Optional smoke render — proves a section component returns markup
// when fed defaultProps + a fake runtime. Skipped from the acceptance
// command (which only runs `_registry.test.ts`), but a useful safety
// net during iteration. Run with `npx vitest run sections/_render-smoke`.

import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StoreBaseProvider } from "./helpers/store-context";

import trust_strip from "./trust_strip";
import hero_image from "./hero_image";

const runtime = {
  page_id: "home" as const,
  breakpoint: "mobile" as const,
  locale: "en" as const,
  audience_segments: [],
  ab_test_arms: {},
  now: new Date("2026-05-15T00:00:00Z"),
};

const renderCtx = {
  tenant: {} as never,
  runtime,
  products: [],
  categories: [],
};

describe("section render smoke", () => {
  it("trust_strip renders pills", () => {
    const Render = trust_strip.render;
    const html = renderToStaticMarkup(
      React.createElement(
        StoreBaseProvider,
        { base: "", children: null },
        React.createElement(Render, {
          props: trust_strip.defaultProps,
          ctx: renderCtx,
        } as never),
      ),
    );
    expect(html).toContain("Cash on delivery");
    expect(html).toMatch(/bg-bk-mint/);
  });

  it("hero_image renders title + CTA", () => {
    const Render = hero_image.render;
    const html = renderToStaticMarkup(
      React.createElement(
        StoreBaseProvider,
        { base: "", children: null },
        React.createElement(Render, {
          props: hero_image.defaultProps,
          ctx: renderCtx,
        } as never),
      ),
    );
    expect(html).toContain("The new collection has arrived");
    expect(html).toContain("Shop the drop");
  });
});
