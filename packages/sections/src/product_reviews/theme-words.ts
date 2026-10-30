// =====================================================================
// product_reviews highlights — the word buttons («الثبات 3 · التيستر 2 …»)
// =====================================================================
// A topic is one of the merchant's `theme_words`. A review mentions it
// when its body contains one of the topic's `match_terms` (folded
// SUBSTRING match through `findTermHits`: «بثباته» counts for «ثبات»,
// «العلبة» for «علبه»), or when the review's curation tags hold the
// topic's key (a tag-only topic such as «طلبوا مرة ثانية»). Each review
// counts once per topic. The counts are honest by construction: computed
// from the rendered reviews at render time, never stored.
// =====================================================================

import type { I18nString } from "@scheniders/shared";
import { findTermHits } from "../helpers/arabic-text";
import { mergeRanges, widenToWords, type TextRange } from "./marks";

export interface ThemeWord {
  key: string;
  label_i18n: I18nString;
  match_terms?: string[];
}

export interface ThemeCount {
  key: string;
  label_i18n: I18nString;
  count: number;
}

/** The topic keys one review mentions. */
export function reviewThemes(
  body: string | null | undefined,
  tags: readonly string[],
  themes: readonly ThemeWord[],
): Set<string> {
  const text = body ?? "";
  const out = new Set<string>();
  for (const theme of themes) {
    const byText = (theme.match_terms ?? []).length > 0 && findTermHits(text, theme.match_terms ?? []).length > 0;
    if (byText || tags.includes(theme.key)) out.add(theme.key);
  }
  return out;
}

/** Per topic, in the merchant's order, how many reviews mention it.
 *  Topics nobody mentions are left out (they never render). */
export function themeCounts(
  reviews: readonly { id: string; body?: string | null }[],
  themes: readonly ThemeWord[],
  tagsOf: (reviewId: string) => readonly string[],
): ThemeCount[] {
  return themes
    .map((theme) => ({
      key: theme.key,
      label_i18n: theme.label_i18n,
      count: reviews.filter((r) => reviewThemes(r.body, tagsOf(r.id), [theme]).has(theme.key)).length,
    }))
    .filter((t) => t.count > 0);
}

/** Every word of `body` that contains one of `theme`'s terms, merged.
 *  A tag-only topic has no words to mark: it marks the card instead. */
export function themeWordRanges(body: string, theme: ThemeWord | undefined): TextRange[] {
  const terms = theme?.match_terms ?? [];
  if (terms.length === 0) return [];
  return mergeRanges(findTermHits(body, terms).map((h) => widenToWords(body, h)));
}
