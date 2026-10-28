// One review in the quiet layout: a hairline card with the name and
// stars on one row, the optional title and the body under it, and photo
// thumbnails that open the section's lightbox. An anonymous review reads
// «زبون», never "verified buyer": nothing verified it. Arabic flips the
// visual order with classes only.

import Image from "next/image";
import type { LocaleCode } from "@scheniders/shared";
import { Stars } from "../helpers/primitives";
import { isOptimizableImageHost } from "../helpers/image";
import { cn } from "../helpers/utils";
import { readsRtl } from "../pdp_express/text";
import type { ReviewSummaryItem } from "../types";
import { rs } from "./strings";

export function QuietReviewCard({
  review,
  locale,
  onOpenPhoto,
}: {
  review: ReviewSummaryItem;
  locale: LocaleCode;
  onOpenPhoto: (image: { url: string; alt: string }) => void;
}) {
  const rtl = readsRtl(locale);
  const name = review.author_name?.trim() || rs("anonymous", locale);
  return (
    <li
      className={cn(
        "rounded-bk-card border-bk border-bk-divider bg-bk-surface p-bk-md",
        rtl && "text-right",
      )}
    >
      <div
        className={cn(
          "flex items-center justify-between gap-bk-sm",
          rtl && "flex-row-reverse",
        )}
      >
        <span className="min-w-0 truncate font-bk-body text-sm font-bold text-bk-ink">
          {name}
        </span>
        <Stars
          value={review.rating}
          size={14}
          label={rs("ratingLabel", locale, { rating: review.rating })}
          className={cn("shrink-0", rtl && "flex-row-reverse")}
        />
      </div>
      {review.title && (
        <h3 className="mt-bk-sm font-bk-display text-sm font-bold text-bk-ink">
          {review.title}
        </h3>
      )}
      {review.body && (
        <p className="mt-bk-xs font-bk-body text-sm leading-relaxed text-bk-ink-soft text-pretty">
          {review.body}
        </p>
      )}
      {review.photo_urls.length > 0 && (
        <div
          className={cn("mt-bk-sm flex flex-wrap gap-bk-xs", rtl && "flex-row-reverse")}
        >
          {review.photo_urls.map((url, i) => {
            const alt = rs("reviewPhoto", locale, { n: i + 1 });
            return (
              <button
                key={`${i}-${url}`}
                type="button"
                onClick={() => onOpenPhoto({ url, alt })}
                aria-label={rs("enlargePhoto", locale)}
                className="relative h-16 w-16 overflow-hidden rounded-bk-input border-bk border-bk-divider focus-visible:outline-none focus-visible:ring-2 ring-bk-focus ring-offset-2"
              >
                <Image
                  src={url}
                  alt={alt}
                  fill
                  unoptimized={!isOptimizableImageHost(url)}
                  sizes="64px"
                  className="object-cover"
                />
              </button>
            );
          })}
        </div>
      )}
    </li>
  );
}
