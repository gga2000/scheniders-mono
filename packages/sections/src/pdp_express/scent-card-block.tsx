"use client";

// =====================================================================
// Express «بصمة العطر» card (F07, spec §1.4) — `scent_layout: "card"`
// =====================================================================
// One light card under the promise band, in place of «عن العطر», «رحلة
// العطر» and the note cards:
//   1. eyebrow + who it is for;
//   2. the lead line;
//   3. the always-open pyramid: per tier, the stage and its hint at the
//      reading edge, then the notes as 60px round photos with names (a
//      note without a photo is a text chip);
//   4. facts, only with data: meters (a fractional value fills its last
//      segment partly) with their source tag, the chip rows, the
//      staying-power line. The season is a tag beside the gender tag;
//   past the first tier the pyramid folds behind one button;
//   5. «الثبات، بكلام زبون»: one verbatim clause, the reviewer in <bdi>;
//   6. the rating and «قصة العطر», which opens the story in a BottomSheet.
// The data comes from `buildScentCard`; this file only draws it. Rows flip
// with classes, never `dir`. Yellow is not used here (D4): stars are the
// amber accent, meters and the monogram are ink/espresso.
// =====================================================================

import { useId, useState } from "react";
import Image from "next/image";
import { cn } from "@scheniders/shared";
import type { LocaleCode } from "@scheniders/shared";
import { BottomSheet } from "../helpers/bottom-sheet";
import { displayRating } from "../helpers/format";
import { isOptimizableImageHost } from "../helpers/image";
import { MaterialIcon, Stars } from "../helpers/primitives";
import type { Product } from "../types";
import { GENDER_ICON, Tag, reviewCountLabel } from "./identity-label";
import { monogramOf, type ScentCardData } from "./scent-card";
import { readsRtl, xs } from "./text";

