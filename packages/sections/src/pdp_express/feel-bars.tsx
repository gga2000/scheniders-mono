// =====================================================================
// Feel bars — the «شلون تحسّه» panel inside the «بصمة العطر» card
// =====================================================================
// One two-ended bar per configured range attribute («منعش ↔ دافي»): the
// merchant's words at the ends, a knob where the product's value sits, and
// the end it leans to set in full ink. No number is drawn; the spoken label
// carries it for screen readers.
//
// Motion: where the browser supports scroll-driven animations, each knob
// slides out from the middle to its place as the bar scrolls into view —
// no script. Elsewhere, and under reduced motion, the knob simply sits at
// rest. Rows flip with classes, never `dir`.
// =====================================================================

import { cn } from "@scheniders/shared";
import type { LocaleCode } from "@scheniders/shared";
import type { ScentFeelBar } from "./scent-card";
import { readsRtl, xs } from "./text";

/** The knob's size; the knob travels the track minus its own width. */
const KNOB = "1.5rem";

const CSS = `
@keyframes bk-feel-in-l { from { left: calc(0.5 * (100% - ${KNOB})); } }
@keyframes bk-feel-in-r { from { right: calc(0.5 * (100% - ${KNOB})); } }
@media (prefers-reduced-motion: no-preference) {
  @supports (animation-timeline: view()) {
    .bk-feel-knob {
      animation: bk-feel-in-l linear both;
      animation-timeline: view();
      animation-range: entry 20% cover 40%;
    }
    .bk-feel-knob-rtl { animation-name: bk-feel-in-r; }
  }
}
`;

/** Five stops along the track, so the knob reads as a place on a scale. */
const STOPS = [0, 1, 2, 3, 4] as const;

export function FeelBars({ bars, locale }: { bars: ScentFeelBar[]; locale: LocaleCode }) {
  if (bars.length === 0) return null;
  const rtl = readsRtl(locale);
  const end = (on: boolean) =>
    cn(
      "font-bk-body text-sm transition-colors",
      on ? "font-black text-bk-ink" : "font-semibold text-bk-ink-soft",
    );

  return (
    <div data-feel-bars="" className="space-y-4 rounded-bk-card bg-bk-surface p-4">
      <style href="bk-pdp-feel-bars" precedence="bk-sections">
        {CSS}
      </style>
      <h3 className={cn("font-bk-body text-xs font-bold text-bk-ink-soft", rtl ? "text-right" : "text-left")}>
        {xs("feelTitle", locale)}
      </h3>
      <ul className="space-y-5">
        {bars.map((b) => (
          <li
            key={b.key}
            data-feel-bar={b.key}
            data-lean={b.lean}
            role="img"
            aria-label={xs("feelBarLabel", locale, { low: b.low, high: b.high, value: b.value, max: b.max })}
            className="block"
          >
            <span aria-hidden="true" className={cn("flex items-baseline justify-between gap-3", rtl && "flex-row-reverse")}>
              <span className={end(b.lean === "low")}>{b.low}</span>
              <span className={end(b.lean === "high")}>{b.high}</span>
            </span>
            <span aria-hidden="true" className="relative mt-2 block h-6">
              <span
                className={cn(
                  "absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 rounded-bk-pill from-bk-ink/10 to-bk-ink/45",
                  rtl ? "bg-gradient-to-l" : "bg-gradient-to-r",
                )}
              />
              <span className="absolute inset-x-3 top-1/2 flex -translate-y-1/2 justify-between">
                {STOPS.map((i) => (
                  <span key={i} className="size-1 rounded-full bg-bk-surface/90" />
                ))}
              </span>
              <span
                data-feel-knob=""
                className={cn(
                  "bk-feel-knob absolute top-0 flex size-6 items-center justify-center rounded-full bg-bk-surface shadow-md ring-2 ring-bk-ink",
                  rtl && "bk-feel-knob-rtl",
                )}
                style={{ [rtl ? "right" : "left"]: `calc(${b.at} * (100% - ${KNOB}))` }}
              >
                <span className="size-2.5 rounded-full bg-bk-ink" />
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
