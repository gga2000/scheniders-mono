// @vitest-environment jsdom
// =====================================================================
// EC10 — per-section error boundary
// =====================================================================
// A section component that throws at render must be dropped individually,
// not crash the whole page. Uses the CLIENT renderer (jsdom) because React
// error boundaries are a no-op under legacy renderToStaticMarkup — they
// fire under the client renderer + Next's streaming SSR (what production
// uses).
// =====================================================================

import { describe, expect, it, vi, afterEach } from "vitest";
import React from "react";
import { render, cleanup } from "@testing-library/react";
import { z } from "zod";

import { registerSection } from "./_registry";
import { RenderPage } from "./RenderSection";
import { StoreBaseProvider } from "./helpers/store-context";
import trust_strip from "./trust_strip";

registerSection({
  type: "__throwing_test_section__",
  category: "content",
  name: { en: "Boom", ar: "Boom" },
  description: { en: "throws", ar: "throws" },
  thumbnail: "",
  valid_on: ["home"],
  schema: z.object({}),
  defaultProps: {},
  render: () => {
    throw new Error("intentional section render failure");
  },
} as never);

const runtime = {
  page_id: "home" as const,
  breakpoint: "mobile" as const,
  locale: "en" as const,
  audience_segments: [],
  ab_test_arms: {},
  now: new Date("2026-05-15T00:00:00Z"),
};
const renderCtx = { tenant: {} as never, runtime, products: [], categories: [] };

afterEach(cleanup);

describe("RenderSection per-section error boundary (EC10)", () => {
  it("drops a throwing section but still renders the rest of the page", () => {
    // React logs the caught boundary error — silence it for a clean run.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const page = {
      page_id: "home" as const,
      sections: [
        { id: "boom", type: "__throwing_test_section__", enabled: true, base: {} },
        { id: "ok", type: "trust_strip", enabled: true, base: trust_strip.defaultProps },
      ],
    };

    let container: HTMLElement | undefined;
    expect(() => {
      const result = render(
        React.createElement(
          StoreBaseProvider,
          { base: "", children: null },
          React.createElement(RenderPage, { page, runtime, renderCtx } as never),
        ),
      );
      container = result.container;
    }).not.toThrow();

    // The healthy section still rendered; the throwing one was isolated to null.
    expect(container?.querySelector('[data-section-id="ok"]')).toBeTruthy();
    const boom = container?.querySelector('[data-section-id="boom"]');
    expect(boom).toBeTruthy();
    expect(boom?.textContent ?? "").toBe("");

    spy.mockRestore();
  });
});
