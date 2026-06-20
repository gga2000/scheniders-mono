import { describe, it, expect } from "vitest";
import { formatPrice, formatSavings } from "./format";

describe("formatPrice (EC35 — locale-aware currency)", () => {
  it("uses the Arabic glyph for ar/ku and when locale is omitted", () => {
    expect(formatPrice(85000)).toBe("85,000 د.ع");
    expect(formatPrice(85000, "ar")).toBe("85,000 د.ع");
    expect(formatPrice(85000, "ku")).toBe("85,000 د.ع");
  });

  it("uses Latin IQD for an English UI", () => {
    expect(formatPrice(85000, "en")).toBe("85,000 IQD");
  });

  it("keeps Latin thousands separators + rounds, clamps negatives to 0", () => {
    expect(formatPrice(1234.6, "en")).toBe("1,235 IQD");
    expect(formatPrice(-5, "en")).toBe("0 IQD");
  });

  it("formatSavings threads the locale and returns null when no saving", () => {
    expect(formatSavings(100000, 75000, "en")).toBe("25,000 IQD");
    expect(formatSavings(100000, 75000, "ar")).toBe("25,000 د.ع");
    expect(formatSavings(50000, 75000, "en")).toBeNull();
  });
});
