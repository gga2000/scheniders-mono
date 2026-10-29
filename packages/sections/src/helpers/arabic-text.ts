// =====================================================================
// arabic-text — find words in Arabic copy the way a reader would
// =====================================================================
// Review theme counts, key-phrase marks, the scent card's customer quote
// and the note-photo pairing all ask "does this text say X?". In Arabic the
// same word is written several ways (ثبات / ثباتٌ, علبة / علبه, ـ stretched),
// so both sides are folded with the shared `normalizeArabic` — never a
// second normaliser. The catch is that a mark must land on the ORIGINAL
// text, so `findTermHits` folds one source character at a time and keeps a
// map from each folded unit back to its source range:
//   - whitespace and the Arabic separators «، ؛ ؟ ۔» → one space (runs
//     collapse, as normalizeArabic collapses them);
//   - any other character → normalizeArabic(ch). That may be empty
//     (tashkeel, tatweel, lone hamza: the character joins the range of the
//     letter before it, so a mark never splits a letter from its haraka) or
//     longer than one unit (an NFKC ligature such as ﻻ → لا: every folded
//     unit maps to the whole ligature).
// Matching rules:
//   - `findTermHits` is SUBSTRING matching on folded text: «بثباته»
//     contains «ثبات», «تغليفهم» contains «تغليف». Theme counts depend on it.
//   - `hasWholeWords` is WHOLE-WORD matching, for pairing a note name with
//     a feature-card title, where «الفاخرة» must not pair with «الفاخر».
// =====================================================================

import { normalizeArabic, searchTokens } from "@scheniders/shared";

export interface TermHit {
  /** The term as the caller passed it (unfolded). */
  term: string;
  /** Source UTF-16 offset where the hit starts. */
  start: number;
  /** Source UTF-16 offset just past the hit (exclusive). */
  end: number;
}

const SEPARATOR = /[\s،؛؟۔]/u;

interface FoldedText {
  folded: string;
  /** Per folded UTF-16 unit: the source offset its character starts at. */
  starts: number[];
  /** Per folded UTF-16 unit: the source offset just past its character
   *  and any characters that folded away after it. */
  ends: number[];
}

function foldWithMap(text: string): FoldedText {
  let folded = "";
  const starts: number[] = [];
  const ends: number[] = [];
  let offset = 0;
  for (const ch of text) {
    const at = offset;
    offset += ch.length;
    if (SEPARATOR.test(ch)) {
      if (folded.endsWith(" ")) continue;
      folded += " ";
      starts.push(at);
      ends.push(offset);
      continue;
    }
    const f = normalizeArabic(ch);
    if (f === "") {
      if (ends.length > 0) ends[ends.length - 1] = offset;
      continue;
    }
    for (let k = 0; k < f.length; k++) {
      starts.push(at);
      ends.push(offset);
    }
    folded += f;
  }
  return { folded, starts, ends };
}

/**
 * Every place in `text` where a term occurs, as SOURCE ranges, sorted by
 * start (longer first on a tie). Substring matching on folded text; terms
 * that fold to nothing are skipped. Hits of different terms may overlap —
 * a caller that marks text merges them.
 */
export function findTermHits(text: string, terms: readonly string[]): TermHit[] {
  const { folded, starts, ends } = foldWithMap(text);
  const hits: TermHit[] = [];
  for (const term of terms) {
    const needle = normalizeArabic(term);
    if (!needle) continue;
    let from = 0;
    for (;;) {
      const at = folded.indexOf(needle, from);
      if (at < 0) break;
      hits.push({ term, start: starts[at], end: ends[at + needle.length - 1] });
      from = at + 1;
    }
  }
  return hits.sort((a, b) => a.start - b.start || b.end - a.end);
}

/**
 * True when every folded word of `needle` is a whole word of `haystack`
 * (order and extra words in the haystack do not matter). An empty needle
 * matches nothing.
 */
export function hasWholeWords(haystack: string, needle: string): boolean {
  const wanted = searchTokens(needle);
  if (wanted.length === 0) return false;
  const words = new Set(searchTokens(haystack));
  return wanted.every((w) => words.has(w));
}
