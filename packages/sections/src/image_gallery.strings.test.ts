// The proof stack's chrome strings: the expand label takes the Arabic
// plural forms (1 / 2 / 3–10 / 11+) through formatCount, the scope line
// fills both counts, and every table entry resolves in ar, en and ku.

import { describe, expect, it } from "vitest";
import { GALLERY_STRINGS, gs, proofMoreLabel } from "./image_gallery.strings";

describe("proofMoreLabel", () => {
  it.each([
    [1, "شوف تعليق ثاني"],
    [2, "شوف تعليقين ثانيين"],
    [6, "شوف 6 تعليقات ثانية"],
    [11, "شوف 11 تعليق ثاني"],
  ])("ar %i → %s", (count, expected) => {
    expect(proofMoreLabel(count, "ar")).toBe(expected);
  });

  it.each([
    [1, "See 1 more comment"],
    [6, "See 6 more comments"],
  ])("en %i → %s", (count, expected) => {
    expect(proofMoreLabel(count, "en")).toBe(expected);
  });

  it("ku uses its own table", () => {
    expect(proofMoreLabel(6, "ku")).toBe("6 لێدوانی تر ببینە");
  });
});

describe("gs", () => {
  it("fills the scope line", () => {
    expect(gs("proofScope", "ar", { shown: 3, total: 9 })).toBe("3 من أصل 9، على عطورنا بشكل عام");
    expect(gs("proofScope", "en", { shown: 3, total: 9 })).toBe("3 of 9, about our perfumes in general");
  });

  it("every entry has ar, en and ku", () => {
    for (const entry of Object.values(GALLERY_STRINGS)) {
      expect(Object.keys(entry).sort()).toEqual(["ar", "en", "ku"]);
    }
  });
});
