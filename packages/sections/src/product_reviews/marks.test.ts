// Where the yellow lands in a review: the key phrase (merchant pick, else
// the first 3–14-word clause that names a topic) and the pressed topic's
// words, cut into flagged runs.

import { describe, expect, it } from "vitest";
import { WAYFER_REVIEWS } from "../_pdp-wayfer-fixtures";
import { clauseRanges, keyPhraseRange, markSegments, mergeRanges, widenToWords } from "./marks";

const TERMS = ["ثبات", "تيستر", "فخم", "تغليف", "علبه"];

function bodyOf(name: string): string {
  const r = WAYFER_REVIEWS.find((x) => x.author_name === name);
  if (!r?.body) throw new Error(`no review by ${name}`);
  return r.body;
}

function slice(text: string, r: { start: number; end: number } | null): string | null {
  return r ? text.slice(r.start, r.end) : null;
}

describe("keyPhraseRange", () => {
  it("the merchant's pick wins when it is a verbatim part of the body", () => {
    const body = bodyOf("Ahmed");
    const pick = "العطر كلش راقي وثباته يطول يوم كامل على الملابس";
    expect(slice(body, keyPhraseRange(body, pick, TERMS))).toBe(pick);
  });

  it("a pick that is not in the body is ignored (falls back to the rule)", () => {
    const body = bodyOf("مصطفى علي");
    expect(slice(body, keyPhraseRange(body, "ثباته خرافي", TERMS))).toBe(
      "جربت التيستر اول شي وكلش عجبتنئ ريحته",
    );
  });

  it("rule: the first 3–14-word clause that names a topic", () => {
    const body = bodyOf("احمد الشمري");
    expect(slice(body, keyPhraseRange(body, undefined, TERMS))).toBe(
      "بس وصلتني العلبة مرتبة والتيستر فكرة تخبل",
    );
  });

  it("a review with no punctuation is one long clause: no mark", () => {
    // Ahmed's 40-word body has no clause break.
    expect(keyPhraseRange(bodyOf("Ahmed"), undefined, TERMS)).toBeNull();
  });

  it("a pick that starts or ends mid-word is widened to whole words", () => {
    const body = "العطر صدمني بثباته اهنيكم عليه";
    // «ثباته اهني» cuts «بثباته» and «اهنيكم» in two.
    expect(slice(body, keyPhraseRange(body, "ثباته اهني", TERMS))).toBe("بثباته اهنيكم");
  });

  it("no topic word and no pick: no mark", () => {
    expect(keyPhraseRange(bodyOf("ياسين"), undefined, TERMS)).toBeNull();
    expect(keyPhraseRange(bodyOf("ياسين"), undefined, [])).toBeNull();
  });
});

describe("clauseRanges", () => {
  it("splits on . ، ! ؟ and newline, trimmed", () => {
    const text = "اول. ثاني، ثالث! رابع؟\nخامس";
    expect(clauseRanges(text).map((r) => text.slice(r.start, r.end))).toEqual([
      "اول",
      "ثاني",
      "ثالث",
      "رابع",
      "خامس",
    ]);
  });
});

describe("widenToWords / mergeRanges", () => {
  it("grows a hit to its word", () => {
    const text = "العطر صدمني بثباته اهنيكم";
    const at = text.indexOf("ثبات");
    expect(slice(text, widenToWords(text, { start: at, end: at + 4 }))).toBe("بثباته");
  });

  it("a hyphen, a slash and «۔» end a word; tatweel does not", () => {
    const hyphen = "ثبات-ممتاز";
    expect(slice(hyphen, widenToWords(hyphen, { start: 0, end: 2 }))).toBe("ثبات");
    const slash = "ريحة/ثبات";
    expect(slice(slash, widenToWords(slash, { start: 6, end: 8 }))).toBe("ثبات");
    const urdu = "فخم۔حلو";
    expect(slice(urdu, widenToWords(urdu, { start: 0, end: 1 }))).toBe("فخم");
    const tatweel = "ثبـات قوي";
    expect(slice(tatweel, widenToWords(tatweel, { start: 0, end: 1 }))).toBe("ثبـات");
  });

  it("joins overlapping and touching ranges", () => {
    expect(mergeRanges([{ start: 5, end: 9 }, { start: 0, end: 3 }, { start: 3, end: 4 }, { start: 8, end: 12 }])).toEqual([
      { start: 0, end: 4 },
      { start: 5, end: 12 },
    ]);
  });
});

describe("markSegments", () => {
  it("cuts at every edge and flags each run", () => {
    const text = "aaa bbb ccc ddd";
    expect(markSegments(text, { start: 4, end: 11 }, [{ start: 8, end: 15 }])).toEqual([
      { text: "aaa ", key: false, term: false },
      { text: "bbb ", key: true, term: false },
      { text: "ccc", key: true, term: true },
      { text: " ddd", key: false, term: true },
    ]);
  });

  it("no marks: one plain run", () => {
    expect(markSegments("نص", null, [])).toEqual([{ text: "نص", key: false, term: false }]);
  });

  it("the runs join back to the body, unchanged", () => {
    const body = bodyOf("eng. سيف");
    const runs = markSegments(body, keyPhraseRange(body, undefined, TERMS), [{ start: 10, end: 40 }]);
    expect(runs.map((r) => r.text).join("")).toBe(body);
  });
});
