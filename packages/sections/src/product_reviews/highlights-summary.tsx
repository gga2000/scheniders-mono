// Highlights summary card (spec §1.6 item 2): one light card, no hairline,
// carrying `id="reviews-summary"` — the target of the identity row's
// rating link and the scent card's footer link, so neither ever lands on
// `#reviews` (which opens the review form). The big number and the exact
// stars come from one value, `displayRating(avg)`: «4.7» and a 70% fifth
// star. «من 6 تقييمات» and each bar's label («5 من 5: 5 تقييمات») take
// the identity row's plural forms. Amber is
// used only for the stars and the bars (D4). Bars need the real per-star
// counts and at least two reviews. Server-safe: no hooks.

import type { LocaleCode, RatingSummary } from "@scheniders/shared";
import { displayRating } from "../helpers/format";
import { Stars } from "../helpers/primitives";
import { cn } from "../helpers/utils";
import { readsRtl } from "../helpers/reading";
import { reviewCountLabel } from "../pdp_express/identity-label";
import { rs } from "./strings";

const STAR_ROWS = [5, 4, 3, 2, 1] as const;

export const REVIEWS_SUMMARY_ID = "reviews-summary";

export function HighlightsSummary({
  summary,
  distributionKnown,
  locale,
}: {
  summary: RatingSummary;
  distributionKnown: boolean;
  locale: LocaleCode;
}) {
  const rtl = readsRtl(locale);
  const shown = displayRating(summary.average);
  const avg = shown.toFixed(1);
  const max = Math.max(1, summary.count);
  return (
    <div
      id={REVIEWS_SUMMARY_ID}
      data-reviews-summary="highlights"
      className={cn(
        "flex scroll-mt-24 items-center gap-bk-md rounded-bk-card bg-bk-surface-alt p-bk-md",
        rtl && "flex-row-reverse",
      )}
    >
      <div className="flex shrink-0 flex-col items-center gap-1">
        <span className="font-bk-display text-5xl font-black leading-none text-bk-ink tabular-nums">
          <bdi>{avg}</bdi>
        </span>
        <Stars value={shown} precision="exact" size={16} label={rs("averageLabel", locale, { avg })} />
        <span className="font-bk-body text-xs font-bold text-bk-ink-soft tabular-nums">
          {rs("ofReviews", locale, { count: reviewCountLabel(summary.count, locale) })}
        </span>
      </div>
      {distributionKnown && summary.count >= 2 && (
        <ul aria-label={rs("distributionLabel", locale)} className="min-w-0 flex-1 space-y-1.5">
          {STAR_ROWS.map((star) => {
            const count = summary.distribution[star];
            return (
              <li
                key={star}
                aria-label={rs("starRowCounted", locale, {
                  star,
                  count: reviewCountLabel(count, locale),
                })}
                className={cn("flex items-center gap-bk-xs", rtl && "flex-row-reverse")}
              >
                <span
                  aria-hidden="true"
                  className="inline-flex w-7 shrink-0 items-center justify-center gap-0.5 font-bk-body text-xs text-bk-ink-soft tabular-nums"
                >
                  {star}
                  <span className="text-bk-accent">★</span>
                </span>
                <span
                  aria-hidden="true"
                  className="flex h-1.5 flex-1 overflow-hidden rounded-bk-pill bg-bk-ink/10"
                >
                  <span
                    className={cn("block h-full rounded-bk-pill bg-bk-accent", rtl && "ml-auto")}
                    style={{ width: `${(count / max) * 100}%` }}
                  />
                </span>
                <span
                  aria-hidden="true"
                  className="w-4 text-center font-bk-body text-xs text-bk-ink-soft tabular-nums"
                  data-star-count={star}
                >
                  {count}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
