// =====================================================================
// product_reviews highlights — where the yellow goes in a review body
// =====================================================================
// Two kinds of mark land on the same text (spec §1.6, concept g3 A + B):
//   - the key phrase: one stretch per review, a low-alpha tint that is
//     always on. The merchant's pick (`review_curation[].highlight`) wins
//     when it is a verbatim part of the body (grown to whole words);
//     else the first clause that names a topic, when that clause is 3–14
//     words (the scent quote's rule: a body with no punctuation is one
//     clause, and marking a whole review is not a key phrase); else
//     nothing;
//   - topic marks: while a word button is pressed, every word that
//     contains one of its terms. A hit is widened to the whole word, so a
//     <mark> never splits an Arabic word (and its joined letters) in two.
// `markSegments` cuts the body into runs that carry either flag, so the
// renderer only maps runs to elements. Offsets are UTF-16 source offsets,
// as `findTermHits` returns them.
// =====================================================================

import { findTermHits } from "../helpers/arabic-text";

export interface TextRange {
  start: number;
  end: number;
}

export interface MarkSegment {
  text: string;
  /** Inside the review's key phrase. */
  key: boolean;
  /** Inside a word the pressed topic matched. */
  term: boolean;
}

/** Characters that end a word: whitespace, the separators
 *  `helpers/arabic-text.ts` folds (« ، ؛ ؟ ۔ »), the punctuation reviews
 *  use, and «-» «/» («ثبات-ممتاز» is two words). Tatweel «ـ» is NOT here:
 *  it stretches letters inside a word. */
const WORD_BREAK = /[\s.,!?؟،؛۔:«»()"'…\-/]/u;

/** Characters that end a clause. */
const CLAUSE_BREAK = /[.،!؟\n]/u;

/** `range` grown to the whole words it touches. */
export function widenToWords(text: string, range: TextRange): TextRange {
  let start = range.start;
  let end = range.end;
  while (start > 0 && !WORD_BREAK.test(text.charAt(start - 1))) start -= 1;
  while (end < text.length && !WORD_BREAK.test(text.charAt(end))) end += 1;
  return { start, end };
}

/** Sorted, with overlapping or touching ranges joined. */
export function mergeRanges(ranges: readonly TextRange[]): TextRange[] {
  const sorted = [...ranges].sort((a, b) => a.start - b.start || a.end - b.end);
  const out: TextRange[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end);
    else out.push({ ...r });
  }
  return out;
}

/** The body's clauses (split on «.» «،» «!» «؟» and newline), trimmed,
 *  as source ranges; empty clauses are skipped. */
export function clauseRanges(text: string): TextRange[] {
  const out: TextRange[] = [];
  let from = 0;
  for (let i = 0; i <= text.length; i++) {
    if (i < text.length && !CLAUSE_BREAK.test(text.charAt(i))) continue;
    let start = from;
    let end = i;
    while (start < end && /\s/u.test(text.charAt(start))) start += 1;
    while (end > start && /\s/u.test(text.charAt(end - 1))) end -= 1;
    if (end > start) out.push({ start, end });
    from = i + 1;
  }
  return out;
}

function wordCount(text: string): number {
  return text.split(/\s+/u).filter(Boolean).length;
}

/** The review's key phrase as a source range, or null. */
export function keyPhraseRange(
  body: string,
  curated: string | undefined,
  terms: readonly string[],
): TextRange | null {
  const pick = curated?.trim();
  if (pick) {
    const at = body.indexOf(pick);
    // Widened, so a pick cut mid-word never starts or ends a <mark> inside one.
    if (at >= 0) return widenToWords(body, { start: at, end: at + pick.length });
  }
  if (terms.length === 0) return null;
  for (const clause of clauseRanges(body)) {
    const text = body.slice(clause.start, clause.end);
    const words = wordCount(text);
    if (words < 3 || words > 14) continue;
    if (findTermHits(text, terms).length > 0) return clause;
  }
  return null;
}

/** `text` cut into runs at every mark edge, each run flagged. */
export function markSegments(
  text: string,
  key: TextRange | null,
  terms: readonly TextRange[],
): MarkSegment[] {
  const merged = mergeRanges(terms);
  const edges = new Set<number>([0, text.length]);
  if (key) {
    edges.add(key.start);
    edges.add(key.end);
  }
  for (const r of merged) {
    edges.add(r.start);
    edges.add(r.end);
  }
  const cuts = [...edges].filter((n) => n >= 0 && n <= text.length).sort((a, b) => a - b);
  const out: MarkSegment[] = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    const start = cuts[i] ?? 0;
    const end = cuts[i + 1] ?? start;
    if (end <= start) continue;
    const inKey = key !== null && start >= key.start && end <= key.end;
    const inTerm = merged.some((r) => start >= r.start && end <= r.end);
    const prev = out[out.length - 1];
    if (prev && prev.key === inKey && prev.term === inTerm) prev.text += text.slice(start, end);
    else out.push({ text: text.slice(start, end), key: inKey, term: inTerm });
  }
  return out;
}
