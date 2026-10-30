// =====================================================================
// PDP redesign 1e — product_reviews' highlights props parse safely
// =====================================================================
// Every new prop is optional and `.catch`-guarded: a bad or rolled-back
// stored value drops only that prop (or that curation field), never the
// section. The widened `layout` enum keeps "quiet" and the historical
// (absent) layout exactly as they were.
// =====================================================================

import { describe, expect, it } from "vitest";
import product_reviews from "./product_reviews";

const schema = product_reviews.schema;

const AHMED = "cd25b071-10d9-4de5-a324-ea6a0793559b";

const CURATION = {
  review_id: AHMED,
  rank: 6,
  tags: ["longevity"],
  highlight: "العطر كلش راقي وثباته يطول يوم كامل على الملابس",
  reply_i18n: { ar: "حقك علينا يا أحمد" },
};

const HIGHLIGHTS = {
  heading_i18n: { ar: "شنو گالوا اللي جرّبوه" },
  show_form: true,
  layout: "highlights",
  theme_words: [
    { key: "longevity", label_i18n: { ar: "الثبات" }, match_terms: ["ثبات"] },
    { key: "reorder", label_i18n: { ar: "طلبوا مرة ثانية" } },
  ],
  visible_count: 3,
  form_entry: "hash_only",
  heading_style: "chapter",
  review_curation: [CURATION],
};

describe("product_reviews slice 1e props", () => {
  it("accepts the highlights config", () => {
    expect(schema.parse(HIGHLIGHTS)).toEqual(HIGHLIGHTS);
  });

  it.each(["quiet", "highlights"] as const)("layout %s parses as itself", (layout) => {
    expect(schema.parse({ ...HIGHLIGHTS, layout }).layout).toBe(layout);
  });

  it.each<[string, unknown]>([
    ["layout", "loud"],
    ["theme_words", [{ key: "Bad Key", label_i18n: { ar: "x" } }]],
    ["theme_words", [{ key: "longevity", label_i18n: { ar: "x" }, match_terms: ["ث"] }]],
    ["visible_count", 0],
    ["visible_count", 7],
    ["form_entry", "never"],
    ["heading_style", "huge"],
    ["review_curation", [{ ...CURATION, review_id: "not-a-uuid" }]],
  ])("a bad %s (%j) falls back to absent", (key, value) => {
    const parsed = schema.parse({ ...HIGHLIGHTS, [key]: value });
    expect(parsed[key as keyof typeof parsed]).toBeUndefined();
    expect(parsed.show_form).toBe(true);
  });

  it.each<[string, unknown]>([
    ["rank", 0],
    ["tags", ["Not Ok"]],
    ["highlight", "ab"],
    ["reply_i18n", "plain"],
  ])("a bad curation %s (%j) drops only that field", (key, value) => {
    const parsed = schema.parse({ ...HIGHLIGHTS, review_curation: [{ ...CURATION, [key]: value }] });
    const item = parsed.review_curation?.[0];
    expect(item?.[key as keyof typeof item]).toBeUndefined();
    expect(item?.review_id).toBe(AHMED);
  });
});
