// The word buttons' counts on Wayfarer's six live reviews (spec §1.6:
// 3 / 2 / 2 / 2), a tag-only topic, and the words a pressed topic marks.

import { describe, expect, it } from "vitest";
import { WAYFER_REVIEWS } from "../_pdp-wayfer-fixtures";
import { reviewThemes, themeCounts, themeWordRanges, type ThemeWord } from "./theme-words";

const THEMES: ThemeWord[] = [
  { key: "longevity", label_i18n: { ar: "الثبات" }, match_terms: ["ثبات"] },
  { key: "tester", label_i18n: { ar: "التيستر" }, match_terms: ["تيستر"] },
  { key: "luxury", label_i18n: { ar: "فخامة" }, match_terms: ["فخم"] },
  { key: "packaging", label_i18n: { ar: "العلبة والتغليف" }, match_terms: ["تغليف", "علبه"] },
];

const noTags = () => [];

function byAuthor(name: string) {
  const r = WAYFER_REVIEWS.find((x) => x.author_name === name);
  if (!r) throw new Error(`no review by ${name}`);
  return r;
}

describe("themeCounts", () => {
  it("Wayfarer: الثبات 3 · التيستر 2 · فخامة 2 · العلبة والتغليف 2", () => {
    expect(themeCounts(WAYFER_REVIEWS, THEMES, noTags).map((t) => [t.key, t.count])).toEqual([
      ["longevity", 3],
      ["tester", 2],
      ["luxury", 2],
      ["packaging", 2],
    ]);
  });

  it("counts a review once per topic, however often it says the word", () => {
    // eng. سيف says ثبات twice.
    expect(themeCounts([byAuthor("eng. سيف")], THEMES, noTags)).toEqual([
      { key: "longevity", label_i18n: { ar: "الثبات" }, count: 1 },
    ]);
  });

  it("a topic without match_terms counts only tagged reviews, and hides at 0", () => {
    const reorder: ThemeWord = { key: "reorder", label_i18n: { ar: "طلبوا مرة ثانية" } };
    expect(themeCounts(WAYFER_REVIEWS, [reorder], noTags)).toEqual([]);
    const tagged = new Set([byAuthor("حازم السيد").id, byAuthor("ياسين").id]);
    const tagsOf = (id: string) => (tagged.has(id) ? ["reorder"] : []);
    expect(themeCounts(WAYFER_REVIEWS, [reorder], tagsOf)).toEqual([
      { key: "reorder", label_i18n: { ar: "طلبوا مرة ثانية" }, count: 2 },
    ]);
  });
});

describe("reviewThemes", () => {
  it("folded substring: «بثباته», «والتيستر», «العلبة», «تغليفهم» all count", () => {
    expect([...reviewThemes(byAuthor("مصطفى علي").body, [], THEMES)]).toEqual(["longevity", "tester"]);
    expect([...reviewThemes(byAuthor("احمد الشمري").body, [], THEMES)]).toEqual([
      "tester",
      "luxury",
      "packaging",
    ]);
    expect([...reviewThemes(byAuthor("حازم السيد").body, [], THEMES)]).toEqual(["luxury", "packaging"]);
    expect([...reviewThemes(byAuthor("ياسين").body, [], THEMES)]).toEqual([]);
  });
});

describe("themeWordRanges", () => {
  it("marks whole words, never part of one", () => {
    const body = byAuthor("مصطفى علي").body ?? "";
    const words = themeWordRanges(body, THEMES[0]).map((r) => body.slice(r.start, r.end));
    expect(words).toEqual(["بثباته"]);
  });

  it("every hit of the topic, in reading order", () => {
    const body = byAuthor("eng. سيف").body ?? "";
    const words = themeWordRanges(body, THEMES[0]).map((r) => body.slice(r.start, r.end));
    expect(words).toEqual(["الثبات", "ثبات"]);
  });

  it("a tag-only topic marks no words", () => {
    expect(themeWordRanges("هذا ثاني عطر", { key: "reorder", label_i18n: { ar: "x" } })).toEqual([]);
    expect(themeWordRanges("هذا ثاني عطر", undefined)).toEqual([]);
  });
});
