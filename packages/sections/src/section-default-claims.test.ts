// =====================================================================
// A shared section's defaults must not assert a merchant fact
// =====================================================================
// defaultProps render for any store that drops a section in without
// editing it. A promise written here is published on that merchant's behalf
// without them ever making it — and one live store was doing exactly that
// on its CHECKOUT page, where the customer decides to buy:
//
//   "ضمان سنة"               a one-year warranty, on perfume
//   "توصيل بغداد بنفس اليوم"  same-day, where the FAQ says 24 hours
//   "إرجاع مجاني"             free returns, where the policy excludes
//                            promotional goods — 42 of 43 products
//
// Only two things are safe to assert: the checkout is cash on delivery,
// and the platform serves Iraq. Speed, warranty, and the cost of a return
// belong to the merchant, because only they know whether they are true.
// =====================================================================

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const SECTIONS = [
  "trust_strip",
  "feature_grid",
  "trust_badge_row",
  "pillars_grid",
  "marquee_strip",
] as const;

/** Claims about speed, warranty, or the price of a return. */
const FORBIDDEN: { pattern: RegExp; why: string }[] = [
  { pattern: /same[- ]day/i, why: "a delivery speed this package cannot know" },
  { pattern: /بنفس اليوم/, why: "a delivery speed this package cannot know" },
  { pattern: /\b\d+-year warranty\b/i, why: "a warranty term nobody promised" },
  { pattern: /ضمان سنة/, why: "a warranty term nobody promised" },
  { pattern: /free returns/i, why: "a returns policy this package cannot know" },
  { pattern: /إرجاع مجاني/, why: "a returns policy this package cannot know" },
  { pattern: /free (?:delivery|shipping)/i, why: "a shipping price the engine decides per governorate" },
  { pattern: /توصيل مجاني/, why: "a shipping price the engine decides per governorate" },
];

function defaultsBlock(section: string): string {
  const src = readFileSync(
    new URL(`./${section}.tsx`, import.meta.url),
    "utf8",
  );
  const start = src.indexOf("const defaultProps");
  if (start === -1) return "";
  // Up to the next top-level declaration — enough to cover the literal.
  const end = src.indexOf("\nfunction ", start);
  return src.slice(start, end === -1 ? start + 4000 : end);
}

describe("section defaults make no promise the merchant did not", () => {
  for (const section of SECTIONS) {
    it(`${section} asserts nothing about speed, warranty or returns`, () => {
      const block = defaultsBlock(section);
      for (const { pattern, why } of FORBIDDEN) {
        expect(
          pattern.test(block),
          `${section} defaultProps contains ${pattern} — ${why}`,
        ).toBe(false);
      }
    });
  }
});
