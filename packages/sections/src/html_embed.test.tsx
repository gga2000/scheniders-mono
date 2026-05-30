// =====================================================================
// html_embed — section tests
// =====================================================================
// 1. Registers correctly under its `type` key with sane metadata.
// 2. Renders a sandboxed iframe with the configured srcDoc + height.
// =====================================================================

import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import "./html_embed";
import { getSection } from "./_registry";
import html_embed_def from "./html_embed";

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

describe("html_embed section", () => {
  it("registers correctly with category=content and a valid_on covering all pages", () => {
    const def = getSection("html_embed");
    expect(def).toBeTruthy();
    expect(def).toBe(html_embed_def);
    expect(def?.category).toBe("content");
    // Covers every documented page.
    expect(def?.valid_on).toEqual(
      expect.arrayContaining([
        "home",
        "category",
        "product",
        "search",
        "cart",
        "checkout",
        "checkout_success",
        "track",
        "about",
        "faq",
        "contact",
        "policy_shipping",
        "policy_returns",
        "policy_privacy",
        "policy_terms",
        "not_found",
      ]),
    );
    // defaultProps round-trips through the schema.
    expect(def?.schema.safeParse(def.defaultProps).success).toBe(true);
  });

  it("renders a sandboxed iframe with the configured srcDoc + height", () => {
    const Render = html_embed_def.render;
    const html = renderToStaticMarkup(
      React.createElement(Render, {
        props: {
          html: "<p>hello</p>",
          height_px: 250,
        },
        ctx: renderCtx,
      } as never),
    );
    expect(html).toContain("<iframe");
    expect(html).toContain('sandbox="allow-scripts allow-same-origin"');
    // React serialises `srcDoc` as `srcdoc` and HTML-escapes the body.
    expect(html.toLowerCase()).toContain("srcdoc=");
    expect(html).toContain("&lt;p&gt;hello&lt;/p&gt;");
    expect(html).toMatch(/height:\s*250px/i);
  });
});
