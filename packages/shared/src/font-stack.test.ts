import { describe, expect, it } from "vitest";
import { subsetFontStack } from "./font-stack";

const face = (fontFamily: string) => ({ style: { fontFamily } });

describe("subsetFontStack", () => {
  it("keeps the faces in priority order and moves the size-adjusted fallback after all of them", () => {
    // The Latin face carries the fallback. Left in place it would sit between
    // the Latin and Arabic faces, and a local Arial (which has Arabic glyphs)
    // would render Arabic text before the Arabic face is ever tried.
    expect(
      subsetFontStack([
        face("'cairoLatin', 'cairoLatin Fallback'"),
        face("'cairoLatinExt'"),
        face("'cairoArabic'"),
      ]),
    ).toBe("'cairoLatin', 'cairoLatinExt', 'cairoArabic', 'cairoLatin Fallback'");
  });

  it("accepts the unquoted, unspaced form and lists a repeated fallback once", () => {
    expect(
      subsetFontStack([face("a,a Fallback"), face("b,a Fallback"), face("c")]),
    ).toBe("a, b, c, a Fallback");
  });

  it("is a no-op for a single face", () => {
    expect(subsetFontStack([face("'geist', 'geist Fallback'")])).toBe(
      "'geist', 'geist Fallback'",
    );
  });

  it("rejects an empty list instead of producing an empty font-family", () => {
    expect(() => subsetFontStack([])).toThrow();
  });
});
