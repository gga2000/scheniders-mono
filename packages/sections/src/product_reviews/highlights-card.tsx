"use client";

// =====================================================================
// One review in the highlights layout (spec §1.6 items 4–7)
// =====================================================================
// - featured (the first card): an oversized «”», the full body at
//   17px/700 clamped to 5 lines, then «— {name}» and the stars;
// - compact: a 36px monogram, the name in <bdi> (so «eng. سيف» never
//   reads «سيف .eng»), the stars, the body at 15px clamped to 3 lines.
// A clamped body gets «كمّل» only when it really overflows (measured
// after mount and again whenever it resizes), and opens by itself while
// a pressed topic marks a word in it. The key phrase is always tinted (bg-bk-primary/25, a tint, never a
// fill: D4); a pressed topic's words get the stronger /40 tint. A
// tag-only topic marks the card's edge instead. «رد {store}» renders
// under the review only when the merchant wrote a reply. No dates (the
// six imports share one) and no «verified» badge in Phase 1.
// =====================================================================

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { LocaleCode } from "@scheniders/shared";
import { isOptimizableImageHost } from "../helpers/image";
import { MaterialIcon, Stars } from "../helpers/primitives";
import { readsRtl } from "../helpers/reading";
import { cn } from "../helpers/utils";
import type { ReviewSummaryItem } from "../types";
import { markSegments, type TextRange } from "./marks";
import { rs } from "./strings";

export interface StoreReply {
  store: string;
  text: string;
  logoUrl: string | null;
}

/** The first letter of the name, preferring an Arabic one («eng. سيف» →
 *  «س»), upper-cased for Latin names («Ahmed» → «A»). */
export function monogramOf(name: string): string {
  const arabic = /\p{Script=Arabic}/u.exec(name);
  if (arabic) return arabic[0];
  const letter = /\p{L}/u.exec(name);
  return letter ? letter[0].toUpperCase() : "";
}

function ReviewBody({
  body,
  keyPhrase,
  termRanges,
  className,
}: {
  body: string;
  keyPhrase: TextRange | null;
  termRanges: readonly TextRange[];
  className: string;
}) {
  return (
    <p className={className}>
      {markSegments(body, keyPhrase, termRanges).map((seg, i) =>
        seg.key || seg.term ? (
          <mark
            key={i}
            data-key-phrase={seg.key ? "" : undefined}
            data-term={seg.term ? "" : undefined}
            className={cn("rounded-sm text-bk-ink", seg.term ? "bg-bk-primary/40" : "bg-bk-primary/25")}
          >
            {seg.text}
          </mark>
        ) : (
          <span key={i}>{seg.text}</span>
        ),
      )}
    </p>
  );
}

