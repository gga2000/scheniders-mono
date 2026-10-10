// =====================================================================
// product-search — one matcher for every product search surface
// =====================================================================
// No React. The /search page and the catalogue controls both call this, so
// a shopper cannot get two different answers to the same query depending on
// which box they typed it into.
//
// The reason this is not `name.toLowerCase().includes(q)`: Arabic is written
// with optional marks a shopper does not type. "الأكثر" and "الاكثر" differ
// by one hamza, "عودة" and "عوده" by the final taa, and "٣٠" and "30" are
// the same number in two digit sets. A plain substring match misses all
// three, and the shopper reads that as "the store doesn't have it".
// =====================================================================

import type { Product } from "../types";

/** Tashkeel, the superscript alef, and the tatweel used to stretch a word. */
const MARKS = /[ً-ْٰـ]/g;

/** Arabic-Indic (٠-٩) and extended Arabic-Indic (۰-۹) digits. */
const AR_DIGITS = /[٠-٩۰-۹]/g;

/**
 * The form two spellings of the same word collapse into. Lossy on purpose —
 * it is a search key, never anything shown to a shopper.
 */
export function normalizeSearchText(input: string): string {
  return input
    .normalize("NFKC")
    .replace(MARKS, "")
    .replace(AR_DIGITS, (d) =>
      String(d.charCodeAt(0) >= 0x06f0 ? d.charCodeAt(0) - 0x06f0 : d.charCodeAt(0) - 0x0660),
    )
    // Hamza carriers collapse onto their bare letter: a shopper types the
    // easy form, the merchant typed the correct one.
    .replace(/[أإآٱ]/g, "ا") // أ إ آ ٱ -> ا
    .replace(/ى/g, "ي") // ى -> ي
    .replace(/[ئ]/g, "ي") // ئ -> ي
    .replace(/[ؤ]/g, "و") // ؤ -> و
    .replace(/ة/g, "ه") // ة -> ه
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Every token of the query must appear somewhere in the product's searchable
 * text. Tokens rather than the whole string, so word order never matters —
 * "عود أزرق" finds "أزرق عود" — and all tokens rather than any, so adding a
 * word narrows the result the way a shopper expects.
 *
 * An empty query matches everything: a search box that has not been typed in
 * is not a filter.
 */
export function matchesQuery(product: Product, query: string): boolean {
  const tokens = normalizeSearchText(query).split(" ").filter(Boolean);
  if (tokens.length === 0) return true;
  const hay = normalizeSearchText(
    [
      product.name,
      product.sku ?? "",
      product.short_description ?? "",
      product.description ?? "",
    ].join(" "),
  );
  return tokens.every((tok) => hay.includes(tok));
}

/** `matchesQuery` over a list. Never mutates the input. */
export function filterByQuery(products: Product[], query: string): Product[] {
  const tokens = normalizeSearchText(query).split(" ").filter(Boolean);
  if (tokens.length === 0) return products;
  return products.filter((p) => matchesQuery(p, query));
}
