import { describe, expect, it } from "vitest";
import {
  attributeSimilarity,
  parseProductAttributeDefs,
  resolveProductAttribute,
  resolveProductAttributes,
  type ProductAttributeDef,
} from "./product-attribute";

/** A definition row shaped the way PostgREST returns it. */
function defRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "d1",
    key: "scent_family",
    name_i18n: { en: "Scent family", ar: "العائلة العطرية" },
    kind: "enum",
    options: [
      { value: "oriental", label_i18n: { ar: "شرقي" } },
      { value: "woody", label_i18n: { ar: "خشبي" } },
    ],
    is_filterable: true,
    is_comparable: true,
    display_order: 0,
    ...over,
  };
}

const parseOne = (row: Record<string, unknown>): ProductAttributeDef =>
  parseProductAttributeDefs([row])[0];

describe("parseProductAttributeDefs", () => {
  it("keeps a well-formed definition of every kind", () => {
    const defs = parseProductAttributeDefs([
      defRow(),
      defRow({ id: "d2", key: "longevity", kind: "range", options: undefined, range_min: 1, range_max: 5 }),
      defRow({ id: "d3", key: "notes", kind: "group_list", options: undefined, group_keys: [{ key: "top" }] }),
      defRow({ id: "d4", key: "story", kind: "text", options: undefined }),
      defRow({ id: "d5", key: "unisex", kind: "boolean", options: undefined }),
    ]);
    expect(defs.map((d) => d.kind).sort()).toEqual([
      "boolean", "enum", "group_list", "range", "text",
    ]);
  });

  it("drops a definition whose shape does not match its kind", () => {
    // enum with no options, range with no bounds, group_list with no groups.
    expect(parseProductAttributeDefs([defRow({ options: [] })])).toHaveLength(0);
    expect(parseProductAttributeDefs([defRow({ kind: "range", options: undefined })])).toHaveLength(0);
    expect(parseProductAttributeDefs([defRow({ kind: "group_list", options: undefined })])).toHaveLength(0);
  });

  it("drops an unknown kind instead of throwing", () => {
    expect(parseProductAttributeDefs([defRow({ kind: "colour_picker" })])).toHaveLength(0);
  });

  it("orders by display_order, then key", () => {
    const defs = parseProductAttributeDefs([
      defRow({ id: "b", key: "zeta", display_order: 1 }),
      defRow({ id: "c", key: "alpha", display_order: 1 }),
      defRow({ id: "a", key: "omega", display_order: 0 }),
    ]);
    expect(defs.map((d) => d.key)).toEqual(["omega", "alpha", "zeta"]);
  });

  it("tolerates nulls where PostgREST returns them", () => {
    const d = parseOne(defRow({ name_i18n: null, is_filterable: null, display_order: null }));
    expect(d.name_i18n).toEqual({});
    expect(d.is_filterable).toBe(true);
    expect(d.display_order).toBe(0);
  });
});

