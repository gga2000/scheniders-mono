import { describe, expect, it } from "vitest";
import { findTermHits, hasWholeWords } from "./arabic-text";

/** The source text each hit covers. */
function covered(text: string, terms: readonly string[]): string[] {
  return findTermHits(text, terms).map((h) => text.slice(h.start, h.end));
}

describe("findTermHits — substring matching on folded text", () => {
  it("finds a term inside a longer word and returns source offsets", () => {
    const text = "العطر صدمني بثباته";
    expect(findTermHits(text, ["ثبات"])).toEqual([{ term: "ثبات", start: 13, end: 17 }]);
    expect(covered(text, ["ثبات"])).toEqual(["ثبات"]);
  });

  it("keeps tashkeel inside the range of the letter it sits on", () => {
    const text = "ثَبَاتٌ رائع";
    expect(findTermHits(text, ["ثبات"])).toEqual([{ term: "ثبات", start: 0, end: 7 }]);
    expect(covered(text, ["ثبات"])).toEqual(["ثَبَاتٌ"]);
  });

  it("matches across tatweel", () => {
    expect(covered("فخـــم", ["فخم"])).toEqual(["فخـــم"]);
  });

  it("maps a ligature's folded letters back to the one source character", () => {
    const text = "عطر ﻻيقاوم";
    expect(findTermHits(text, ["لايقاوم"])).toEqual([{ term: "لايقاوم", start: 4, end: 10 }]);
  });

  it("folds ta marbuta and alef forms on both sides", () => {
    expect(covered("علبة فخمة", ["علبه"])).toEqual(["علبة"]);
    expect(covered("أصلي ١٠٠٪", ["اصلي"])).toEqual(["أصلي"]);
  });

  it("returns every hit of every term, ordered by position", () => {
    const text = "تغليفهم حلو والعلبه فخمه";
    expect(findTermHits(text, ["علبه", "تغليف"])).toEqual([
      { term: "تغليف", start: 0, end: 5 },
      { term: "علبه", start: 15, end: 19 },
    ]);
    expect(covered("ثبات، ثبات", ["ثبات"])).toEqual(["ثبات", "ثبات"]);
  });

  it("is case-insensitive for Latin text", () => {
    expect(covered("Very LONG lasting", ["long"])).toEqual(["LONG"]);
  });

  it("skips empty terms and returns nothing when no term occurs", () => {
    expect(findTermHits("ما ثبت", ["ثبات", "", "ـ"])).toEqual([]);
    expect(findTermHits("", ["ثبات"])).toEqual([]);
  });
});

describe("hasWholeWords — whole-word matching", () => {
  it("pairs a note with a card title that holds all its words", () => {
    expect(hasWholeWords("🍓 التوت البري الفاخر", "التوت الفاخر")).toBe(true);
    expect(hasWholeWords("الهيل واللافندر", "الهيل")).toBe(true);
  });

  it("folds spelling variants before comparing", () => {
    expect(hasWholeWords("التفاح الأخضر", "التفاح الاخضر")).toBe(true);
    expect(hasWholeWords("الباتشولي الساحر", "الباتشولى")).toBe(true);
  });

  it("refuses a word that is only a substring", () => {
    expect(hasWholeWords("الفاخرة", "الفاخر")).toBe(false);
  });

  it("refuses when any word is missing", () => {
    expect(hasWholeWords("التوت البري الفاخر", "التوت الأحمر")).toBe(false);
  });

  it("treats the Arabic comma as a word break", () => {
    expect(hasWholeWords("الهيل،اللافندر", "اللافندر")).toBe(true);
  });

  it("matches nothing for an empty needle", () => {
    expect(hasWholeWords("التوت", "")).toBe(false);
    expect(hasWholeWords("التوت", "  ")).toBe(false);
  });
});
