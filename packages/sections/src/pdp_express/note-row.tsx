"use client";

// Express note row: the per-product feature cards (products.feature_cards)
// as one compact horizontal snap row — image, note name, one line — in
// place of the tall vertical stack. A tap opens that card's whole line, one
// card at a time. Opt-in via `feature_cards_layout: "row"`. The row scrolls
// in the document's LTR direction like every other scroller on the page;
// text inside each card aligns to the reading side with classes.

import { useState } from "react";
import Image from "next/image";
import { cn } from "@scheniders/shared";
import type { LocaleCode } from "@scheniders/shared";
import { isOptimizableImageHost } from "../helpers/image";
import { MaterialIcon } from "../helpers/primitives";
import type { ExpressModel } from "./model";
import { readsRtl, xs } from "./text";

export function NoteRow({
  cards,
  title,
  locale,
}: {
  cards: ExpressModel["featureCards"];
  title: string;
  locale: LocaleCode;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const rtl = readsRtl(locale);
  const align = rtl ? "text-right" : "text-left";

  return (
    <section data-layer="note-row" className="space-y-bk-sm border-t border-bk-divider pt-bk-md">
      {title && (
        <h2
          className={cn("font-bk-display text-lg font-black text-bk-ink", align)}
          data-i18n-field="feature_cards_title_i18n"
        >
          {title}
        </h2>
      )}
      <ul
        aria-label={xs("notesListLabel", locale)}
        className="-mx-4 flex snap-x snap-mandatory items-start gap-bk-sm overflow-x-auto overscroll-x-contain scroll-px-4 px-4 pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {cards.map((c, i) => {
          const expanded = open === i;
          return (
            <li key={`${c.title}-${i}`} className="w-3/4 max-w-64 shrink-0 snap-start">
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => setOpen(expanded ? null : i)}
                className={cn(
                  "block w-full overflow-hidden rounded-bk-card border-bk border-bk-divider bg-bk-surface-alt",
                  align,
                )}
              >
                {c.image_url && (
                  <span className="relative block h-28 w-full">
                    <Image
                      src={c.image_url}
                      alt=""
                      fill
                      sizes="(min-width: 640px) 16rem, 75vw"
                      unoptimized={!isOptimizableImageHost(c.image_url)}
                      className="object-cover"
                    />
                  </span>
                )}
                <span className="block p-3">
                  <span className={cn("flex items-start justify-between gap-2", rtl && "flex-row-reverse")}>
                    <span className="min-w-0 font-bk-body text-sm font-bold text-bk-ink">{c.title}</span>
                    <MaterialIcon
                      name="expand_more"
                      className={cn(
                        "shrink-0 text-lg text-bk-ink-soft transition-transform duration-bk-fast motion-reduce:transition-none",
                        expanded && "rotate-180",
                      )}
                    />
                  </span>
                  <span
                    data-note-body=""
                    className={cn(
                      "mt-0.5 block font-bk-body text-xs leading-relaxed text-bk-ink-soft",
                      !expanded && "line-clamp-1",
                    )}
                  >
                    {c.body}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
