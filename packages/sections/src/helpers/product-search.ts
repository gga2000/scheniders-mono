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
// three, and the shopper reads that as "the store doesn't have it". The
// folding itself lives in @scheniders/shared (`normalizeArabic`) so there is
// exactly one definition of "the same word".
// =====================================================================

import { matchesAllTokens, resolveI18n, searchTokens } from "@scheniders/shared";
import type { LocaleCode } from "@scheniders/shared";
import type { Product } from "../types";

/**
 * Everything about a product that is worth searching: its own text, plus —
 * when the shopper's locale is known — the merchant's attribute values. A
 * shopper looking for "عنبر" means a perfume with amber in it, and only the
 * note pyramid knows that.
 *
 * Only the human-readable side of an attribute is indexed, in the shopper's
 * locale: option LABELS rather than their machine values, so nobody finds a
 * product by typing "oriental" at an Arabic storefront. Without a locale
 * there is no label to read, so only the product's own text is searched.
 */
function searchableText(product: Product, locale: LocaleCode | undefined): string {
  const parts = [
    product.name,
    product.sku ?? "",
    product.short_description ?? "",
    product.description ?? "",
  ];
  if (locale) {
    for (const attr of product.attributes ?? []) {
      parts.push(resolveI18n(attr.def.name_i18n, locale));
      switch (attr.kind) {
        case "enum":
          parts.push(resolveI18n(attr.option.label_i18n, locale) || attr.value);
          break;
        case "group_list":
          for (const items of Object.values(attr.value)) parts.push(items.join(" "));
          break;
        case "text":
          parts.push(resolveI18n(attr.value, locale));
          break;
        default:
          // A number or a yes/no is not something anyone types into search.
          break;
      }
    }
  }
  return parts.join(" ");
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
export function matchesQuery(product: Product, query: string, locale?: LocaleCode): boolean {
  const tokens = searchTokens(query);
  if (tokens.length === 0) return true;
  return matchesAllTokens(searchableText(product, locale), tokens);
}

/** `matchesQuery` over a list. Never mutates the input. */
export function filterByQuery(
  products: Product[],
  query: string,
  locale?: LocaleCode,
): Product[] {
  const tokens = searchTokens(query);
  if (tokens.length === 0) return products;
  return products.filter((p) => matchesAllTokens(searchableText(p, locale), tokens));
}