describe("resolveProductAttribute", () => {
  it("resolves an enum and hands back the matching option", () => {
    const r = resolveProductAttribute(parseOne(defRow()), "oriental");
    expect(r).toMatchObject({ kind: "enum", value: "oriental" });
    expect(r?.kind === "enum" && r.option.label_i18n?.ar).toBe("شرقي");
  });

  it("drops an enum value the merchant has since removed", () => {
    // Otherwise the storefront renders a chip with no label.
    expect(resolveProductAttribute(parseOne(defRow()), "aquatic")).toBeNull();
  });

  it("clamps a range value to the declared scale rather than dropping it", () => {
    const def = parseOne(defRow({ kind: "range", options: undefined, range_min: 1, range_max: 5 }));
    expect(resolveProductAttribute(def, 9)).toMatchObject({ value: 5 });
    expect(resolveProductAttribute(def, -3)).toMatchObject({ value: 1 });
    expect(resolveProductAttribute(def, 3.5)).toMatchObject({ value: 3.5 });
  });

  it("rejects a non-numeric range value", () => {
    const def = parseOne(defRow({ kind: "range", options: undefined, range_min: 1, range_max: 5 }));
    expect(resolveProductAttribute(def, "strong")).toBeNull();
    // Coercion would turn each of these into a number and then clamp it to
    // the bottom of the scale, drawing a meter for a value that isn't there.
    expect(resolveProductAttribute(def, null)).toBeNull();
    expect(resolveProductAttribute(def, true)).toBeNull();
    expect(resolveProductAttribute(def, [])).toBeNull();
    expect(resolveProductAttribute(def, "")).toBeNull();
    // A numeric string is legitimate — PostgREST returns `numeric` that way.
    expect(resolveProductAttribute(def, "4.5")).toMatchObject({ value: 4.5 });
  });

  it("keeps only declared groups, in declared order, dropping empties", () => {
    const def = parseOne(defRow({
      kind: "group_list", options: undefined,
      group_keys: [{ key: "top" }, { key: "heart" }, { key: "base" }],
    }));
    const r = resolveProductAttribute(def, {
      top: ["برغموت"],
      heart: ["  "],          // whitespace only -> group dropped
      unknown_group: ["x"],   // not declared -> dropped
      base: ["عنبر", "مسك"],
    });
    expect(r?.kind === "group_list" && Object.keys(r.value)).toEqual(["top", "base"]);
  });

  it("drops a group_list whose groups are all empty", () => {
    const def = parseOne(defRow({ kind: "group_list", options: undefined, group_keys: [{ key: "top" }] }));
    expect(resolveProductAttribute(def, { top: [] })).toBeNull();
  });

  it("drops text that is present but blank", () => {
    const def = parseOne(defRow({ kind: "text", options: undefined }));
    expect(resolveProductAttribute(def, { ar: "   ", en: "" })).toBeNull();
    expect(resolveProductAttribute(def, { ar: "قصة" })).toMatchObject({ kind: "text" });
  });

  it("does not coerce a boolean from a string", () => {
    const def = parseOne(defRow({ kind: "boolean", options: undefined }));
    expect(resolveProductAttribute(def, "true")).toBeNull();
    expect(resolveProductAttribute(def, true)).toMatchObject({ value: true });
    expect(resolveProductAttribute(def, false)).toMatchObject({ value: false });
  });
});

describe("resolveProductAttributes", () => {
  const defs = [
    defRow({ id: "d1", key: "scent_family", display_order: 1 }),
    defRow({ id: "d2", key: "longevity", kind: "range", options: undefined, range_min: 1, range_max: 5, display_order: 0 }),
  ];

  it("pairs values with definitions and orders by display_order", () => {
    const out = resolveProductAttributes(defs, [
      { product_id: "p1", attribute_def_id: "d1", value: "woody" },
      { product_id: "p1", attribute_def_id: "d2", value: 4 },
    ]);
    expect(out.map((a) => a.def.key)).toEqual(["longevity", "scent_family"]);
  });

  it("drops a value whose definition does not exist", () => {
    const out = resolveProductAttributes(defs, [
      { product_id: "p1", attribute_def_id: "deleted", value: "x" },
    ]);
    expect(out).toEqual([]);
  });

  it("drops one bad row without losing the good ones", () => {
    // This runs on the render path — a single malformed row must not
    // blank out the whole attribute block.
    const out = resolveProductAttributes(defs, [
      { product_id: "p1", attribute_def_id: "d1", value: { nonsense: true } },
      { product_id: "p1", attribute_def_id: "d2", value: 3 },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].def.key).toBe("longevity");
  });

  it("returns an empty list when the tenant has no taxonomy", () => {
    expect(resolveProductAttributes([], [])).toEqual([]);
  });
});

