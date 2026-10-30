// The product FAQ's chrome strings: tokens fill, and every entry resolves
// in ar, en and ku.

import { describe, expect, it } from "vitest";
import { FAQ_STRINGS, fs } from "./faq_contact_split.strings";

describe("fs", () => {
  it("fills the WhatsApp prefill and the size answer", () => {
    expect(fs("askAbout", "ar", { product: "ويفر انتنس" })).toBe("عندي سؤال عن ويفر انتنس");
    expect(fs("sizeAnswer", "ar", { value: 100 })).toBe("القنينة 100 مل");
    expect(fs("sizeAnswer", "en", { value: 100 })).toBe("The bottle is 100 ml");
  });

  it("Kurdish has its own line", () => {
    expect(fs("call", "ku")).toBe("پەیوەندیمان پێوە بکە");
  });

  it("every entry has ar, en and ku", () => {
    for (const entry of Object.values(FAQ_STRINGS)) {
      expect(Object.keys(entry).sort()).toEqual(["ar", "en", "ku"]);
    }
  });
});
