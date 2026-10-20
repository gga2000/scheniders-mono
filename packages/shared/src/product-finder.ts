// =====================================================================
// Product finder — scoring a shopper's answers against the catalogue
// =====================================================================
// A merchant writes questions; each question narrows on ONE attribute, and
// each answer carries a value for it. A perfume house asks "which family?"
// and "how long should it last?"; a coffee roaster asks about roast and
// body. The engine knows neither — it only knows how to compare an answer
// to an attribute value, per kind.
//
// Scoring is a RANKING, not a filter. A shopper who answers four questions
// should get a best match even if nothing satisfies all four; showing an
// empty result because no product is perfect is the failure mode that makes
// these quizzes feel broken.
// =====================================================================

import { normalizeArabic } from "./arabic-search";
import type { ResolvedProductAttribute } from "./product-attribute";

/** One answer the shopper picked: an attribute, and the value they chose. */
export interface FinderAnswer {
  attribute_key: string;
  /** Compared per kind — an option value, a number, or a note. */
  value: string;
  /**
   * Relative importance, default 1. Lets a merchant say that the scent
   * family matters more than the season without inventing a scale.
   */
  weight?: number;
}

/** How well one product attribute answers one picked value, in [0, 1]. */
function answerCloseness(attr: ResolvedProductAttribute, value: string): number | null {
  const wanted = value.trim();
  if (!wanted) return null;

  switch (attr.kind) {
    case "enum":
      return attr.value === wanted ? 1 : 0;
    case "boolean":
      return String(attr.value) === wanted.toLowerCase() ? 1 : 0;
    case "range": {
      const target = Number(wanted);
      if (!Number.isFinite(target)) return null;
      const span = attr.def.range_max - attr.def.range_min;
      if (span <= 0) return null;
      // A near-miss still counts: asking for 5 and finding 4 is a good
      // answer, and treating it as a total mismatch would hide it.
      return Math.max(0, 1 - Math.abs(attr.value - target) / span);
    }
    case "group_list": {
      const target = normalizeArabic(wanted);
      const has = Object.values(attr.value)
        .flat()
        .some((item) => normalizeArabic(item) === target);
      return has ? 1 : 0;
    }
    case "text":
      return null;
  }
}

/**
 * Score one product against every answer. Returns `null` when the product
 * carries none of the attributes asked about — it cannot be ranked, only
 * listed after the ones that can.
 */
export function scoreProductAgainstAnswers(
  attributes: readonly ResolvedProductAttribute[],
  answers: readonly FinderAnswer[],
): number | null {
  if (answers.length === 0) return null;
  const byKey = new Map(attributes.map((a) => [a.def.key, a]));

  let total = 0;
  let weightSum = 0;
  for (const answer of answers) {
    const attr = byKey.get(answer.attribute_key);
    if (!attr) continue;
    const closeness = answerCloseness(attr, answer.value);
    if (closeness === null) continue;
    const weight = answer.weight != null && answer.weight > 0 ? answer.weight : 1;
    total += closeness * weight;
    weightSum += weight;
  }

  return weightSum === 0 ? null : total / weightSum;
}

export interface FinderMatch<T> {
  item: T;
  /** null when the product carries none of the attributes asked about. */
  score: number | null;
}

/**
 * Rank a catalogue against the shopper's answers, best first. Products that
 * cannot be scored keep their original order at the end rather than being
 * dropped — a finder that returns nothing has failed at its only job.
 */
export function rankByAnswers<T>(
  items: readonly T[],
  getAttributes: (item: T) => readonly ResolvedProductAttribute[],
  answers: readonly FinderAnswer[],
): FinderMatch<T>[] {
  return items
    .map((item, index) => ({
      item,
      index,
      score: scoreProductAgainstAnswers(getAttributes(item), answers),
    }))
    .sort((a, b) => {
      if (a.score === null && b.score === null) return a.index - b.index;
      if (a.score === null) return 1;
      if (b.score === null) return -1;
      return b.score - a.score || a.index - b.index;
    })
    .map(({ item, score }) => ({ item, score }));
}
