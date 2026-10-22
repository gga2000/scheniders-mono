// Express «رحلة العطر»: the product's own note pyramid as a short vertical
// journey (first spray → heart → what stays), the merchant's occasion and
// season chips, and one plain staying-power line. Every word shown is a
// merchant-entered attribute value or its definition's label — nothing is
// derived, scored or metered. Opt-in via `scent_journey`. Arabic flips the
// visual order with classes; the document stays LTR.

import { Fragment, useId } from "react";
import { cn } from "@scheniders/shared";
import type { LocaleCode } from "@scheniders/shared";
import { MaterialIcon } from "../helpers/primitives";
import type { ScentJourney } from "./scent-journey";
import type { ExpressStringKey } from "./strings";
import { readsRtl, xs } from "./text";

/** Chrome hints for the three conventional pyramid group keys. A Map, not
 *  an object literal, so a merchant key like "constructor" finds nothing. */
const STAGE_HINT = new Map<string, ExpressStringKey>([
  ["top", "stageHintTop"],
  ["heart", "stageHintHeart"],
  ["base", "stageHintBase"],
]);

export function ScentJourneyBlock({
  journey,
  title,
  locale,
}: {
  journey: ScentJourney;
  title: string;
  locale: LocaleCode;
}) {
  const headingId = useId();
  const rtl = readsRtl(locale);
  const align = rtl ? "text-right" : "text-left";
  const sep = xs("noteSep", locale);
  const { stages, chipRows, note } = journey;

  return (
    <section
      data-layer="scent-journey"
      aria-labelledby={headingId}
      className="border-t border-bk-divider pt-bk-md"
    >
      <h2
        id={headingId}
        data-i18n-field="scent_journey.title_i18n"
        className={cn("mb-bk-sm font-bk-display text-lg font-black text-bk-ink", align)}
      >
        {title}
      </h2>
      <div className="space-y-bk-sm rounded-bk-card border-bk border-bk-divider bg-bk-surface-alt p-4">
        {stages.length > 0 && (
          <ol>
            {stages.map((s, i) => {
              const last = i === stages.length - 1;
              const hint = STAGE_HINT.get(s.key);
              return (
                <li key={s.key} data-stage={s.key} className={cn("flex gap-3", rtl && "flex-row-reverse")}>
                  <span aria-hidden="true" className="relative flex w-3 shrink-0 justify-center">
                    <span
                      className={cn(
                        "mt-1 h-3 w-3 rounded-bk-pill border-bk-bold border-bk-ink",
                        last ? "bg-bk-ink" : "bg-bk-surface",
                      )}
                    />
                    {!last && <span className="absolute bottom-0 top-5 w-px bg-bk-divider" />}
                  </span>
                  <div className={cn("min-w-0 flex-1", !last && "pb-bk-sm", align)}>
                    <p className={cn("flex flex-wrap items-baseline gap-x-2", rtl && "flex-row-reverse")}>
                      <span className="font-bk-display text-sm font-black text-bk-ink">{s.label}</span>
                      {hint && (
                        <span className="font-bk-body text-xs text-bk-ink-soft">{xs(hint, locale)}</span>
                      )}
                    </p>
                    <p className="mt-0.5 font-bk-body text-sm leading-relaxed text-bk-ink">
                      {s.notes.map((n, j) => (
                        <Fragment key={`${n}-${j}`}>
                          {j > 0 && sep}
                          <bdi>{n}</bdi>
                        </Fragment>
                      ))}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        {chipRows.length > 0 && (
          <div className={cn("space-y-bk-xs", stages.length > 0 && "border-t border-bk-divider pt-bk-sm")}>
            {chipRows.map((r) => (
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
                      className="inline-flex h-7 items-center rounded-bk-pill border-bk border-bk-divider bg-bk-surface px-2.5 font-bk-body text-xs font-bold text-bk-ink"
                    >
                      <bdi>{c}</bdi>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        {note && (
          <p
            data-staying-power=""
            className={cn(
              "flex items-start gap-2",
              rtl && "flex-row-reverse",
              align,
              (stages.length > 0 || chipRows.length > 0) && "border-t border-bk-divider pt-bk-sm",
            )}
          >
            <MaterialIcon name="schedule" className="mt-0.5 shrink-0 text-base text-bk-ink" />
            <span className="min-w-0 font-bk-body text-sm text-bk-ink">
              <span className="sr-only">{note.label}: </span>
              <bdi>{note.text}</bdi>
            </span>
          </p>
        )}
      </div>
    </section>
  );
}