describe("attributeSimilarity", () => {
  const defs = parseProductAttributeDefs([
    {
      id: "d1", key: "scent_family", kind: "enum", is_comparable: true, display_order: 0,
      name_i18n: { en: "Family" },
      options: [{ value: "oriental" }, { value: "woody" }, { value: "fresh" }],
    },
    {
      id: "d2", key: "longevity", kind: "range", is_comparable: true, display_order: 1,
      name_i18n: { en: "Longevity" }, range_min: 1, range_max: 5,
    },
    {
      id: "d3", key: "notes", kind: "group_list", is_comparable: true, display_order: 2,
      name_i18n: { en: "Notes" },
      group_keys: [{ key: "top" }, { key: "base" }],
    },
    {
      id: "d4", key: "season", kind: "enum", is_comparable: false, display_order: 3,
      name_i18n: { en: "Season" }, options: [{ value: "summer" }, { value: "winter" }],
    },
    { id: "d5", key: "story", kind: "text", is_comparable: true, display_order: 4, name_i18n: { en: "Story" } },
  ]);

  const attrs = (values: Record<string, unknown>) =>
    resolveProductAttributes(
      defs,
      Object.entries(values).map(([key, value]) => ({
        product_id: "p",
        attribute_def_id: defs.find((d) => d.key === key)?.id ?? `missing:${key}`,
        value,
      })),
    );

  it("scores 1 for identical comparable attributes", () => {
    const a = attrs({ scent_family: "oriental", longevity: 4 });
    expect(attributeSimilarity(a, a)).toBe(1);
  });

  it("scores 0 when every comparable attribute differs maximally", () => {
    const a = attrs({ scent_family: "oriental", longevity: 1 });
    const b = attrs({ scent_family: "woody", longevity: 5 });
    expect(attributeSimilarity(a, b)).toBe(0);
  });

  it("treats a range as a distance, not a match", () => {
    // 4 vs 3 on a 1–5 scale is close; 4 vs 1 is not.
    const a = attrs({ longevity: 4 });
    expect(attributeSimilarity(a, attrs({ longevity: 3 }))).toBeCloseTo(0.75, 5);
    expect(attributeSimilarity(a, attrs({ longevity: 1 }))).toBeCloseTo(0.25, 5);
  });

  it("scores grouped lists by overlap, across tiers", () => {
    // Same note in a different tier still counts — a shared accord is a
    // shared accord wherever it sits in the pyramid.
    const a = attrs({ notes: { top: ["برغموت"], base: ["عنبر"] } });
    const b = attrs({ notes: { top: ["عنبر"], base: ["برغموت"] } });
    expect(attributeSimilarity(a, b)).toBe(1);

    const c = attrs({ notes: { top: ["برغموت"], base: ["مسك"] } });
    // shared 1 of union 3
    expect(attributeSimilarity(a, c)).toBeCloseTo(1 / 3, 5);
  });

  it("ignores attributes the merchant did not mark comparable", () => {
    const a = attrs({ season: "summer" });
    const b = attrs({ season: "winter" });
    expect(attributeSimilarity(a, b)).toBeNull();
  });

  it("ignores text — string equality on prose is noise, not signal", () => {
    const a = attrs({ story: { en: "same" } });
    const b = attrs({ story: { en: "same" } });
    expect(attributeSimilarity(a, b)).toBeNull();
  });

  it("returns null when the two share no comparable attribute", () => {
    expect(attributeSimilarity(attrs({ scent_family: "oriental" }), attrs({ longevity: 3 }))).toBeNull();
    expect(attributeSimilarity([], attrs({ longevity: 3 }))).toBeNull();
  });

  it("averages only over attributes BOTH products carry", () => {
    // One shares family (1.0) and longevity (0.5); the extra note list on
    // the left must not dilute the score toward zero.
    const a = attrs({ scent_family: "oriental", longevity: 3, notes: { top: ["x"] } });
    const b = attrs({ scent_family: "oriental", longevity: 1 });
    expect(attributeSimilarity(a, b)).toBeCloseTo((1 + 0.5) / 2, 5);
  });

  it("is symmetric", () => {
    const a = attrs({ scent_family: "oriental", longevity: 4, notes: { top: ["a", "b"] } });
    const b = attrs({ scent_family: "woody", longevity: 2, notes: { top: ["b", "c"] } });
    expect(attributeSimilarity(a, b)).toBe(attributeSimilarity(b, a));
  });
});
