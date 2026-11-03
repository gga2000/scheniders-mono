// =====================================================================
// Feel scale — the «شلون تحسّه» panel inside the «بصمة العطر» card
// =====================================================================
// Drawn like a perfume tasting card: one line per configured range
// attribute, the merchant's two words at the ends («منعش … دافي») and five
// stops on a hairline between them. The stop where the product sits is a
// large brand-colour dot with a soft halo; the line is inked from the low
// word up to it, and the word it leans to is set in full ink. Under the
// lines, «بالمختصر» names every end the product leans to as small chips,
// so the panel reads in one glance. No number is drawn; each line's spoken
// label carries it for screen readers.
//
// Motion: where the browser supports scroll-driven animations, each chosen
// dot grows in as its line scrolls into view, with no script. Elsewhere,
// and under reduced motion, it simply sits there. Rows flip with classes,
// never `dir`.
// =====================================================================

import { cn } from "@scheniders/shared";
import type { LocaleCode } from "@scheniders/shared";
import type { ScentFeelBar } from "./scent-card";
import { readsRtl, xs } from "./text";

const CSS = `
@keyframes bk-feel-in { from { transform: scale(0.35); opacity: 0.4; } }
@media (prefers-reduced-motion: no-preference) {
  @supports (animation-timeline: view()) {
    .bk-feel-dot {
      animation: bk-feel-in linear both;
      animation-timeline: view();
      animation-range: entry 10% cover 35%;
    }
  }
}
`;

/** Five stops: enough to place a perfume, few enough to read at a glance. */
const STOPS = 5;

/** The stop (0-4, from the low end) a bar's position falls on. */
export function feelStop(at: number): number {
  return Math.min(STOPS - 1, Math.max(0, Math.round(at * (STOPS - 1))));
}

/** Where stop `i` sits along the line: stop centres span the line minus
 *  0.5rem at each end, so the end stops never touch the words. */
function stopAt(i: number): string {
  return `calc(0.5rem + ${i / (STOPS - 1)} * (100% - 1rem))`;
}

export function FeelBars({ bars, locale }: { bars: ScentFeelBar[]; locale: LocaleCode }) {
  if (bars.length === 0) return null;
  const rtl = readsRtl(locale);
  // Stops run from the low word's side: the right in Arabic and Kurdish.
  const side = rtl ? "right" : "left";
  const centre = rtl ? "translate(50%, -50%)" : "translate(-50%, -50%)";
  const word = (on: boolean, end: boolean) =>
    cn(
      "w-[52px] shrink-0 font-bk-body text-sm",
      on ? "font-bold text-bk-ink" : "font-semibold text-bk-ink-faint",
      end ? (rtl ? "text-left" : "text-right") : rtl ? "text-right" : "text-left",
    );
  const leans = bars.flatMap((b) => (b.lean === "low" ? [b.low] : b.lean === "high" ? [b.high] : []));

  return (
    <div data-feel-bars="" className="rounded-bk-card border-bk border-bk-divider bg-bk-surface px-4 pb-4 pt-4">
      <style href="bk-pdp-feel-bars" precedence="bk-sections">
        {CSS}
      </style>
      <h3 className={cn("font-bk-display text-[15px] font-bold text-bk-ink", rtl ? "text-right" : "text-left")}>
        {xs("feelTitle", locale)}
      </h3>
      <ul className="mt-2 divide-y divide-bk-divider">
        {bars.map((b) => {
          const stop = feelStop(b.at);
          return (
            <li
              key={b.key}
              data-feel-bar={b.key}
              data-lean={b.lean}
              data-stop={stop}
              role="img"
              aria-label={xs("feelBarLabel", locale, { low: b.low, high: b.high, value: b.value, max: b.max })}
              className={cn("flex items-center gap-3 py-3.5", rtl && "flex-row-reverse")}
            >
              <span aria-hidden="true" className={word(b.lean === "low", false)}>
                {b.low}
              </span>
              <span aria-hidden="true" className="relative h-7 flex-1">
                <span className="absolute inset-x-2 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-bk-divider" />
                {stop > 0 && (
                  <span
                    data-feel-fill=""
                    className="absolute top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-bk-ink"
                    style={{ [side]: "0.5rem", width: `calc(${stop / (STOPS - 1)} * (100% - 1rem))` }}
                  />
                )}
                {Array.from({ length: STOPS }, (_, i) => (
                  <span key={i} className="absolute top-1/2" style={{ [side]: stopAt(i), transform: centre }}>
                    {i === stop ? (
                      <span data-feel-dot="" className="bk-feel-dot relative block size-6">
                        <span className="absolute -inset-[7px] rounded-full bg-bk-primary/30" />
                        <span className="relative flex size-6 items-center justify-center rounded-full bg-bk-primary shadow-md ring-2 ring-bk-ink">
                          <span className="size-2.5 rounded-full bg-bk-ink" />
                        </span>
                      </span>
                    ) : (
                      <span
                        className={cn(
                          "block size-2 rounded-full",
                          i < stop ? "bg-bk-ink" : "bg-bk-surface ring-[1.5px] ring-inset ring-bk-ink-faint",
                        )}
                      />
                    )}
                  </span>
                ))}
              </span>
              <span aria-hidden="true" className={word(b.lean === "high", true)}>
                {b.high}
              </span>
            </li>
          );
        })}
      </ul>
      {leans.length > 0 && (
        <p
          data-feel-summary=""
          className={cn(
            "mt-1 flex flex-wrap items-center gap-2 border-t border-dashed border-bk-divider pt-3.5",
            rtl && "flex-row-reverse",
          )}
        >
          <span className="font-bk-body text-xs font-semibold text-bk-ink-soft">{xs("feelSummary", locale)}</span>
          {leans.map((w) => (
            <span
              key={w}
              data-feel-chip=""
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-bk-pill bg-bk-surface-alt px-3 font-bk-body text-[13px] font-bold text-bk-ink",
                rtl && "flex-row-reverse",
              )}
            >
              <span aria-hidden="true" className="size-1.5 rounded-full bg-bk-primary ring-1 ring-bk-ink/40" />
              {w}
            </span>
          ))}
        </p>
      )}
    </div>
  );
}
