// pdp_related_products: "related" should mean related, when the merchant
// has given us something to compare on — and should not regress when they
// have not.

import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parseProductAttributeDefs, resolveProductAttributes } from "@scheniders/shared";
import { StoreBaseProvider } from "./helpers/store-context";
import pdp_related_products from "./pdp_related_products";
import type { SectionRenderContext } from "./_types";
import type { Product } from "./types";

const DEFS = parseProductAttributeDefs([
  {
    id: "d1", key: "scent_family", kind: "enum", is_comparable: true, display_order: 0,
    name_i18n: { en: "Family" },
    options: [{ value: "oriental" }, { value: "woody" }, { value: "fresh" }],
  },
  {
    id: "d2", key: "longevity", kind: "range", is_comparable: true, display_order: 1,
    name_i18n: { en: "Longevity" }, range_min: 1, range_max: 5,
  },
]);

function make(id: string, name: string, values?: Record<string, unknown>, categoryId?: string): Product {
  return {
    id,
    name,
    slug: id,
    price: 30000,
    stock_quantity: 5,
    reserved_quantity: 0,
    is_archived: false,
    category_id: categoryId ?? null,
    attributes: values
      ? resolveProductAttributes(
          DEFS,
          Object.entries(values).map(([key, value]) => ({
            product_id: id,
            attribute_def_id: DEFS.find((d) => d.key === key)!.id,
            value,
          })),
        )
      : undefined,
  };
}

function order(ctx: Partial<SectionRenderContext>): string[] {
  const html = renderToStaticMarkup(
    React.createElement(
      StoreBaseProvider,
      { base: "", children: null },
      React.createElement(pdp_related_products.render, {
        props: pdp_related_products.defaultProps,
        ctx: {
          tenant: { id: "t1", business_name: "متجر" } as never,
          runtime: {
            page_id: "product" as const,
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
  // Card order, read off the product links. A card emits several links to
  // the same product (image, title, CTA), so keep first appearance only.
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of html.matchAll(/\/products\/([A-Za-z0-9_-]+)"/g)) {
    if (!seen.has(m[1])) {
      seen.add(m[1]);
      out.push(m[1]);
    }
  }
  return out;
}

describe("pdp_related_products — attribute similarity", () => {
  const current = make("current", "الحالي", { scent_family: "oriental", longevity: 4 });

  it("ranks the most similar product first", () => {
    const pool = [
      make("far", "بعيد", { scent_family: "woody", longevity: 1 }),
      make("near", "قريب", { scent_family: "oriental", longevity: 4 }),
      make("mid", "وسط", { scent_family: "oriental", longevity: 1 }),
    ];
    expect(order({ product: current, products: [current, ...pool] })).toEqual([
      "near", "mid", "far",
    ]);
  });

  it("never shows the product you are already looking at", () => {
    const pool = [make("other", "آخر", { scent_family: "oriental", longevity: 4 })];
    expect(order({ product: current, products: [current, ...pool] })).not.toContain("current");
  });

  it("keeps unscored products, sorted below every scored one", () => {
    // A half-filled catalogue should degrade product by product, not blank
    // the whole grid.
    const pool = [
      make("plain", "بدون خصائص"),
      make("match", "مطابق", { scent_family: "oriental", longevity: 4 }),
    ];
    expect(order({ product: current, products: [current, ...pool] })).toEqual(["match", "plain"]);
  });

  it("falls back to category-first when nothing is comparable", () => {
    // Same behaviour as before attributes existed.
    const plain = make("plain", "الحالي", undefined, "cat-a");
    const pool = [
      make("otherCat", "قسم آخر", undefined, "cat-b"),
      make("sameCat", "نفس القسم", undefined, "cat-a"),
    ];
    expect(order({ product: plain, products: [plain, ...pool] })).toEqual([
      "sameCat", "otherCat",
    ]);
  });

  it("falls back when the current product has attributes but no one else does", () => {
    // `current` has no category, so category-first puts the other
    // categoryless product ahead of the one filed under cat-b.
    const pool = [make("b", "ب", undefined, "cat-b"), make("a", "أ")];
    expect(order({ product: current, products: [current, ...pool] })).toEqual(["a", "b"]);
  });

  it("renders nothing when there is nothing to relate to", () => {
    expect(order({ product: current, products: [current] })).toEqual([]);
  });
});
