// W6.8 — every UI string a shopper can meet on the flagship's conversion
// path carries a Kurdish line. Merchant copy (default props) is translated
// in the builder; this guards the code-owned chrome only.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const FILES = [
  "cart_line_items.client.tsx",
  "checkout_form.client.tsx",
  "order_tracker.client.tsx",
  "pdp_direct_order.client.tsx",
  "search_results_grid.client.tsx",
];

function stringsBlock(src: string): string {
  const m = /const STRINGS\s*(?::[^=]*)?=\s*\{/.exec(src);
  if (!m) return "";
  let depth = 1;
  let i = m.index + m[0].length;
  const start = i;
  while (depth && i < src.length) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") depth--;
    i++;
  }
  return src.slice(start, i);
}

describe("Kurdish coverage of UI strings", () => {
  for (const f of FILES) {
    it(`${f}: every entry has ku`, () => {
      const block = stringsBlock(readFileSync(new URL(`./${f}`, import.meta.url), "utf8"));
      // Quoted strings are atoms so a `{points}` placeholder cannot end an entry early.
      const entries = [...block.matchAll(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:\s*\{(?:[^{}"]|"(?:[^"\\]|\\.)*")*\}/gm)];
      expect(entries.length).toBeGreaterThan(0);
      const missing = entries.filter((e) => !/\bku:\s*"/.test(e[0])).map((e) => e[1]);
      expect(missing).toEqual([]);
    });
  }
});
