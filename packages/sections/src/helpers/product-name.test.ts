import { describe, expect, it } from "vitest";
import { cardName } from "./product-name";

describe("cardName", () => {
  it("prefers the short public name", () => {
    expect(cardName({ name: "عطر برسيفيرون الفاخر من باريس كورنر للرجال", display_name: "برسيفيرون" })).toBe("برسيفيرون");
  });
  it("falls back to the full name when the short one is empty or missing", () => {
    expect(cardName({ name: "ايبسكو", display_name: null })).toBe("ايبسكو");
    expect(cardName({ name: "ايبسكو", display_name: "  " })).toBe("ايبسكو");
    expect(cardName({ name: "ايبسكو" })).toBe("ايبسكو");
  });
});