export function HighlightsCard({
  review,
  featured,
  locale,
  keyPhrase,
  termRanges,
  tagHit,
  reply,
  onOpenPhoto,
}: {
  review: ReviewSummaryItem;
  featured: boolean;
  locale: LocaleCode;
  keyPhrase: TextRange | null;
  /** The pressed topic's words in this body (empty when none). */
  termRanges: readonly TextRange[];
  /** The pressed topic is tag-only and this review carries the tag. */
  tagHit: boolean;
  reply: StoreReply | null;
  onOpenPhoto: (image: { url: string; alt: string }) => void;
}) {
  const rtl = readsRtl(locale);
  const name = review.author_name?.trim() || rs("anonymous", locale);
  const body = review.body?.trim() ? review.body : "";
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const clamped = !expanded && termRanges.length === 0;

  useEffect(() => {
    const p = bodyRef.current?.querySelector("p");
    if (!clamped || !p) return;
    const measure = (): void => setOverflows(p.scrollHeight > p.clientHeight + 1);
    measure();
    // A rotation, a font swap or a narrower column can change the answer.
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(p);
    return () => observer.disconnect();
  }, [clamped, body]);

  const stars = (
    <Stars
      value={review.rating}
      size={14}
      label={rs("ratingLabel", locale, { rating: review.rating })}
      className={cn("shrink-0", rtl && "flex-row-reverse")}
    />
  );
  const textSide = rtl ? "text-right" : "text-left";

  return (
    <li
      data-review-card={review.id}
      data-featured={featured ? "" : undefined}
      data-term-card={tagHit ? "" : undefined}
      className={cn(
        "relative rounded-bk-card bg-bk-surface-alt p-bk-md",
        tagHit && "ring-2 ring-inset ring-bk-primary",
        textSide,
      )}
    >
      {featured ? (
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute top-0 font-bk-display text-7xl font-black leading-none text-bk-ink/15",
            rtl ? "right-3" : "left-3",
          )}
        >
          ”
        </span>
      ) : (
        <div className={cn("mb-bk-xs flex items-center gap-bk-sm", rtl && "flex-row-reverse")}>
          <span
            aria-hidden="true"
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-bk-pill bg-bk-surface font-bk-display text-sm font-black text-bk-ink"
          >
            {monogramOf(name)}
          </span>
          <bdi className="min-w-0 flex-1 truncate font-bk-body text-sm font-bold text-bk-ink">{name}</bdi>
          {stars}
        </div>
      )}

      {review.title && (
        <h3 className="mb-1 font-bk-display text-sm font-bold text-bk-ink">{review.title}</h3>
      )}

      {body && (
        <div ref={bodyRef} className={cn(featured && "relative pt-bk-sm")}>
          <ReviewBody
            body={body}
            keyPhrase={keyPhrase}
            termRanges={termRanges}
            className={cn(
              "text-pretty text-bk-ink",
              featured
                ? "font-bk-display text-[17px] font-bold leading-relaxed"
                : "font-bk-body text-[15px] leading-relaxed",
              clamped && (featured ? "line-clamp-5" : "line-clamp-3"),
            )}
          />
          {clamped && overflows && (
            <button
              type="button"
              data-read-more=""
              onClick={() => setExpanded(true)}
              className="mt-1 inline-flex min-h-11 items-center font-bk-body text-sm font-black text-bk-ink underline underline-offset-4"
            >
              {rs("readMoreInline", locale)}
            </button>
          )}
        </div>
      )}

      {featured && (
        <div className={cn("mt-bk-sm flex items-center gap-bk-sm", rtl && "flex-row-reverse")}>
          <span className="font-bk-body text-sm font-bold text-bk-ink-soft">
            — <bdi>{name}</bdi>
          </span>
          {stars}
        </div>
      )}

      {review.photo_urls.length > 0 && (
        <div className={cn("mt-bk-sm flex flex-wrap gap-bk-xs", rtl && "flex-row-reverse")}>
          {review.photo_urls.map((url, i) => {
            const alt = rs("reviewPhoto", locale, { n: i + 1 });
            return (
              <button
                key={`${i}-${url}`}
                type="button"
                onClick={() => onOpenPhoto({ url, alt })}
                aria-label={rs("enlargePhoto", locale)}
                className="relative h-16 w-16 overflow-hidden rounded-bk-input focus-visible:outline-none focus-visible:ring-2 ring-bk-focus ring-offset-2"
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

      {reply && (
        <div
          data-store-reply=""
          className={cn("mt-bk-sm rounded-bk-card bg-bk-surface px-3 py-2", rtl ? "mr-6" : "ml-6")}
        >
          <p
            className={cn(
              "flex items-center gap-1.5 font-bk-body text-xs font-black text-bk-ink",
              rtl && "flex-row-reverse",
            )}
          >
            {reply.logoUrl ? (
              <Image
                src={reply.logoUrl}
                alt=""
                width={20}
                height={20}
                unoptimized={!isOptimizableImageHost(reply.logoUrl)}
                className="size-5 rounded-bk-pill object-contain"
              />
            ) : (
              <MaterialIcon name="storefront" className="text-base" />
            )}
            <span>{rs("storeReply", locale, { store: reply.store })}</span>
          </p>
          <p className="mt-1 font-bk-body text-[13px] leading-relaxed text-bk-ink-soft text-pretty">
            {reply.text}
          </p>
        </div>
      )}
    </li>
  );
}
