// =====================================================================
// The «بصمة العطر» card's data (F07, spec §1.4) — pure, no React
// =====================================================================
// Composes the unchanged `buildScentJourney` (tiers, chip rows, the
// staying-power line) with what only the card shows:
//   - a photo per note, from the merchant's own note cards. A card pairs
//     with a note when every word of the note is a whole word of the card
//     title (leading emoji dropped); each photo is used once, so none
//     repeats, and a note without one stays a text chip;
//   - segment meters, only from range values the merchant entered (so the
//     journey block still never draws a range);
//   - the lead line and the story: the draft-only `product_copy` entry
//     first (D9), then the `lead_key` attribute / products.description;
//   - one customer clause about staying power, verbatim: the merchant's
//     pick while it still matches its review, else the first clause of
//     the strongest 4★+ reviews that names a quote term in 3–14 words.
// A card with no tiers, facts, lead or story is null: nothing is drawn
// empty.
// =====================================================================

import { resolveI18n } from "@scheniders/shared";
import type { LocaleCode, ResolvedProductAttribute } from "@scheniders/shared";
import { findTermHits, hasWholeWords } from "../helpers/arabic-text";
import type { Props } from "../pdp_direct_order";
import type { Product, ReviewSummaryItem } from "../types";
import { STAGE_HINT, buildScentJourney, type JourneyChipRow } from "./scent-journey";
import { xs } from "./text";

export type ScentCardConfig = NonNullable<Props["scent_card"]>;

export interface ScentNote {
  name: string;
  /** The paired note-card photo, or null (a text chip). */
  image: string | null;
}

export interface ScentTier {
  key: string;
  label: string;
  /** «أول ما ترشه» for top/heart/base; "" for other group keys. */
  hint: string;
  notes: ScentNote[];
}

export interface ScentMeter {
  key: string;
  label: string;
  value: number;
  max: number;
  /** Segments to draw (the integer max, 2–10); 0 = the value line only. */
  segments: number;
  filled: number;
}

export interface ScentQuote {
  reviewId: string;
  text: string;
  author: string;
  rating: number;
}

export interface ScentStoryCard {
  image: string | null;
  title: string;
  body: string;
}

export interface ScentCardData {
  lead: string;
  tiers: ScentTier[];
  meters: ScentMeter[];
  /** The meters' source tag («حسب تجربتنا»); "" without meters. */
  factsSource: string;
  chipRows: JourneyChipRow[];
  note: { label: string; text: string } | null;
  quote: ScentQuote | null;
  /** The story split into paragraphs on blank lines. */
  story: string[];
  storyCards: ScentStoryCard[];
}

const LEADING_EMOJI = /^(?:\p{Extended_Pictographic}|️|‍)+\s*/u;

/** A note-card title without its leading emoji («🫐 التوت البري الفاخر» →
 *  «التوت البري الفاخر»). */
export function stripLeadingEmoji(title: string): string {
  return title.replace(LEADING_EMOJI, "").trim();
}

/** The monogram for a reviewer: the first letter of the first word that is
 *  not an abbreviation («eng. سيف» → «س»). */
export function monogramOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const word = words.find((w) => !w.endsWith(".")) ?? words[0] ?? "";
  return (Array.from(word)[0] ?? "").toLocaleUpperCase();
}

type FeatureCard = { image_url?: string; title: string; body: string };

function featureCardsOf(product: Product): FeatureCard[] {
  return Array.isArray(product.feature_cards)
    ? product.feature_cards.filter(
        (c): c is FeatureCard => !!c && typeof c.title === "string" && typeof c.body === "string",
      )
    : [];
}

function pairPhotos(
  stages: { key: string; label: string; notes: string[] }[],
  cards: FeatureCard[],
  locale: LocaleCode,
): ScentTier[] {
  // Pair the most specific note names first, so «التوت البري» keeps the
  // «التوت البري الفاخر» photo even when «التوت» comes earlier in the
  // pyramid. Each photo is used once.
  const usedUrls = new Set<string>();
  const photoAt = new Map<string, string>();
  const slots = stages.flatMap((s, si) => s.notes.map((name, ni) => ({ at: `${si}:${ni}`, name })));
  const wordCount = (n: string) => n.trim().split(/\s+/).length;
  // Array.prototype.sort is stable, so equal lengths keep pyramid order.
  for (const { at, name } of [...slots].sort((a, b) => wordCount(b.name) - wordCount(a.name))) {
    const card = cards.find(
      (c) =>
        !!c.image_url &&
        !usedUrls.has(c.image_url) &&
        hasWholeWords(stripLeadingEmoji(c.title), name),
    );
    if (!card?.image_url) continue;
    usedUrls.add(card.image_url);
    photoAt.set(at, card.image_url);
  }
  return stages.map((s, si) => {
    const hintKey = STAGE_HINT.get(s.key);
    return {
      key: s.key,
      label: s.label,
      hint: hintKey ? xs(hintKey, locale) : "",
      notes: s.notes.map((name, ni) => ({ name, image: photoAt.get(`${si}:${ni}`) ?? null })),
    };
  });
}

