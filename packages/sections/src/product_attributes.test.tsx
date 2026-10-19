// Attribute display — the kind decides the control, the layout decides the
// arrangement. Static-markup renders (no DOM lib in this package).

import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parseProductAttributeDefs, resolveProductAttributes } from "@scheniders/shared";
import { StoreBaseProvider } from "./helpers/store-context";
import product_attributes from "./product_attributes";
import type { SectionRenderContext } from "./_types";
import type { Product } from "./types";

const runtime = {
  page_id: "product" as const,
  breakpoint: "mobile" as const,
  locale: "ar" as const,
  audience_segments: [],
  ab_test_arms: {},
  now: new Date("2026-09-09T00:00:00Z"),
};

const baseCtx = {
  tenant: { id: "t1", business_name: "متجر" } as never,
  runtime,
  products: [],
  categories: [],
};

/** A realistic perfume taxonomy — the same shape the migration seeds. */
const DEFS = parseProductAttributeDefs([
  {
    id: "d1", key: "scent_family", kind: "enum", display_order: 0,
    name_i18n: { ar: "العائلة العطرية", en: "Scent family" },
    options: [
      { value: "oriental", label_i18n: { ar: "شرقي", en: "Oriental" } },
      { value: "woody", label_i18n: { ar: "خشبي", en: "Woody" } },
    ],
  },
  {
    id: "d2", key: "notes", kind: "group_list", display_order: 1,
    name_i18n: { ar: "هرم الروائح", en: "Note pyramid" },
    group_keys: [
      { key: "top", label_i18n: { ar: "المقدمة" } },
      { key: "heart", label_i18n: { ar: "القلب" } },
      { key: "base", label_i18n: { ar: "القاعدة" } },
    ],
  },
  {
    id: "d3", key: "longevity", kind: "range", display_order: 2,
    name_i18n: { ar: "الثبات", en: "Longevity" },
    range_min: 1, range_max: 5, unit_i18n: { ar: "من ٥" },
  },
  { id: "d4", key: "unisex", kind: "boolean", display_order: 3, name_i18n: { ar: "للجنسين" } },
  { id: "d5", key: "story", kind: "text", display_order: 4, name_i18n: { ar: "القصة" } },
]);

const VALUES = [
  { product_id: "p1", attribute_def_id: "d1", value: "oriental" },
  { product_id: "p1", attribute_def_id: "d2", value: { top: ["برغموت"], base: ["عنبر", "مسك"] } },
  { product_id: "p1", attribute_def_id: "d3", value: 4 },
  { product_id: "p1", attribute_def_id: "d4", value: true },
  { product_id: "p1", attribute_def_id: "d5", value: { ar: "عطر مسائي" } },
];

function productWith(attrs = resolveProductAttributes(DEFS, VALUES)): Product {
  return {
    id: "p1",
    name: "فيوجن",
    price: 35000,
    stock_quantity: 5,
    reserved_quantity: 0,
    is_archived: false,
    attributes: attrs,
  };
}

function render(
  props: Parameters<typeof product_attributes.render>[0]["props"],
  ctx: Partial<SectionRenderContext> = {},
): string {
  return renderToStaticMarkup(
    React.createElement(
      StoreBaseProvider,
      { base: "", children: null },
      React.createElement(product_attributes.render, {
        props,
        ctx: { ...baseCtx, ...ctx } as SectionRenderContext,
      }),
    ),
  );
}

const defaults = product_attributes.defaultProps;

describe("product_attributes", () => {
  it("renders nothing when the product has no attributes", () => {
    // An empty block with a heading is worse than no block at all.
    expect(render(defaults, { product: productWith([]) })).toBe("");
    expect(render(defaults, { product: undefined })).toBe("");
  });

  it("renders each kind with its own control", () => {
    const html = render(defaults, { product: productWith() });
    expect(html).toContain("شرقي");        // enum → chip label
    expect(html).toContain("برغموت");      // group_list → pyramid item
    expect(html).toContain("من ٥");        // range → unit beside the value
    expect(html).toContain("نعم");         // boolean → localised yes
    expect(html).toContain("عطر مسائي");   // text → prose
  });

  it("draws a meter proportional to the declared scale", () => {
    // 4 on a 1–5 scale is three quarters of the way along, not 80%.
    const html = render(defaults, { product: productWith() });
    expect(html).toContain("width:75%");
  });

  it("keeps groups in the merchant's declared order, not the data's", () => {
    // The value object lists top then base; the definition says
    // top → heart → base. A pyramid read out of order is just a list.
    const html = render(defaults, { product: productWith() });
    expect(html.indexOf("المقدمة")).toBeLessThan(html.indexOf("القاعدة"));
  });

  it("omits a group the product has no values for", () => {
    const html = render(defaults, { product: productWith() });
    expect(html).not.toContain("القلب");
  });

  it("uses attribute_keys as both a filter and an ordering", () => {
    const html = render(
      { ...defaults, attribute_keys: ["longevity", "scent_family"] },
      { product: productWith() },
    );
    expect(html).not.toContain("برغموت");
    expect(html.indexOf("الثبات")).toBeLessThan(html.indexOf("العائلة العطرية"));
  });

  it("ignores a key the product does not carry", () => {
    const html = render(
      { ...defaults, attribute_keys: ["longevity", "does_not_exist"] },
      { product: productWith() },
    );
    expect(html).toContain("الثبات");
    expect(html).not.toContain("شرقي");
  });

  it("renders nothing when attribute_keys matches none of them", () => {
    expect(render({ ...defaults, attribute_keys: ["nope"] }, { product: productWith() })).toBe("");
  });

  it("table layout puts every attribute in a scrollable table", () => {
    const html = render({ ...defaults, layout: "table" }, { product: productWith() });
    expect(html).toContain("<table");
    expect(html).toContain('scope="row"');
    // Wide values scroll inside their own container, never the page body.
    expect(html).toContain("overflow-x-auto");
    expect(html).toContain("عنبر · مسك");
  });

  it("accordion layout keeps the content in the DOM when folded", () => {
    // <details> so it is indexable and works without JavaScript.
    const html = render(
      { ...defaults, layout: "accordion", start_collapsed: true },
      { product: productWith() },
    );
    expect(html).toContain("<details");
    expect(html).not.toContain("<details open");
    expect(html).toContain("برغموت");
  });

  it("is driven entirely by tenant data — no vertical baked in", () => {
    // The same section, a coffee roaster's taxonomy, zero code changes.
    const coffeeDefs = parseProductAttributeDefs([
      {
        id: "c1", key: "roast", kind: "range", display_order: 0,
        name_i18n: { ar: "درجة التحميص", en: "Roast" },
        range_min: 0, range_max: 10, unit_i18n: { en: "of 10" },
      },
      {
        id: "c2", key: "origin", kind: "enum", display_order: 1,
        name_i18n: { en: "Origin" },
        options: [{ value: "ethiopia", label_i18n: { en: "Ethiopia" } }],
      },
    ]);
    const html = render(defaults, {
      runtime: { ...runtime, locale: "en" },
      product: productWith(
        resolveProductAttributes(coffeeDefs, [
          { product_id: "p1", attribute_def_id: "c1", value: 7 },
          { product_id: "p1", attribute_def_id: "c2", value: "ethiopia" },
        ]),
      ),
    });
    expect(html).toContain("Roast");
    expect(html).toContain("Ethiopia");
    expect(html).toContain("width:70%");
  });

  it("parses its own defaults", () => {
    expect(product_attributes.schema.safeParse(defaults).success).toBe(true);
  });
});
