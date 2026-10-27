// Quiet reviews summary: one hairline card holding the big average, its
// stars and «N تقييم», and (once real counts are known) a thin bar per
// star. Arabic flips the visual order with classes only; the document
// stays LTR. Server-safe: no hooks.

import type { LocaleCode, RatingSummary } from "@scheniders/shared";
import { Stars } from "../helpers/primitives";
import { cn } from "../helpers/utils";
import { readsRtl } from "../pdp_express/text";
import { reviewCount, rs } from "./strings";

const STAR_ROWS = [5, 4, 3, 2, 1] as const;

export function QuietSummary({
  summary,
  distributionKnown,
  locale,
}: {
  summary: RatingSummary;
  /** False when only the product's aggregate is known: no bars, since
   *  five empty bars under a real average would be a false picture. */
  distributionKnown: boolean;
  locale: LocaleCode;
}) {
  const rtl = readsRtl(locale);
  const avg = summary.average.toFixed(1);
  const max = Math.max(1, summary.count);
  return (
    <div
      data-reviews-summary=""
      className={cn(
        "mt-bk-md flex items-center gap-bk-md rounded-bk-card border-bk border-bk-divider bg-bk-surface p-bk-md",
        rtl && "flex-row-reverse",
      )}
    >
      <div className="flex shrink-0 flex-col items-center gap-1">
        <span className="font-bk-display text-5xl font-black leading-none text-bk-ink tabular-nums">
          <bdi>{avg}</bdi>
        </span>
        <Stars
          value={summary.average}
          size={16}
          label={rs("averageLabel", locale, { avg })}
          className={cn(rtl && "flex-row-reverse")}
        />
        <span className="font-bk-body text-xs font-bold text-bk-ink-soft tabular-nums">
          {reviewCount(summary.count, locale)}
        </span>
      </div>
      {distributionKnown && (
        <ul
          aria-label={rs("distributionLabel", locale)}
          className="min-w-0 flex-1 space-y-1.5"
        >
          {STAR_ROWS.map((star) => {
            const count = summary.distribution[star];
            return (
              <li
                key={star}
                aria-label={rs("starRow", locale, { star, count })}
                className={cn("flex items-center gap-bk-xs", rtl && "flex-row-reverse")}
              >
                <span
                  aria-hidden="true"
                  className="w-3 text-center font-bk-body text-xs text-bk-ink-soft tabular-nums"
                >
                  {star}
                </span>
                <span
                  aria-hidden="true"
                  className="flex h-1.5 flex-1 overflow-hidden rounded-bk-pill bg-bk-ink/10"
                >
                  <span
                    className={cn("block h-full rounded-bk-pill bg-bk-ink", rtl && "ml-auto")}
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
