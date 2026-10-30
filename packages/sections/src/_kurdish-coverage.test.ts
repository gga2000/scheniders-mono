// W6.8 — every UI string a shopper can meet on the flagship's conversion
// path carries a Kurdish line. Merchant copy (default props) is translated
// in the builder; this guards the code-owned chrome only.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { STRING_TABLE_FILES, stringTableEntries } from "./_string-tables";

describe("Kurdish coverage of UI strings", () => {
  it("covers today's eight tables plus the vCard table", () => {
    expect(STRING_TABLE_FILES).toEqual(
      expect.arrayContaining([
        "cart_line_items.client.tsx",
        "checkout_form.client.tsx",
        "order_confirmation_call_card.client.tsx",
        "order_tracker.client.tsx",
        "pdp_direct_order.client.tsx",
        "pdp_express/strings.ts",
        "product_reviews/strings.ts",
        "search_results_grid.client.tsx",
        "helpers/vcard.ts",
      ]),
    );
  });

  for (const f of STRING_TABLE_FILES) {
    it(`${f}: every entry has ku`, () => {
      const entries = stringTableEntries(readFileSync(new URL(`./${f}`, import.meta.url), "utf8"));
      expect(entries.length).toBeGreaterThan(0);
      const missing = entries.filter((e) => !/\bku:\s*"/.test(e.source)).map((e) => e.key);
      expect(missing).toEqual([]);
    });
  }
});
