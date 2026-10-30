"use client";

// =====================================================================
// product_reviews `layout: "highlights"` — the body under the heading
// =====================================================================
// Spec §1.6, concept g3 A + B's key-phrase tint. In order: the summary
// card (#reviews-summary), the word buttons, the cards in D10 order, and
// «شوف كل التقييمات (N)». A word button HIGHLIGHTS, never filters: the
// list keeps every card in its place, the matching words get a mark, a
// hidden matching review brings the rest into view, the page scrolls to
// the first mark (only a press scrolls), and one polite status line reads
// the result to a screen reader. A second tap clears. Topic counts,
// order, key phrases and replies are all computed here from the rendered
// reviews and the merchant's props (`review_curation`, until Phase 2's
// columns).
// =====================================================================

import { useEffect, useMemo, useRef, useState } from "react";
import { resolveI18n } from "@scheniders/shared";
import type { LocaleCode, RatingSummary } from "@scheniders/shared";
import { readsRtl } from "../helpers/reading";
import { cn } from "../helpers/utils";
import { reviewCountLabel } from "../pdp_express/identity-label";
import type { Props } from "../product_reviews";
import type { ReviewSummaryItem } from "../types";
import { featuredOrder } from "./featured-order";
import { HighlightsCard, type StoreReply } from "./highlights-card";
import { HighlightsSummary } from "./highlights-summary";
import { keyPhraseRange } from "./marks";
import { rs } from "./strings";
import { reviewThemes, themeCounts, themeWordRanges } from "./theme-words";

type Curation = NonNullable<Props["review_curation"]>[number];

export function HighlightsView({
  reviews,
  summary,
  distributionKnown,
  props,
  locale,
  storeName,
  logoUrl,
  onOpenPhoto,
}: {
  reviews: readonly ReviewSummaryItem[];
  summary: RatingSummary;
  distributionKnown: boolean;
  props: Pick<Props, "theme_words" | "visible_count" | "review_curation">;
  locale: LocaleCode;
  /** «رد {store}» — `storeDisplayName` (D15). */
  storeName: string;
  logoUrl: string | null;
  onOpenPhoto: (image: { url: string; alt: string }) => void;
}) {
  const rtl = readsRtl(locale);
  const listRef = useRef<HTMLUListElement>(null);
  /** Set by a press, read and cleared by the scroll effect: only a press
   *  scrolls, never «شوف كل التقييمات» opening the rest under a topic. */
  const scrollPending = useRef(false);
  const [active, setActive] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const themes = useMemo(() => props.theme_words ?? [], [props.theme_words]);
  const curation = useMemo(
    () => new Map<string, Curation>((props.review_curation ?? []).map((c) => [c.review_id, c])),
    [props.review_curation],
  );
  const tagsOf = (id: string): readonly string[] => curation.get(id)?.tags ?? [];
  const counts = themeCounts(reviews, themes, tagsOf);
  const { visible, all } = featuredOrder(reviews, {
    visibleCount: props.visible_count,
    rankOf: (id) => curation.get(id)?.rank,
    themeCountOf: (r) => reviewThemes(r.body, tagsOf(r.id), themes).size,
  });
  const allTerms = themes.flatMap((t) => t.match_terms ?? []);
  const activeTheme = themes.find((t) => t.key === active);
  const shown = expanded ? all : visible;
  const activeCount = counts.find((t) => t.key === active);
  const announcement = activeCount
    ? rs("themeAnnounce", locale, {
        topic: resolveI18n(activeCount.label_i18n, locale),
        count: reviewCountLabel(activeCount.count, locale),
      })
    : "";

  useEffect(() => {
    if (!scrollPending.current) return;
    scrollPending.current = false;
    if (!active) return;
    const first = listRef.current?.querySelector("[data-term], [data-term-card]");
    if (!first) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    first.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
  }, [active, expanded]);

  function press(key: string): void {
    if (active === key) {
      setActive(null);
      return;
    }
    scrollPending.current = true;
    setActive(key);
    const hiddenMatch = all.some(
      (r) => !visible.includes(r) && reviewThemes(r.body, tagsOf(r.id), themes).has(key),
    );
    if (hiddenMatch) setExpanded(true);
  }

  if (reviews.length === 0 || summary.count === 0) {
    return (
      <p
        data-reviews-empty=""
        className={cn("font-bk-body text-sm text-bk-ink-soft text-pretty", rtl && "text-right")}
      >
        {rs("emptyHighlights", locale)}
      </p>
    );
  }

  return (
    <>
      <HighlightsSummary summary={summary} distributionKnown={distributionKnown} locale={locale} />

      {/* Two topics and two reviews at least: with one review, every
          button would read 1 and point at the card under it. */}
      {counts.length >= 2 && reviews.length >= 2 && (
        <div className={cn("mt-bk-md flex flex-col gap-bk-xs", rtl ? "items-end" : "items-start")}>
          <p className="font-bk-body text-xs font-bold text-bk-ink-soft">{rs("themesLabel", locale)}</p>
          <div
            role="group"
            aria-label={rs("themesLabel", locale)}
            className={cn("flex flex-wrap gap-bk-xs", rtl && "flex-row-reverse")}
          >
            {counts.map((t) => {
              const pressed = active === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  data-theme-word={t.key}
                  aria-pressed={pressed}
                  onClick={() => press(t.key)}
                  className={cn(
                    "inline-flex min-h-11 items-center gap-1.5 rounded-bk-pill px-bk-md font-bk-body text-sm font-bold transition-colors duration-bk-fast motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 ring-bk-focus",
                    pressed
                      ? "bg-bk-secondary text-bk-on-secondary"
                      : "border-bk border-bk-divider bg-bk-surface text-bk-ink",
                    rtl && "flex-row-reverse",
                  )}
                >
                  <span>{resolveI18n(t.label_i18n, locale)}</span>
                  <bdi className="font-black tabular-nums">{t.count}</bdi>
                </button>
              );
            })}
          </div>
          <p role="status" aria-live="polite" data-theme-status="" className="sr-only">
            {announcement}
          </p>
        </div>
      )}

      <ul ref={listRef} data-review-list="" className="mt-bk-md space-y-bk-sm">
        {shown.map((review, i) => {
          const c = curation.get(review.id);
          const body = review.body ?? "";
          const replyText = resolveI18n(c?.reply_i18n, locale).trim();
          const reply: StoreReply | null =
            replyText && storeName ? { store: storeName, text: replyText, logoUrl } : null;
          const tagOnly = activeTheme !== undefined && (activeTheme.match_terms ?? []).length === 0;
          return (
            <HighlightsCard
              key={review.id}
              review={review}
              featured={i === 0}
              locale={locale}
              keyPhrase={keyPhraseRange(body, c?.highlight, allTerms)}
              termRanges={themeWordRanges(body, activeTheme)}
              tagHit={tagOnly && activeTheme !== undefined && tagsOf(review.id).includes(activeTheme.key)}
              reply={reply}
              onOpenPhoto={onOpenPhoto}
            />
          );
        })}
      </ul>

      {!expanded && all.length > visible.length && (
        <button
          type="button"
          data-reviews-show-all=""
          onClick={() => setExpanded(true)}
          className={cn(
            "mt-bk-md flex min-h-[52px] w-full items-center justify-center rounded-bk-pill border-bk border-bk-divider bg-bk-surface font-bk-body text-[15px] font-extrabold text-bk-ink transition-transform duration-bk-fast active:scale-[0.98] motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 ring-bk-focus",
          )}
        >
          {rs("showAll", locale, { count: all.length })}
        </button>
      )}
    </>
  );
}
