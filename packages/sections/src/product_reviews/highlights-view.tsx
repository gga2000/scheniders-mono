"use client";

// =====================================================================
// product_reviews `layout: "highlights"` — the body under the heading
// =====================================================================
// Spec §1.6, concept g3 A + B's key-phrase tint. In order: the summary
// card (#reviews-summary), the word buttons, then every review in D10
// order as one swipe carousel (reversed in Arabic so the first card sits
// at the right edge and the next peeks on the left), with position dots
// that autoplay until touched (helpers/carousel-dots) and desktop arrows.
// A word button HIGHLIGHTS, never filters: every card keeps its place,
// the matching words get a mark, the carousel stops and brings the first
// marked card into view (only a press scrolls), and one polite status
// line reads the result to a screen reader. A second tap clears. Topic counts,
// order, key phrases and replies are all computed here from the rendered
// reviews and the merchant's props (`review_curation`, until Phase 2's
// columns).
// =====================================================================

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { resolveI18n } from "@scheniders/shared";
import type { LocaleCode, RatingSummary } from "@scheniders/shared";
import { CarouselArrows } from "../helpers/carousel-arrows";
import { CarouselDots, stopCarousel } from "../helpers/carousel-dots";
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

/** A review takes longer to read than a proof screenshot. */
const REVIEW_AUTOPLAY_MS = 6500;

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
  const listId = `reviews-${useId().replace(/:/g, "")}`;
  /** Set by a press, read and cleared by the scroll effect: only a press
   *  scrolls. */
  const scrollPending = useRef(false);
  const [active, setActive] = useState<string | null>(null);

  const themes = useMemo(() => props.theme_words ?? [], [props.theme_words]);
  const curation = useMemo(
    () => new Map<string, Curation>((props.review_curation ?? []).map((c) => [c.review_id, c])),
    [props.review_curation],
  );
  const tagsOf = (id: string): readonly string[] => curation.get(id)?.tags ?? [];
  const counts = themeCounts(reviews, themes, tagsOf);
  const { all } = featuredOrder(reviews, {
    visibleCount: props.visible_count,
    rankOf: (id) => curation.get(id)?.rank,
    themeCountOf: (r) => reviewThemes(r.body, tagsOf(r.id), themes).size,
  });
  const allTerms = themes.flatMap((t) => t.match_terms ?? []);
  const activeTheme = themes.find((t) => t.key === active);
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
    const card = listRef.current
      ?.querySelector("[data-term], [data-term-card]")
      ?.closest("[data-review-card]");
    if (!card) return;
    stopCarousel(listId);
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    card.scrollIntoView({ block: "nearest", inline: "start", behavior: reduce ? "auto" : "smooth" });
  }, [active, listId]);

  function press(key: string): void {
    if (active === key) {
      setActive(null);
      return;
    }
    scrollPending.current = true;
    setActive(key);
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

      <div role="region" aria-roledescription="carousel" aria-label={rs("carouselLabel", locale)} className="mt-bk-md">
        <ul
          ref={listRef}
          id={listId}
          data-review-list=""
          className={cn(
            "-mx-4 flex snap-x snap-mandatory items-stretch gap-bk-sm overflow-x-auto overscroll-x-contain px-4 scroll-px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
            rtl && "flex-row-reverse",
          )}
        >
          {all.map((review, i) => {
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
                className={all.length > 1 ? "w-[85%] max-w-[340px] shrink-0 snap-start" : "w-full"}
              />
            );
          })}
        </ul>
        <CarouselDots
          trackId={listId}
          rtl={rtl}
          intervalMs={REVIEW_AUTOPLAY_MS}
          labels={all.map((_, i) => rs("reviewDot", locale, { n: i + 1 }))}
        />
        {all.length > 1 && (
          <CarouselArrows
            trackId={listId}
            // The left arrow scrolls left: the next card in a reversed track.
            prevLabel={rs(rtl ? "nextReview" : "prevReview", locale)}
            nextLabel={rs(rtl ? "prevReview" : "nextReview", locale)}
            className="mt-bk-sm justify-end"
          />
        )}
      </div>
    </>
  );
}
