// The footer's address lines. Found in a browser at 390px on the live
// store: the label "العنوان:" sat on the English address, and the Arabic
// one trailed below it unlabelled, on an Arabic page.

import { describe, expect, it } from "vitest";
import { addressLinesFor } from "./site_footer.client";

const both = { ar: "العراق - بغداد - زيونة", en: "Iraq - Baghdad - Zayouna" };

describe("addressLinesFor", () => {
  it("puts the locale on screen first, so the label lands on it", () => {
    expect(addressLinesFor(both, "ar")).toEqual([both.ar, both.en]);
    expect(addressLinesFor(both, "en")).toEqual([both.en, both.ar]);
  });

  it("still prints every translation — a bilingual footer is the point", () => {
    expect(addressLinesFor(both, "ar")).toHaveLength(2);
  });

  it("never repeats a line when two locales carry the same address", () => {
    const same = { ar: "بغداد", en: "بغداد" };
    expect(addressLinesFor(same, "ar")).toEqual(["بغداد"]);
  });

  it("drops blank and missing translations", () => {
    expect(addressLinesFor({ ar: "بغداد", en: "   " }, "ar")).toEqual(["بغداد"]);
    expect(addressLinesFor({ en: "Baghdad" }, "ar")).toEqual(["Baghdad"]);
  });

  it("returns nothing when there is no address at all", () => {
    expect(addressLinesFor(undefined, "ar")).toEqual([]);
    expect(addressLinesFor(null, "ar")).toEqual([]);
    expect(addressLinesFor({}, "ar")).toEqual([]);
  });
});
