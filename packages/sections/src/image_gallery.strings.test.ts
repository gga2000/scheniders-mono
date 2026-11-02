// The proof carousel's chrome strings: the scope line takes the Arabic
// plural forms (1 / 2 / 3–10 / 11+) through formatCount, the dot label
// fills its number, and every table entry resolves in ar, en and ku.

import { describe, expect, it } from "vitest";
import { GALLERY_STRINGS, gs, proofCountLabel } from "./image_gallery.strings";

describe("proofCountLabel", () => {
  it.each([
    [1, "تعليق واحد، على عطورنا بشكل عام"],
    [2, "تعليقين، على عطورنا بشكل عام"],
    [9, "9 تعليقات، على عطورنا بشكل عام"],
    [11, "11 تعليق، على عطورنا بشكل عام"],
  ])("ar %i → %s", (count, expected) => {
    expect(proofCountLabel(count, "ar")).toBe(expected);
  });

  it.each([
    [1, "1 comment, about our perfumes in general"],
    [9, "9 comments, about our perfumes in general"],
  ])("en %i → %s", (count, expected) => {
    expect(proofCountLabel(count, "en")).toBe(expected);
  });

  it("ku uses its own table", () => {
    expect(proofCountLabel(9, "ku")).toBe("9 لێدوان، دەربارەی بۆنەکانمان بە گشتی");
  });
});

describe("gs", () => {
  it("fills the dot label", () => {
    expect(gs("proofDot", "ar", { n: 3 })).toBe("التعليق 3");
    expect(gs("proofDot", "en", { n: 3 })).toBe("Comment 3");
  });

  it("every entry has ar, en and ku", () => {
    for (const entry of Object.values(GALLERY_STRINGS)) {
      expect(Object.keys(entry).sort()).toEqual(["ar", "en", "ku"]);
    }
  });
});
