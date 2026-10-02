// The Arabic bidi rule in globals.css.
//
// It cannot be asserted through a DOM here — jsdom runs no layout and
// resolves no bidi — so this pins the rule's shape instead. The behaviour it
// produces was measured in a browser against the live store: before, the
// hero sentence ended at x=71 while its full stop sat at x=149; after, the
// full stop sits immediately beside the last word, and a page-wide scan for
// trailing punctuation on the wrong side of an Arabic run returns nothing.
//
// What this guards is the pair of constraints that make the rule safe, and
// that a later "tidy the CSS" pass could quietly break.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(__dirname, "..", "app", "globals.css"), "utf8");

/**
 * The declaration block that carries `unicode-bidi: plaintext`, with comments
 * stripped — the prose in them mentions the very tag names the selector must
 * not contain, and the first version of this test matched one of those.
 *
 * Returns "" when the rule is gone, rather than throwing at module scope: a
 * throw there fails collection, which reports as "no tests" instead of as a
 * failing assertion. The first version of this file did exactly that.
 */
function bidiBlock(): string {
  const i = css.indexOf("unicode-bidi: plaintext");
  if (i === -1) return "";
  const open = css.lastIndexOf("{", i);
  return css
    .slice(css.lastIndexOf("}", open) + 1, css.indexOf("}", i))
    .replace(/\/\*[\s\S]*?\*\//g, "");
}

describe("Arabic bidi in an LTR document", () => {
  it("sets plaintext, and nothing that forces a direction instead", () => {
    expect(bidiBlock(), "globals.css no longer sets unicode-bidi: plaintext").not.toBe("");
    expect(css).not.toContain("unicode-bidi: embed");
    expect(css).not.toContain("unicode-bidi: bidi-override");
  });

  it("covers prose elements and every marked merchant string", () => {
    const block = bidiBlock();
    for (const sel of ["p", "h1", "h2", "h3", "li", "summary", "[data-i18n-field]"]) {
      expect(block).toContain(sel);
    }
  });

  it("does not reach the price compositions", () => {
    const block = bidiBlock();
    // A price is neutral digits beside an Arabic glyph; its LTR base is what
    // keeps "36,750 د.ع" in that order. Prices render in bare spans and divs
    // and carry no data-i18n-field, so the selector must not list those tags.
    expect(block).not.toMatch(/(^|[\s,])span([\s,{]|$)/);
    expect(block).not.toMatch(/(^|[\s,])div([\s,{]|$)/);
    expect(block).not.toMatch(/(^|[\s,])\*([\s,{]|$)/);
    expect(block).not.toContain("body");
  });

  it("never flips the document, which stays LTR in every locale", () => {
    expect(css).not.toMatch(/direction:\s*rtl/);
    expect(css).not.toMatch(/\bdir\s*=\s*["']rtl/);
  });
});
