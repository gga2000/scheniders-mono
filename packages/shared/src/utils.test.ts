// =====================================================================
// Tests for slugify — must be Unicode-aware (Iraq/Arabic market).
// =====================================================================

import { describe, expect, it } from "vitest";
import { isCanonicalSlug, slugify } from "./utils";

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
