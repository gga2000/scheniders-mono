import { describe, expect, it } from "vitest";
import { parseProductAttributeDefs, resolveProductAttributes } from "./product-attribute";
import { rankByAnswers, scoreProductAgainstAnswers } from "./product-finder";

const DEFS = parseProductAttributeDefs([
  {
    id: "d1", key: "scent_family", kind: "enum", display_order: 0, name_i18n: { en: "Family" },
    options: [{ value: "oriental" }, { value: "woody" }, { value: "fresh" }],
  },
  {
    id: "d2", key: "longevity", kind: "range", display_order: 1,
    name_i18n: { en: "Longevity" }, range_min: 1, range_max: 5,
  },
  {
    id: "d3", key: "notes", kind: "group_list", display_order: 2,
    name_i18n: { en: "Notes" }, group_keys: [{ key: "top" }, { key: "base" }],
  },
  { id: "d4", key: "unisex", kind: "boolean", display_order: 3, name_i18n: { en: "Unisex" } },
]);

const attrs = (values: Record<string, unknown>) =>
  resolveProductAttributes(
    DEFS,
    Object.entries(values).map(([key, value]) => ({
      product_id: "p",
      attribute_def_id: DEFS.find((d) => d.key === key)?.id ?? `missing:${key}`,
      value,
    })),
  );

describe("scoreProductAgainstAnswers", () => {
  it("scores a perfect set of answers as 1", () => {
    const a = attrs({ scent_family: "oriental", longevity: 5 });
    expect(
      scoreProductAgainstAnswers(a, [
        { attribute_key: "scent_family", value: "oriental" },
        { attribute_key: "longevity", value: "5" },
      ]),
    ).toBe(1);
  });

  it("treats a range near-miss as a good answer, not a mismatch", () => {
    // Asked for 5, found 4 on a 1–5 scale.
    const a = attrs({ longevity: 4 });
    expect(scoreProductAgainstAnswers(a, [{ attribute_key: "longevity", value: "5" }]))
      .toBeCloseTo(0.75, 5);
  });

  it("matches a note whatever tier it sits in, and however it is spelled", () => {
    const a = attrs({ notes: { base: ["عَنبر"] } });
    expect(scoreProductAgainstAnswers(a, [{ attribute_key: "notes", value: "عنبر" }])).toBe(1);
  });

  it("honours weights so one question can matter more", () => {
    const a = attrs({ scent_family: "oriental", unisex: false });
    // family right (1) weighted 3, unisex wrong (0) weighted 1 -> 0.75
    expect(
      scoreProductAgainstAnswers(a, [
        { attribute_key: "scent_family", value: "oriental", weight: 3 },
        { attribute_key: "unisex", value: "true" },
      ]),
    ).toBeCloseTo(0.75, 5);
  });

  it("ignores questions about attributes the product does not carry", () => {
    const a = attrs({ scent_family: "oriental" });
    expect(
      scoreProductAgainstAnswers(a, [
        { attribute_key: "scent_family", value: "oriental" },
        { attribute_key: "longevity", value: "5" },
      ]),
    ).toBe(1);
  });

  it("returns null when the product answers none of the questions", () => {
    expect(scoreProductAgainstAnswers(attrs({ unisex: true }), [
      { attribute_key: "longevity", value: "5" },
    ])).toBeNull();
    expect(scoreProductAgainstAnswers([], [{ attribute_key: "x", value: "y" }])).toBeNull();
    expect(scoreProductAgainstAnswers(attrs({ unisex: true }), [])).toBeNull();
  });

  it("ignores a blank or non-numeric answer rather than scoring it zero", () => {
    const a = attrs({ longevity: 3 });
    expect(scoreProductAgainstAnswers(a, [{ attribute_key: "longevity", value: "  " }])).toBeNull();
    expect(scoreProductAgainstAnswers(a, [{ attribute_key: "longevity", value: "strong" }])).toBeNull();
  });
});

describe("rankByAnswers", () => {
  const pool = [
    { id: "far", a: attrs({ scent_family: "fresh", longevity: 1 }) },
    { id: "best", a: attrs({ scent_family: "oriental", longevity: 5 }) },
    { id: "mid", a: attrs({ scent_family: "oriental", longevity: 2 }) },
    { id: "blank", a: [] },
  ];
  const answers = [
    { attribute_key: "scent_family", value: "oriental" },
    { attribute_key: "longevity", value: "5" },
  ];
  const ranked = rankByAnswers(pool, (p) => p.a, answers);

  it("puts the best match first", () => {
    expect(ranked.map((r) => r.item.id)).toEqual(["best", "mid", "far", "blank"]);
  });

  it("never drops a product — a finder that returns nothing has failed", () => {
    expect(ranked).toHaveLength(pool.length);
  });

  it("keeps unscorable products in their original order, at the end", () => {
    expect(ranked[ranked.length - 1].score).toBeNull();
  });

  it("is stable for equal scores", () => {
    const tie = [{ id: "a", a: attrs({ scent_family: "woody" }) }, { id: "b", a: attrs({ scent_family: "woody" }) }];
    expect(rankByAnswers(tie, (p) => p.a, answers).map((r) => r.item.id)).toEqual(["a", "b"]);
  });

  it("returns everything unranked when no questions were answered", () => {
    const none = rankByAnswers(pool, (p) => p.a, []);
    expect(none.map((r) => r.item.id)).toEqual(pool.map((p) => p.id));
    expect(none.every((r) => r.score === null)).toBe(true);
  });
});
