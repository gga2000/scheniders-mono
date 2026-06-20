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
  it("registers under content and is allowed on content pages but NOT cart/checkout (EC6)", () => {
    const def = getSection("html_embed");
    expect(def).toBeTruthy();
    expect(def).toBe(html_embed_def);
    expect(def?.category).toBe("content");
    // Allowed on content pages…
    expect(def?.valid_on).toEqual(
      expect.arrayContaining([
        "home",
        "category",
        "product",
        "about",
        "faq",
        "policy_privacy",
      ]),
    );
    // …but never on the COD conversion path (no merchant embed near checkout).
    expect(def?.valid_on).not.toContain("cart");
    expect(def?.valid_on).not.toContain("checkout");
    expect(def?.valid_on).not.toContain("checkout_success");
    // defaultProps round-trips through the schema.
    expect(def?.schema.safeParse(def.defaultProps).success).toBe(true);
  });

  it("renders a sandboxed iframe WITHOUT allow-same-origin (EC6)", () => {
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
    // The embed must NOT share the parent origin (no cookie/localStorage access).
    expect(html).not.toContain("allow-same-origin");
    expect(html).toContain("allow-scripts");
    // React serialises `srcDoc` as `srcdoc` and HTML-escapes the body.
    expect(html.toLowerCase()).toContain("srcdoc=");
    expect(html).toContain("&lt;p&gt;hello&lt;/p&gt;");
    expect(html).toMatch(/height:\s*250px/i);
  });
});
