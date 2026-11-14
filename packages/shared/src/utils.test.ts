// =====================================================================
// Tests for slugify — must be Unicode-aware (Iraq/Arabic market).
// =====================================================================

import { describe, expect, it } from "vitest";
import { cn, formatIqdCompact, formatIqdNumber, isCanonicalSlug, slugify } from "./utils";

describe("slugify", () => {
  it("slugifies Latin text", () => {
    expect(slugify("Hello World")).toBe("hello-world");
    expect(slugify("  Spaced  Out  ")).toBe("spaced-out");
    expect(slugify("Already-Slugged")).toBe("already-slugged");
  });

  it("keeps Arabic letters instead of stripping them", () => {
    // The whole point: an Arabic name must NOT collapse to an empty slug.
    expect(slugify("ويفر")).toBe("ويفر");
    expect(slugify("كل المنتجات")).toBe("كل-المنتجات");
  });

  it("drops punctuation, symbols and emoji but keeps letters/digits", () => {
    expect(slugify("Wafer 2.0 🎉")).toBe("wafer-20");
    expect(slugify("منتج #1")).toBe("منتج-1");
  });

  it("returns empty string when there is nothing slug-worthy", () => {
    expect(slugify("!!! ✨ ---")).toBe("");
    expect(slugify("")).toBe("");
  });

  it("collapses repeated separators and trims edge hyphens", () => {
    expect(slugify("a   --  b")).toBe("a-b");
    expect(slugify("-leading and trailing-")).toBe("leading-and-trailing");
  });
});

describe("cn", () => {
  // The storefront theme registers `border-bk` / `border-bk-bold` as border
  // WIDTHS (tailwind.config borderWidth). Stock tailwind-merge reads any
  // `border-<word>` as a colour, so it dropped the width next to a colour
  // and the hairline vanished.
  it("keeps a bk border width next to a bk border colour", () => {
    expect(cn("border-bk border-bk-divider")).toBe("border-bk border-bk-divider");
    expect(cn("border-bk-bold", "border-bk-ink")).toBe("border-bk-bold border-bk-ink");
    expect(cn("border-t-bk border-bk-divider")).toBe("border-t-bk border-bk-divider");
  });

  it("still lets a later width or colour win", () => {
    expect(cn("border-bk", "border-2")).toBe("border-2");
    expect(cn("border-2", "border-bk-bold")).toBe("border-bk-bold");
    expect(cn("border-bk border-bk-divider", "border-bk-ink")).toBe("border-bk border-bk-ink");
  });
});

describe("isCanonicalSlug", () => {
  // The bug this exists to prevent: slugify is Unicode-aware for this market,
  // so it produced Arabic slugs that an ASCII-only validator then rejected —
  // blocking every save on eight live products, including stock edits that
  // never touched the slug.
  it.each([
    "رفقات",
    "ويفر",
    "بستاشيو",
    "فيوجن",
    "ايدنتتي",
    "بيرسيفيرون",
    "توباكو",
    "ايبسكو",
  ])("accepts the Arabic slug %s that is already live in the database", (slug) => {
    expect(isCanonicalSlug(slug)).toBe(true);
  });

  it.each(["date-caramel", "eshal-musk", "midnight-sin", "a1", "2026-edition"])(
    "accepts the ASCII slug %s",
    (slug) => {
      expect(isCanonicalSlug(slug)).toBe(true);
    },
  );

  it.each([
    ["an empty string", ""],
    ["a space", "date caramel"],
    ["a slash", "date/caramel"],
    ["a question mark", "date?caramel"],
    ["punctuation", "date.caramel"],
    ["an uppercase letter", "Date-Caramel"],
    ["a leading hyphen", "-date"],
    ["a trailing hyphen", "date-"],
    ["a doubled hyphen", "date--caramel"],
    ["an emoji", "date-🔥"],
  ])("rejects %s", (_label, slug) => {
    expect(isCanonicalSlug(slug)).toBe(false);
  });

  // The invariant that keeps the two from drifting apart again.
  it.each([
    "عطر رفقات وايت",
    "Date Caramel 100ML",
    "  spaced  out  ",
    "MIDNIGHT SIN by Daniel René",
    "خير بيتش ديلولو",
  ])("accepts whatever slugify produces from %s", (input) => {
    const produced = slugify(input);
    expect(produced.length).toBeGreaterThan(0);
    expect(isCanonicalSlug(produced)).toBe(true);
  });

  it("is idempotent — validating a canonical slug never changes it", () => {
    const once = slugify("عطر ويفر انتنس الفاخر");
    expect(slugify(once)).toBe(once);
  });
});

describe("formatIqdNumber", () => {
  it("writes whole dinars with Latin digits and no unit", () => {
    expect(formatIqdNumber(12500.4)).toBe("12,500");
    expect(formatIqdNumber(-1234.6)).toBe("-1,235");
    expect(formatIqdNumber(-0.3)).toBe("0");
  });
});

describe("formatIqdCompact", () => {
  it("shortens amounts the same way on every screen", () => {
    expect(formatIqdCompact(950)).toBe("950");
    expect(formatIqdCompact(999.6)).toBe("1K");
    expect(formatIqdCompact(1500)).toBe("1.5K");
    expect(formatIqdCompact(12_000)).toBe("12K");
    expect(formatIqdCompact(125_400)).toBe("125K");
    expect(formatIqdCompact(999_600)).toBe("1M");
    expect(formatIqdCompact(2_450_000)).toBe("2.5M");
    expect(formatIqdCompact(-42_000)).toBe("-42K");
    expect(formatIqdCompact(-0.2)).toBe("0");
  });

  it("uses the words it is given", () => {
    expect(formatIqdCompact(2_500_000, { thousand: " ألف", million: " مليون" })).toBe("2.5 مليون");
  });
});
