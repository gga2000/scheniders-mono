// =====================================================================
// Arabic search normalisation
// =====================================================================
// Product search compared raw strings, so a shopper only found a product
// by typing it exactly as the merchant stored it. In Arabic that is a much
// bigger problem than in English, because the same word is routinely
// written several ways that all read identically:
//
//   أحمد / احمد / آحمد   — hamza on the alef, or not
//   عطرية / عطريه         — ta marbuta vs ha
//   ليلى / ليلي           — alef maqsura vs ya
//   عِطْر / عطر             — with or without diacritics
//   ٢٠٠ / 200            — Arabic-Indic vs Western digits
//
// None of these are misspellings; they are all normal, and Iraqi shoppers
// type whichever their keyboard offers. Folding them to one form on BOTH
// sides of the comparison is what makes search work at all.
//
// This is normalisation, not fuzzy matching: every rule here maps
// characters that are genuinely interchangeable in search. Nothing guesses.
// =====================================================================

/** Harakat, sukun, shadda, superscript alef — never typed when searching. */
const DIACRITICS = /[ً-ْٰـۖ-ۭ]/g;

/** Every alef form folds to the bare alef. */
const ALEF = /[آأإٱ]/g;

const ARABIC_INDIC_ZERO = 0x0660; // ٠
const EASTERN_ARABIC_ZERO = 0x06f0; // ۰

/**
 * Fold a string to its searchable form. Applied identically to the query
 * and to the text being searched — normalising only one side would make
 * matching worse, not better.
 */
export function normalizeArabic(input: string): string {
  if (!input) return "";
  return (
    input
      // Presentation forms (ﻷ and friends) decompose to their real letters.
      .normalize("NFKC")
      .replace(DIACRITICS, "")
      .replace(ALEF, "ا")
      // Ta marbuta → ha: عطرية and عطريه are the same word.
      .replace(/ة/g, "ه")
      // Alef maqsura → ya: ليلى and ليلي are the same word.
      .replace(/ى/g, "ي")
      // Hamza carriers fold to their base letter.
      .replace(/ؤ/g, "و")
      .replace(/ئ/g, "ي")
      .replace(/ء/g, "")
      // Both Arabic digit sets fold to Western, so "٢٠٠" finds "200".
      .replace(/[٠-٩]/g, (d) =>
        String(d.charCodeAt(0) - ARABIC_INDIC_ZERO),
      )
      .replace(/[۰-۹]/g, (d) =>
        String(d.charCodeAt(0) - EASTERN_ARABIC_ZERO),
      )
      // Arabic comma and full stop behave as separators, like their Latin
      // counterparts.
      .replace(/[،؛؟۔]/g, " ")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim()
  );
}

/** Split a query into normalised tokens, dropping empties. */
export function searchTokens(query: string): string[] {
  return normalizeArabic(query).split(" ").filter(Boolean);
}

/**
 * Does `haystack` contain every token? Both sides are normalised here, so
 * callers cannot accidentally compare a folded query against raw text.
 */
export function matchesAllTokens(haystack: string, tokens: readonly string[]): boolean {
  if (tokens.length === 0) return true;
  const hay = normalizeArabic(haystack);
  return tokens.every((token) => hay.includes(token));
}
