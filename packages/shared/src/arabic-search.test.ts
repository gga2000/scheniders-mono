import { describe, expect, it } from "vitest";
import { matchesAllTokens, normalizeArabic, searchTokens } from "./arabic-search";

describe("normalizeArabic", () => {
  it("folds every alef form to the bare alef", () => {
    for (const form of ["أحمد", "إحمد", "آحمد", "ٱحمد"]) {
      expect(normalizeArabic(form), form).toBe("احمد");
    }
  });

  it("folds ta marbuta to ha — عطرية and عطريه are one word", () => {
    expect(normalizeArabic("عطرية")).toBe(normalizeArabic("عطريه"));
  });

  it("folds alef maqsura to ya — ليلى and ليلي are one word", () => {
    expect(normalizeArabic("ليلى")).toBe(normalizeArabic("ليلي"));
  });

  it("strips diacritics and tatweel", () => {
    expect(normalizeArabic("عِطْرٌ")).toBe("عطر");
    expect(normalizeArabic("عــطــر")).toBe("عطر");
  });

  it("folds hamza carriers to their base letter", () => {
    expect(normalizeArabic("مؤمن")).toBe(normalizeArabic("مومن"));
    expect(normalizeArabic("رئيس")).toBe(normalizeArabic("رييس"));
  });

  it("folds both Arabic digit sets to Western", () => {
    expect(normalizeArabic("٢٠٠ مل")).toBe("200 مل");
    expect(normalizeArabic("۲۰۰")).toBe("200");
  });

  it("decomposes presentation forms", () => {
    // ﻻ as a single ligature codepoint must match the two-letter spelling.
    expect(normalizeArabic("ﻻ")).toBe(normalizeArabic("لا"));
  });

  it("treats Arabic punctuation as a separator", () => {
    expect(normalizeArabic("عطر، مسك")).toBe("عطر مسك");
  });

  it("lowercases Latin and collapses whitespace", () => {
    expect(normalizeArabic("  Fusion   EDP  ")).toBe("fusion edp");
  });

  it("is idempotent", () => {
    const once = normalizeArabic("أحمد عِطْرٌ ٢٠٠");
    expect(normalizeArabic(once)).toBe(once);
  });

  it("handles empty input", () => {
    expect(normalizeArabic("")).toBe("");
    expect(searchTokens("   ")).toEqual([]);
  });
});

describe("matchesAllTokens", () => {
  it("finds a product however the shopper spells it", () => {
    const name = "عطر فيوجن الفاخر للرجال والنساء";
    for (const query of ["فيوجن", "عطر فيوجن", "الفاخر للرجال"]) {
      expect(matchesAllTokens(name, searchTokens(query)), query).toBe(true);
    }
  });

  it("matches across the spelling variants that motivated this", () => {
    // Stored one way, typed the other.
    expect(matchesAllTokens("عطرية شرقية", searchTokens("عطريه"))).toBe(true);
    expect(matchesAllTokens("مياه إحمد", searchTokens("احمد"))).toBe(true);
    expect(matchesAllTokens("سعة ٢٠٠ مل", searchTokens("200"))).toBe(true);
  });

  it("still requires every token to appear", () => {
    expect(matchesAllTokens("عطر فيوجن", searchTokens("فيوجن مسك"))).toBe(false);
  });

  it("matches a prefix, so as-you-type narrows", () => {
    expect(matchesAllTokens("عطر فيوجن", searchTokens("فيوج"))).toBe(true);
  });

  it("ignores the definite article the shopper omits", () => {
    // includes() already handles this: "الفاخر" contains "فاخر".
    expect(matchesAllTokens("العطر الفاخر", searchTokens("فاخر"))).toBe(true);
  });

  it("an empty query matches everything", () => {
    expect(matchesAllTokens("anything", [])).toBe(true);
  });
});
