// =====================================================================
// Lazy section boundary — render tests
// =====================================================================
// Confirms RenderPage marks below-fold sections (after position 2) with
// the lazy boundary and leaves the first two eager.
// =====================================================================

import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { RenderPage } from "./RenderSection";
import { StoreBaseProvider } from "./helpers/store-context";
// RenderSection does not register sections itself (the barrel does); pull
// in the one type this test renders so the registry lookup succeeds.
import "./trust_strip";
import type { PageConfig, RuntimeContext, SectionInstance } from "@scheniders/shared";

function makeInstance(id: string): SectionInstance {
  return {
    id,
    type: "trust_strip",
    enabled: true,
    base: {
      pills: [
        {
          label_i18n: { en: "Cash on delivery", ar: "الدفع عند الاستلام" },
          icon: "payments",
          bg: "mint",
        },
      ],
    },
  };
}

const runtime: RuntimeContext = {
  page_id: "home",
  breakpoint: "mobile",
  locale: "en",
  audience_segments: [],
  ab_test_arms: {},
  now: new Date("2026-05-15T00:00:00Z"),
};

const renderCtx = {
  tenant: {} as never,
  products: [],
  categories: [],
};

function renderPage(sections: SectionInstance[]): string {
  const page: PageConfig = { page_id: "home", sections };
  return renderToStaticMarkup(
    React.createElement(
      StoreBaseProvider,
      { base: "", children: null },
      React.createElement(RenderPage as React.ComponentType<{
        page: PageConfig;
        runtime: RuntimeContext;
        renderCtx: typeof renderCtx;
      }>, { page, runtime, renderCtx }),
    ),
  );
}

describe("RenderPage lazy boundary", () => {
  it("sections beyond position 2 carry the lazy marker", () => {
    const ids = ["a", "b", "c", "d", "e"];
    const html = renderPage(ids.map(makeInstance));
    // The first two sections must NOT be inside a lazy wrapper.
    // The remaining three must be.
    const lazyMatches = html.match(/data-lazy="true"/g) ?? [];
    expect(lazyMatches.length).toBe(3);
    // Each lazy wrapper should reference the right section id.
    expect(html).toContain('data-lazy-for="c"');
    expect(html).toContain('data-lazy-for="d"');
    expect(html).toContain('data-lazy-for="e"');
    expect(html).not.toContain('data-lazy-for="a"');
    expect(html).not.toContain('data-lazy-for="b"');
  });

  it("pages with 2 or fewer sections emit no lazy wrappers", () => {
    const html = renderPage([makeInstance("only-one")]);
    expect(html).not.toContain('data-lazy="true"');
  });

  it("lazy wrapper applies content-visibility CSS", () => {
    const html = renderPage(["a", "b", "c"].map(makeInstance));
    expect(html).toMatch(/content-visibility:\s*auto/);
    expect(html).toMatch(/contain-intrinsic-size/);
  });
});
