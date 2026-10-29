"use client";

// Express offer clock: the store-wide offer countdown as a slim espresso
// strip under the price plate. It takes no price or amount — it is the
// same clock the promo bar shows, moved beside the price, never welded to
// a specific saving.

import { memo, useEffect, useState } from "react";
import { resolveI18n } from "@scheniders/shared";
import type { LocaleCode } from "@scheniders/shared";
import {
  countdownCycleMs,
  countdownRemainingMs,
  splitCountdown,
} from "../helpers/countdown";
import type { Props } from "../pdp_direct_order";
import { readsRtl, xs } from "./text";

type OfferClockConfig = NonNullable<Props["offer_clock"]>;

const pad = (n: number) => String(n).padStart(2, "0");
// Whole class strings per state, so the unlocked markup stays
// byte-identical; `color_lock` (D4) swaps yellow for the espresso partner.
const DOT_CLS = "h-1.5 w-1.5 shrink-0 rounded-bk-pill bg-bk-primary motion-safe:animate-pulse";
const DOT_CLS_LOCKED =
  "h-1.5 w-1.5 shrink-0 rounded-bk-pill bg-bk-on-secondary/60 motion-safe:animate-pulse";
const DIGITS_CLS =
  "flex items-baseline font-bk-display text-[17px] font-black tabular-nums text-bk-primary";
const DIGITS_CLS_LOCKED =
  "flex items-baseline font-bk-display text-[17px] font-black tabular-nums text-bk-on-secondary";
const BAR_CLS =
  "absolute bottom-0 left-0 h-[2px] bg-bk-primary transition-[width] duration-1000 ease-linear motion-reduce:transition-none";
const BAR_CLS_LOCKED =
  "absolute bottom-0 left-0 h-[2px] bg-bk-on-secondary/60 transition-[width] duration-1000 ease-linear motion-reduce:transition-none";

export const OfferClock = memo(function OfferClock({
  clock,
  locale,
  colorLock = false,
}: {
  clock: OfferClockConfig;
  locale: LocaleCode;
  /** `color_lock` (D4): digits, dot and bar off yellow, in the espresso
   *  partner colour. */
  colorLock?: boolean;
}) {
  // null until mounted: server and hydrating client both render "--".
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    const update = () =>
      setRemaining(
        countdownRemainingMs(
          clock.mode,
          clock.ends_at,
          clock.duration_minutes,
          new Date(),
        ),
      );
    update();
    let id: ReturnType<typeof setInterval> | null = setInterval(update, 1000);
    // Recompute from the wall clock on return instead of ticking a hidden tab.
    const onVis = () => {
      if (document.hidden) {
        if (id !== null) clearInterval(id);
        id = null;
      } else if (id === null) {
        update();
        id = setInterval(update, 1000);
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      if (id !== null) clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [clock.mode, clock.ends_at, clock.duration_minutes]);

  const label = resolveI18n(clock.label_i18n, locale);
  // A fixed end that has passed is over — no frozen 00:00:00.
  if (clock.mode === "fixed_end" && remaining === 0) return null;

  const tick = remaining === null ? null : splitCountdown(remaining);
  const cycle = countdownCycleMs(clock.mode, clock.duration_minutes);
  const share =
    remaining !== null && cycle ? Math.min(1, remaining / cycle) : null;
  const rtl = readsRtl(locale);

  return (
    <div
      role="timer"
      aria-live="off"
      aria-label={
        tick
          ? xs("clockAria", locale, { label, h: tick.hours, m: tick.minutes })
          : label
      }
      className="relative overflow-hidden rounded-bk-input bg-bk-secondary text-bk-on-secondary"
    >
      <div
        className={`flex h-[38px] items-center justify-between gap-3 px-3 ${rtl ? "flex-row-reverse" : ""}`}
      >
        <span
          className={`flex items-center gap-1.5 font-bk-body text-[13px] font-bold ${rtl ? "flex-row-reverse" : ""}`}
          data-i18n-field="offer_clock.label_i18n"
        >
          <span
            aria-hidden="true"
            className={colorLock ? DOT_CLS_LOCKED : DOT_CLS}
          />
          {label}
        </span>
        {/* Hours → minutes → seconds read left to right in every locale. */}
        <span
          aria-hidden="true"
          className={colorLock ? DIGITS_CLS_LOCKED : DIGITS_CLS}
        >
          <span>{tick ? pad(tick.hours) : "--"}</span>
          <span className="px-0.5 opacity-60">:</span>
          <span>{tick ? pad(tick.minutes) : "--"}</span>
          <span className="px-0.5 opacity-60">:</span>
          <span
            key={tick?.seconds ?? "ph"}
            className="inline-block motion-safe:animate-[bk-tick_var(--bk-duration-base)_ease-out]"
          >
            {tick ? pad(tick.seconds) : "--"}
          </span>
        </span>
      </div>
      {share !== null && (
        // Real elapsed time: the hairline is the share of the cycle left,
        // and its 1s linear transition mirrors the 1s tick (a real-time
        // value, not a design duration).
        <span
          aria-hidden="true"
          className={colorLock ? BAR_CLS_LOCKED : BAR_CLS}
          style={{ width: `${share * 100}%` }}
        />
      )}
    </div>
  );
});
