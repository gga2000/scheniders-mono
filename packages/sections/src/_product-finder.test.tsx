// product_finder: what the section decides BEFORE the shopper interacts —
// which questions are worth asking, and whether to appear at all.
// (Static markup only; this package has no DOM library.)

import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parseProductAttributeDefs, resolveProductAttributes } from "@scheniders/shared";
import { StoreBaseProvider } from "./helpers/store-context";
import product_finder from "./product_finder";
import type { SectionRenderContext } from "./_types";
import type { Product } from "./types";

const DEFS = parseProductAttributeDefs([
  {
    id: "d1", key: "scent_family", kind: "enum", display_order: 0,
    name_i18n: { ar: "العائلة" },
    options: [{ value: "oriental", label_i18n: { ar: "شرقي" } }],
  },
]);

function product(values?: Record<string, unknown>): Product {
  return {
    id: "p1",
    name: "عطر",
    price: 30000,
    stock_quantity: 3,
    reserved_quantity: 0,
    is_archived: false,
    attributes: values
      ? resolveProductAttributes(
          DEFS,
          Object.entries(values).map(([key, value]) => ({
            product_id: "p1",
            attribute_def_id: DEFS.find((d) => d.key === key)?.id ?? `missing:${key}`,
            value,
          })),
        )
      : undefined,
  };
}

function render(
  props: typeof product_finder.defaultProps,
  ctx: Partial<SectionRenderContext> = {},
): string {
  return renderToStaticMarkup(
    React.createElement(
      StoreBaseProvider,
      { base: "", children: null },
      React.createElement(product_finder.render, {
        props,
        ctx: {
          tenant: { id: "t1", business_name: "متجر" } as never,
          runtime: {
            page_id: "home" as const,
            breakpoint: "mobile" as const,
            locale: "ar" as const,
            audience_segments: [],
            ab_test_arms: {},
            now: new Date("2026-09-09T00:00:00Z"),
          },
          products: [],
          categories: [],
          ...ctx,
        } as SectionRenderContext,
      }),
    ),
  );
}

const defaults = product_finder.defaultProps;

describe("product_finder", () => {
  it("renders nothing when no product can answer any question", () => {
    // An empty quiz is worse than no quiz.
    expect(render(defaults, { products: [product()] })).toBe("");
    expect(render(defaults, { products: [] })).toBe("");
  });

  it("appears once the catalogue can answer at least one question", () => {
    const html = render(defaults, { products: [product({ scent_family: "oriental" })] });
    expect(html).toContain("لكَّي عطرك");
    expect(html).toContain("ابدأ");
  });

  it("only counts questions the catalogue can actually answer", () => {
    // The defaults ask three questions; this catalogue answers one, so the
    // progress denominator must be 1 — asking about longevity and season
    // when no product carries them makes the result look arbitrary.
    const html = render(defaults, { products: [product({ scent_family: "oriental" })] });
    expect(html).not.toContain("/ 3");
  });

  it("renders nothing when the merchant left a question with no answers", () => {
    const props = {
      ...defaults,
      questions: [{ ...defaults.questions[0], answers: [] }],
    };
    expect(render(props, { products: [product({ scent_family: "oriental" })] })).toBe("");
  });

  it("parses its own defaults", () => {
    expect(product_finder.schema.safeParse(defaults).success).toBe(true);
  });

  it("asks only about attribute keys, never about product ids", () => {
    // The engine must stay vertical-neutral: every question references an
    // attribute the merchant owns.
    for (const q of defaults.questions) {
      expect(q.attribute_key).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(q.answers.length).toBeGreaterThan(0);
    }
  });
});
