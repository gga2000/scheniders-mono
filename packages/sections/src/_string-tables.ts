// =====================================================================
// The chrome string tables — one list, read by every copy guard
// =====================================================================
// Each file here holds one `STRINGS` / `<PREFIX>_STRINGS` table of
// shopper-facing chrome with ar, en and ku on every entry.
// `_kurdish-coverage.test.ts` checks every entry has `ku`; the Arabic copy
// lint (slice 1f) reads the same list. New chrome strings go ONLY into a
// file on this list, and a new table file is added here in the same commit
// that creates it (1d: image_gallery.strings.ts, 1e:
// faq_contact_split.strings.ts, 1f: sticky_cta_bar.strings.ts).
//
// `helpers/chrome-strings.ts` is deliberately NOT on the list: four of its
// entries (company_legal_name_label, business_license_label, made_in_iraq,
// newsletter_success) have no `ku` by design (`ChromeEntry.ku` is
// optional), so it would fail the coverage check. Do not add new strings
// there.
//
// Paths are relative to packages/sections/src.
// =====================================================================

export const STRING_TABLE_FILES: readonly string[] = [
  "cart_line_items.client.tsx",
  "checkout_form.client.tsx",
  "order_confirmation_call_card.client.tsx",
  "order_tracker.client.tsx",
  "pdp_direct_order.client.tsx",
  "pdp_express/strings.ts",
  "product_reviews/strings.ts",
  "search_results_grid.client.tsx",
  "helpers/vcard.ts",
  "image_gallery.strings.ts",
  "faq_contact_split.strings.ts",
  "sticky_cta_bar.strings.ts",
];

/** One entry of a chrome table, read from its source: the key, the entry's
 *  source text, and its `ar` value (null when it has none). */
export interface StringTableEntry {
  key: string;
  source: string;
  ar: string | null;
}

/** The `{ … }` body of the file's `STRINGS` / `<PREFIX>_STRINGS` table, or
 *  "" when the file has none. */
export function stringsBlock(src: string): string {
  const m = /const (?:[A-Z]+_)?STRINGS\s*(?::[^=]*)?=\s*\{/.exec(src);
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

/** Every `key: { … }` entry of the file's table. Quoted strings are atoms,
 *  so a `{points}` placeholder cannot end an entry early. */
export function stringTableEntries(src: string): StringTableEntry[] {
  const block = stringsBlock(src);
  return [...block.matchAll(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:\s*\{(?:[^{}"]|"(?:[^"\\]|\\.)*")*\}/gm)].map(
    (e) => {
      const ar = /\bar:\s*"((?:[^"\\]|\\.)*)"/.exec(e[0]);
      return {
        key: e[1] ?? "",
        source: e[0],
        ar: ar ? String(JSON.parse(`"${ar[1] ?? ""}"`)) : null,
      };
    },
  );
}
