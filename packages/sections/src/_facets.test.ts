// Attribute facets on the category grid: what gets offered, and what a
// selection actually means.

import { describe, expect, it } from "vitest";
import { parseProductAttributeDefs, resolveProductAttributes } from "@scheniders/shared";
import { buildFacets, matchesFacets } from "./helpers/attribute-facets";
import type { Product } from "./types";

const DEFS = parseProductAttributeDefs([
  {
    id: "d1", key: "scent_family", kind: "enum", display_order: 0, is_filterable: true,
    name_i18n: { ar: "العائلة العطرية", en: "Scent family" },
    options: [
      { value: "oriental", label_i18n: { ar: "شرقي", en: "Oriental" } },
      { value: "woody", label_i18n: { ar: "خشبي", en: "Woody" } },
      { value: "fresh", label_i18n: { ar: "منعش", en: "Fresh" } },
    ],
  },
  {
    id: "d2", key: "season", kind: "enum", display_order: 1, is_filterable: true,
    name_i18n: { ar: "الموسم", en: "Season" },
    options: [
      { value: "summer", label_i18n: { ar: "صيفي" } },
      { value: "winter", label_i18n: { ar: "شتوي" } },
    ],
  },
  {
    id: "d3", key: "longevity", kind: "range", display_order: 2, is_filterable: true,
    name_i18n: { ar: "الثبات" }, range_min: 1, range_max: 5,
  },
  {
    id: "d4", key: "notes", kind: "group_list", display_order: 3, is_filterable: false,
    name_i18n: { ar: "هرم الروائح" }, group_keys: [{ key: "top" }],
  },
  {
    id: "d5", key: "unisex", kind: "boolean", display_order: 4, is_filterable: true,
    name_i18n: { ar: "للجنسين" },
  },
]);

function product(id: string, values: Record<string, unknown>): Product {
  const rows = Object.entries(values).map(([key, value]) => ({
    product_id: id,
    attribute_def_id: DEFS.find((d) => d.key === key)!.id,
    value,
  }));
  return {
    id,
    name: id,
    price: 30000,
    stock_quantity: 5,
    reserved_quantity: 0,
    is_archived: false,
    attributes: resolveProductAttributes(DEFS, rows),
  };
}

const POOL: Product[] = [
  product("a", { scent_family: "oriental", season: "winter", longevity: 5, unisex: true }),
  product("b", { scent_family: "oriental", season: "summer", longevity: 3 }),
  product("c", { scent_family: "woody", season: "winter", longevity: 4, unisex: true }),
];

describe("buildFacets", () => {
  const facets = buildFacets(POOL, "ar");

  it("offers a row per filterable attribute, in the merchant's order", () => {
    expect(facets.map((f) => f.key)).toEqual(["scent_family", "season", "unisex"]);
  });

  it("uses the merchant's own labels", () => {
    expect(facets[0].name).toBe("العائلة العطرية");
    expect(facets[0].options.map((o) => o.label)).toContain("شرقي");
  });

  it("only offers values products on this page actually have", () => {
    // "fresh" is declared in the taxonomy but nothing here carries it, and a
    // filter that returns nothing is worse than no filter.
    expect(facets[0].options.map((o) => o.id)).toEqual([
      "scent_family:oriental",
      "scent_family:woody",
    ]);
  });

  it("counts how many products each option matches, most first", () => {
    expect(facets[0].options[0]).toMatchObject({ id: "scent_family:oriental", count: 2 });
    expect(facets[0].options[1]).toMatchObject({ id: "scent_family:woody", count: 1 });
  });

  it("skips an attribute the merchant marked non-filterable", () => {
    expect(facets.map((f) => f.key)).not.toContain("notes");
  });

  it("skips ranges — no threshold here was chosen by the merchant", () => {
    expect(facets.map((f) => f.key)).not.toContain("longevity");
  });

  it("drops a facet every product on the page shares", () => {
    // Both are oriental, so offering "oriental" narrows nothing.
    const shared = buildFacets([POOL[0], product("d", { scent_family: "oriental" })], "ar");
    expect(shared.map((f) => f.key)).not.toContain("scent_family");
  });

  it("keeps a single-option facet that DOES narrow", () => {
    // `unisex` has one option, carried by two of three products. Dropping it
    // for having one option would lose a filter that works.
    expect(facets.map((f) => f.key)).toContain("unisex");
    expect(facets.find((f) => f.key === "unisex")!.options).toHaveLength(1);
  });

  it("returns nothing when no product carries attributes", () => {
    expect(buildFacets([{ ...POOL[0], attributes: undefined }], "ar")).toEqual([]);
  });
});

describe("matchesFacets", () => {
  const facets = buildFacets(POOL, "ar");
  const pick = (...ids: string[]) => new Set(ids);
  const matching = (sel: Set<string>) =>
    POOL.filter((p) => matchesFacets(p, sel, facets)).map((p) => p.id);

  it("passes everything when nothing is selected", () => {
    expect(matching(pick())).toEqual(["a", "b", "c"]);
  });

  it("narrows to one value", () => {
    expect(matching(pick("scent_family:woody"))).toEqual(["c"]);
  });

  it("treats options WITHIN one attribute as alternatives", () => {
    // Picking two scent families should widen the list, not empty it.
    expect(matching(pick("scent_family:oriental", "scent_family:woody"))).toEqual(["a", "b", "c"]);
  });

  it("treats options ACROSS attributes as narrowing", () => {
    expect(matching(pick("scent_family:oriental", "season:winter"))).toEqual(["a"]);
  });

  it("can select down to nothing, and says so honestly", () => {
    expect(matching(pick("scent_family:woody", "season:summer"))).toEqual([]);
  });

  it("excludes a product that lacks the attribute entirely", () => {
    // b has no `unisex` value at all.
    expect(matching(pick("unisex:true"))).toEqual(["a", "c"]);
  });
});
