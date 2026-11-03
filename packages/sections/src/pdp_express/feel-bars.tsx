// =====================================================================
// Feel scale — the «شلون تحسّه» panel inside the «بصمة العطر» card
// =====================================================================
// Drawn like a perfume tasting card: one line per configured range
// attribute, the merchant's two words at the ends («منعش … دافي») and five
// stops on a hairline between them. The stop where the product sits is a
// large brand-colour dot; the word it leans to is set in full ink. Under
// the lines, «بالمختصر» names every end the product leans to, so the panel
// reads in one glance. No number is drawn; each line's spoken label
// carries it for screen readers.
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

export function FeelBars({ bars, locale }: { bars: ScentFeelBar[]; locale: LocaleCode }) {
  if (bars.length === 0) return null;
  const rtl = readsRtl(locale);
  const word = (on: boolean, end: boolean) =>
    cn(
      "w-14 shrink-0 font-bk-body text-sm",
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
              className={cn("flex items-center gap-2.5 py-3", rtl && "flex-row-reverse")}
            >
              <span aria-hidden="true" className={word(b.lean === "low", false)}>
                {b.low}
              </span>
              <span
                aria-hidden="true"
                className={cn("relative flex h-7 flex-1 items-center justify-between", rtl && "flex-row-reverse")}
              >
                <span className="absolute inset-x-1 top-1/2 h-px -translate-y-1/2 bg-bk-divider" />
                {Array.from({ length: STOPS }, (_, i) =>
                  i === stop ? (
                    <span
                      key={i}
                      data-feel-dot=""
                      className="bk-feel-dot relative size-[26px] rounded-full bg-bk-primary shadow-md ring-2 ring-bk-ink"
                    />
                  ) : (
                    <span
                      key={i}
                      className="relative size-[9px] rounded-full bg-bk-surface ring-[1.5px] ring-inset ring-bk-ink-faint"
                    />
                  ),
                )}
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
            "border-t border-bk-divider pt-3 font-bk-body text-[13px] text-bk-ink-soft",
            rtl ? "text-right" : "text-left",
          )}
        >
          {xs("feelSummary", locale)} <span className="font-bold text-bk-ink">{leans.join(xs("feelJoin", locale))}</span>
        </p>
      )}
    </div>
  );
}