function metersOf(
  byKey: Map<string, ResolvedProductAttribute>,
  keys: readonly string[],
  locale: LocaleCode,
): ScentMeter[] {
  return keys.flatMap((k) => {
    const attr = byKey.get(k);
    if (!attr || attr.kind !== "range" || !Number.isFinite(attr.value)) return [];
    const max = attr.def.range_max;
    const segments = Number.isInteger(max) && max >= 2 && max <= 10 ? max : 0;
    return [
      {
        key: k,
        label: resolveI18n(attr.def.name_i18n, locale) || k,
        value: attr.value,
        max,
        segments,
        filled: Math.min(segments, Math.max(0, Math.round(attr.value))),
      },
    ];
  });
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

const CLAUSE_SPLIT = /[.،!؟\n]/;

function quoteOf(
  product: Product,
  config: ScentCardConfig,
): ScentQuote | null {
  const reviews: ReviewSummaryItem[] = (product.reviews ?? []).filter(
    (r) => r.rating >= 4 && !!r.body?.trim() && !!r.author_name?.trim(),
  );
  const asQuote = (r: ReviewSummaryItem, text: string): ScentQuote => ({
    reviewId: r.id,
    text,
    author: (r.author_name ?? "").trim(),
    rating: r.rating,
  });

  const pick = config.quote_picks?.find((p) => p.product_id === product.id);
  if (pick) {
    const r = reviews.find((x) => x.id === pick.review_id);
    if (r?.body?.includes(pick.text)) return asQuote(r, pick.text);
  }

  const terms = config.quote_terms ?? [];
  if (terms.length === 0) return null;
  const ordered = [...reviews].sort(
    (a, b) => b.rating - a.rating || (b.body ?? "").length - (a.body ?? "").length,
  );
  for (const r of ordered) {
    for (const raw of (r.body ?? "").split(CLAUSE_SPLIT)) {
      const clause = raw.trim();
      const n = wordCount(clause);
      if (n >= 3 && n <= 14 && findTermHits(clause, terms).length > 0) return asQuote(r, clause);
    }
  }
  return null;
}

export function buildScentCard(input: {
  product: Product;
  config: ScentCardConfig;
  locale: LocaleCode;
  /** products.description when the section shows it (`show_description`),
   *  else null. */
  description: string | null;
}): ScentCardData | null {
  const { product, config, locale } = input;
  const attributes = product.attributes ?? [];
  const byKey = new Map<string, ResolvedProductAttribute>(attributes.map((a) => [a.def.key, a]));
  const journey = buildScentJourney(
    attributes,
    { pyramid_key: config.pyramid_key, chip_keys: config.chip_keys, note_key: config.note_key },
    locale,
  );
  const cards = featureCardsOf(product);
  const copy = config.product_copy?.find((c) => c.product_id === product.id);

  const leadAttr = config.lead_key ? byKey.get(config.lead_key) : undefined;
  const lead =
    resolveI18n(copy?.lead_i18n, locale).trim() ||
    (leadAttr?.kind === "text" ? resolveI18n(leadAttr.value, locale).trim() : "");

  const storyText = resolveI18n(copy?.story_i18n, locale).trim() || (input.description ?? "").trim();
  const story = storyText
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  const tiers = pairPhotos(journey?.stages ?? [], cards, locale);
  const meters = metersOf(byKey, config.meter_keys ?? [], locale);
  const chipRows = journey?.chipRows ?? [];
  const note = journey?.note ?? null;
  const storyCards = cards.map((c) => ({
    image: c.image_url ?? null,
    title: stripLeadingEmoji(c.title),
    body: c.body,
  }));

  const hasFacts = meters.length > 0 || chipRows.length > 0 || note !== null;
  if (tiers.length === 0 && !hasFacts && !lead && story.length === 0 && storyCards.length === 0) {
    return null;
  }
  return {
    lead,
    tiers,
    meters,
    factsSource: meters.length > 0 ? resolveI18n(config.facts_source_i18n, locale).trim() : "",
    chipRows,
    note,
    quote: quoteOf(product, config),
    story,
    storyCards,
  };
}