export function ScentCardBlock({
  card,
  product,
  locale,
  reviewCount,
  avgRating,
  ratingLink,
}: {
  card: ScentCardData;
  product: Product;
  locale: LocaleCode;
  reviewCount: number;
  avgRating: number;
  /** The rating links to `#reviews-summary` — set only where that summary
   *  exists (identity_rating "summary_link", slice 1e); else plain text. */
  ratingLink: boolean;
}) {
  const headingId = useId();
  const restId = useId();
  const [allNotes, setAllNotes] = useState(false);
  const rtl = readsRtl(locale);
  const align = rtl ? "text-right" : "text-left";
  const gender = product.gender;
  // Past the first tier, the pyramid folds behind one button on the
  // phone-length card; every note stays in the HTML.
  const folds = card.tiers.length > 1;
  const hasFacts = card.meters.length > 0 || card.chipRows.length > 0 || card.note !== null;
  const hasStory = card.story.length > 0 || card.storyCards.length > 0;
  const shown = displayRating(avgRating).toFixed(1);
  const rating = reviewCount > 0;

  const ratingInner = (
    <>
      <Stars value={1} max={1} size={14} label={`${shown} / 5`} />
      <bdi className="font-black tabular-nums text-bk-ink">{shown}</bdi>
      <span aria-hidden="true">·</span>
      <span>{reviewCountLabel(reviewCount, locale)}</span>
    </>
  );
  const ratingCls = cn(
    "inline-flex min-h-11 items-center gap-1.5 font-bk-body text-sm font-bold text-bk-ink-soft",
    rtl && "flex-row-reverse",
  );

  return (
    <section
      data-scent-card=""
      aria-labelledby={headingId}
      className="space-y-bk-sm rounded-bk-card bg-bk-surface-alt p-4"
    >
      <div className={cn("flex items-center justify-between gap-2", rtl && "flex-row-reverse")}>
        <h2 id={headingId} className="font-bk-body text-xs font-black text-bk-ink-soft">
          {xs("scentEyebrow", locale)}
        </h2>
        {(gender || card.season) && (
          <div className={cn("flex flex-wrap items-center gap-1.5", rtl && "flex-row-reverse")}>
            {card.season && (
              <Tag data-tag="season" className={cn(rtl && "flex-row-reverse")}>
                <MaterialIcon name={card.season.icon} className="text-sm" />
                <span className="sr-only">{card.season.label}: </span>
                {card.season.value}
              </Tag>
            )}
            {gender && (
              <Tag className={cn(rtl && "flex-row-reverse")}>
                <MaterialIcon name={GENDER_ICON[gender]} className="text-sm" />
                {xs(gender, locale)}
              </Tag>
            )}
          </div>
        )}
      </div>

      {card.lead && (
        <p
          data-scent-lead=""
          className={cn("font-bk-display text-[17px] font-extrabold leading-snug text-bk-ink text-balance", align)}
        >
          {card.lead}
        </p>
      )}

      {card.tiers.length > 0 && (
        <div>
          <ol aria-label={xs("notesListLabel", locale)} className="divide-y divide-bk-divider">
            {card.tiers.map((t, ti) => (
              <li
                key={t.key}
                id={ti > 0 ? `${restId}-${ti}` : undefined}
                data-stage={t.key}
                hidden={folds && !allNotes && ti > 0}
                className={cn(
                  "flex items-center gap-3 py-3",
                  rtl && "flex-row-reverse",
                  // `flex` would beat the [hidden] rule; `hidden` sorts after it.
                  folds && !allNotes && ti > 0 && "hidden",
                )}
              >
                <p className={cn("w-20 shrink-0", align)}>
                  <span className="block font-bk-display text-sm font-black text-bk-ink">{t.label}</span>
                  {t.hint && (
                    <span className="block font-bk-body text-xs font-semibold text-bk-ink-soft">{t.hint}</span>
                  )}
                </p>
                <ul className={cn("flex min-w-0 flex-1 flex-wrap items-start gap-3", rtl && "flex-row-reverse")}>
                  {t.notes.map((n, i) =>
                    n.image ? (
                      <li
                        key={`${n.name}-${i}`}
                        data-note-photo=""
                        className="flex w-[4.5rem] flex-col items-center gap-1 text-center"
                      >
                        <Image
                          src={n.image}
                          alt=""
                          width={60}
                          height={60}
                          unoptimized={!isOptimizableImageHost(n.image)}
                          className="h-[60px] w-[60px] rounded-bk-pill object-cover"
                        />
                        <span className="font-bk-body text-xs font-bold leading-tight text-bk-ink">{n.name}</span>
                      </li>
                    ) : (
                      <li
                        key={`${n.name}-${i}`}
                        data-note-chip=""
                        className="inline-flex h-7 items-center rounded-bk-pill bg-bk-surface px-2.5 font-bk-body text-xs font-bold text-bk-ink"
                      >
                        <bdi>{n.name}</bdi>
                      </li>
                    ),
                  )}
                </ul>
              </li>
            ))}
          </ol>
          {folds && (
            <button
              type="button"
              data-notes-fold=""
              aria-expanded={allNotes}
              aria-controls={card.tiers.slice(1).map((_, i) => `${restId}-${i + 1}`).join(" ")}
              onClick={() => setAllNotes((o) => !o)}
              className={cn(
                "flex min-h-11 w-full items-center justify-center gap-1 border-t border-bk-divider font-bk-body text-sm font-black text-bk-ink",
                rtl && "flex-row-reverse",
              )}
            >
              <span>{xs(allNotes ? "notesLess" : "notesMore", locale)}</span>
              <MaterialIcon name={allNotes ? "expand_less" : "expand_more"} className="text-lg" />
            </button>
          )}
        </div>
      )}

      {hasFacts && (
        <div data-scent-facts="" className="space-y-bk-xs rounded-bk-card bg-bk-surface p-3">
          {card.meters.map((m) => (
            <div key={m.key} data-meter={m.key} className={cn("flex items-center gap-2", rtl && "flex-row-reverse")}>
              <span className={cn("w-20 shrink-0 font-bk-body text-xs font-bold text-bk-ink-soft", align)}>
                {m.label}
              </span>
              {m.segments > 0 && (
                <span aria-hidden="true" className={cn("flex flex-1 gap-1", rtl && "flex-row-reverse")}>
                  {m.fills.map((f, i) => (
                    <span key={i} className="relative h-2 flex-1 overflow-hidden rounded-bk-pill bg-bk-divider">
                      {f > 0 && (
                        <span
                          data-fill={f}
                          className={cn("absolute inset-y-0 bg-bk-ink", rtl ? "right-0" : "left-0")}
                          style={{ width: `${f * 100}%` }}
                        />
                      )}
                    </span>
                  ))}
                </span>
              )}
              <span className="shrink-0 font-bk-body text-xs font-bold tabular-nums text-bk-ink">
                <bdi>{xs("meterValue", locale, { value: m.value, max: m.max })}</bdi>
              </span>
            </div>
          ))}
          {card.factsSource && (
            <p data-facts-source="" className={cn("font-bk-body text-sm font-semibold text-bk-ink-soft", align)}>
              {card.factsSource}
            </p>
          )}
          {card.chipRows.map((r) => (
            <div
              key={r.key}
              data-chip-row={r.key}
              className={cn("flex flex-wrap items-center gap-1.5", rtl && "flex-row-reverse")}
            >
              <span className="font-bk-body text-xs font-bold text-bk-ink-soft">{r.label}</span>
              <ul aria-label={r.label} className={cn("flex flex-wrap gap-1.5", rtl && "flex-row-reverse")}>
                {r.chips.map((c, j) => (
                  <li
                    key={`${c}-${j}`}
                    className="inline-flex h-7 items-center rounded-bk-pill bg-bk-surface-alt px-2.5 font-bk-body text-xs font-bold text-bk-ink"
                  >
                    <bdi>{c}</bdi>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {card.note && (
            <p data-staying-power="" className={cn("font-bk-body text-sm font-bold text-bk-ink", align)}>
              <span className="sr-only">{card.note.label}: </span>
              <bdi>{card.note.text}</bdi>
            </p>
          )}
        </div>
      )}

      {card.quote && (
        <div data-scent-quote="">
          <p className={cn("font-bk-body text-xs font-bold text-bk-ink-soft", align)}>
            {xs("stayInCustomerWords", locale)}
          </p>
          <figure className={cn("mt-1.5 flex items-start gap-2.5", rtl && "flex-row-reverse")}>
            <span
              aria-hidden="true"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-bk-pill bg-bk-secondary font-bk-display text-[13px] font-black text-bk-on-secondary"
            >
              {monogramOf(card.quote.author)}
            </span>
            <div className={cn("min-w-0 flex-1 rounded-bk-card bg-bk-surface px-3 py-2.5", align)}>
              <blockquote className="font-bk-body text-sm font-bold leading-relaxed text-bk-ink">
                <p>«{card.quote.text}»</p>
              </blockquote>
              <figcaption
                className={cn(
                  "mt-1 flex items-center gap-1.5 font-bk-body text-xs font-bold text-bk-ink-soft",
                  rtl && "flex-row-reverse",
                )}
              >
                <bdi>{card.quote.author}</bdi>
                <Stars value={card.quote.rating} size={12} label={`${card.quote.rating} / 5`} />
              </figcaption>
            </div>
          </figure>
        </div>
      )}

      {(rating || hasStory) && (
        <div
          className={cn(
            "flex items-center justify-between gap-3 border-t border-bk-divider pt-1",
            rtl && "flex-row-reverse",
          )}
        >
          {rating ? (
            ratingLink ? (
              <a href="#reviews-summary" data-scent-rating="link" className={ratingCls}>
                {ratingInner}
              </a>
            ) : (
              <p data-scent-rating="text" className={ratingCls}>
                {ratingInner}
              </p>
            )
          ) : (
            <span />
          )}
          {hasStory && (
            <BottomSheet
              trigger={
                <>
                  <span>{xs("scentStory", locale)}</span>
                  <MaterialIcon name={rtl ? "chevron_left" : "chevron_right"} className="text-lg" />
                </>
              }
              triggerClassName={cn(
                "inline-flex min-h-11 items-center gap-1 font-bk-body text-sm font-black text-bk-ink",
                rtl && "flex-row-reverse",
              )}
              title={xs("scentStory", locale)}
              closeLabel={xs("closeSheet", locale)}
              locale={locale}
            >
              <div data-scent-story="" className="space-y-bk-sm">
                {card.story.map((p, i) => (
                  <p
                    key={i}
                    className={cn(
                      "whitespace-pre-line font-bk-body text-sm leading-relaxed text-bk-ink [unicode-bidi:plaintext]",
                      align,
                    )}
                  >
                    {p}
                  </p>
                ))}
                {card.storyCards.length > 0 && (
                  <ul aria-label={xs("notesListLabel", locale)} className="space-y-bk-sm">
                    {card.storyCards.map((c, i) => (
                      <li key={`${c.title}-${i}`} className={cn("flex items-start gap-3", rtl && "flex-row-reverse")}>
                        {c.image && (
                          <Image
                            src={c.image}
                            alt=""
                            width={56}
                            height={56}
                            unoptimized={!isOptimizableImageHost(c.image)}
                            className="h-14 w-14 shrink-0 rounded-bk-input object-cover"
                          />
                        )}
                        <div className={cn("min-w-0", align)}>
                          <p className="font-bk-body text-sm font-bold text-bk-ink">{c.title}</p>
                          <p className="font-bk-body text-xs leading-relaxed text-bk-ink-soft">{c.body}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </BottomSheet>
          )}
        </div>
      )}
    </section>
  );
}
