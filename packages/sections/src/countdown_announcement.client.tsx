// =====================================================================
// Section — countdown_announcement
// =====================================================================
// Slim dark countdown bar for the promo_bar slot: flame glyph + short
// label + ticking HH:MM:SS digits in small rounded boxes with tiny unit
// labels beneath. Three modes:
//   - "daily_reset"       — evergreen; counts down to the next LOCAL
//     midnight and restarts every day (never expires).
//   - "fixed_end"         — counts down to an explicit ISO datetime,
//     clamping at 00:00:00 once it passes.
//   - "evergreen_minutes" — loops on a fixed wall-clock cycle.
// Hydration-safe: the server and the first client render both show
// "--" placeholders; the real clock only starts ticking after mount, so
// SSR and hydration always agree regardless of server/client timezone
// skew — and nobody sees a fake "00:00:00" before the first tick.
// =====================================================================
// Client half of `countdown_announcement` — the component (hooks / browser APIs). The
// schema, defaults and registry entry live in `./countdown_announcement.tsx` so the
// definition is server-safe; only this module ships to the browser.
// =====================================================================

"use client";

import { useEffect, useState } from "react";
import { z } from "zod";
import { resolveI18n } from "@scheniders/shared";
import type { SectionRenderContext } from "./_types";
import type { barBg, Props } from "./countdown_announcement";

/** Band colour + its contrast text read the brand-kit tokens so the bar
 *  stays on-palette (no hardcoded white). */
const BAR: Record<z.infer<typeof barBg>, { bg: string; fg: string }> = {
  secondary: {
    bg: "var(--bk-secondary, #3e3129)",
    fg: "var(--bk-on-secondary, #ffffff)",
  },
  ink: {
    bg: "var(--bk-ink, #1a1a1a)",
    fg: "var(--bk-surface, #ffffff)",
  },
};

interface Tick {
  hours: number;
  minutes: number;
  seconds: number;
}

/**
 * Milliseconds until the countdown target.
 * daily_reset targets the next local midnight (evergreen); fixed_end
 * targets the ISO datetime, clamped at zero once it passes;
 * evergreen_minutes loops on a fixed wall-clock cycle of
 * `duration_minutes` (epoch-aligned, so every visitor sees the same
 * remaining time and it never sits at zero). A fixed_end bar without a
 * usable `ends_at` degrades to the daily reset so the bar never renders
 * a frozen garbage value.
 */
function remainingMs(
  mode: Props["mode"],
  endsAt: string | undefined,
  durationMinutes: number | undefined,
  now: Date,
): number {
  if (mode === "fixed_end" && endsAt) {
    const target = new Date(endsAt).getTime();
    if (!Number.isNaN(target)) return Math.max(0, target - now.getTime());
  }
  if (mode === "evergreen_minutes") {
    const cycle = (durationMinutes ?? 150) * 60 * 1000;
    return cycle - (now.getTime() % cycle);
  }
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  return Math.max(0, midnight.getTime() - now.getTime());
}

function compute(
  mode: Props["mode"],
  endsAt: string | undefined,
  durationMinutes: number | undefined,
  now: Date,
): Tick {
  const ms = remainingMs(mode, endsAt, durationMinutes, now);
  return {
    hours: Math.floor(ms / (1000 * 60 * 60)),
    minutes: Math.floor(ms / (1000 * 60)) % 60,
    seconds: Math.floor(ms / 1000) % 60,
  };
}

/** Small flame glyph (Material "local_fire_department" path, inline). */
function FlameIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M13.5.67s.74 2.65.74 4.8c0 2.06-1.35 3.73-3.41 3.73-2.07 0-3.63-1.67-3.63-3.73l.03-.36C5.21 7.51 4 10.62 4 14c0 4.42 3.58 8 8 8s8-3.58 8-8C20 8.61 17.41 3.8 13.5.67zM11.71 19c-1.78 0-3.22-1.4-3.22-3.14 0-1.62 1.05-2.76 2.81-3.12 1.77-.36 3.6-1.21 4.62-2.58.39 1.29.59 2.65.59 4.04 0 2.65-2.15 4.8-4.8 4.8z" />
    </svg>
  );
}

/** SSR / pre-mount placeholder for a digit pair. */
const PLACEHOLDER = "--";

export function CountdownAnnouncement({
  props,
  ctx,
}: {
  props: Props;
  ctx: SectionRenderContext;
}) {
  const locale = ctx.runtime.locale;
  const t = locale !== "en";
  const label = resolveI18n(props.label_i18n, locale);

  // `null` until mounted: the server and the hydrating client both render
  // "--" so the digits never mismatch; the interval fills real values.
  // "evergreen_minutes" is a clock that restarts for every visitor — a
  // deadline nobody set, which the audit called fake scarcity. The enum
  // value stays (a stored config must keep parsing, or the whole bar is
  // silently dropped), but it no longer draws a clock: the announcement
  // renders as a plain bar. A real deadline is "fixed_end" with a date.
  const honest = props.mode !== "evergreen_minutes";

  const [tick, setTick] = useState<Tick | null>(null);
  useEffect(() => {
    if (!honest) return;
    const update = () =>
      setTick(
        compute(props.mode, props.ends_at, props.duration_minutes, new Date()),
      );
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [honest, props.mode, props.ends_at, props.duration_minutes]);

  // The document is LTR in every locale (platform invariant), so the row
  // must read hours → minutes → seconds left to right.
  const units: { value: number | null; label: string }[] = [
    { value: tick?.hours ?? null, label: t ? "ساعات" : "Hours" },
    { value: tick?.minutes ?? null, label: t ? "دقائق" : "Mins" },
    { value: tick?.seconds ?? null, label: t ? "ثواني" : "Secs" },
  ];
  const band = BAR[props.bg];

  return (
    <div
      className="relative z-30 py-1.5"
      style={{ backgroundColor: band.bg, color: band.fg }}
      role="region"
      aria-label={t ? "إعلان" : "Announcement"}
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-2 gap-y-1 px-4">
        {props.show_flame && <FlameIcon className="shrink-0" />}
        {label && (
          <span
            data-i18n-field="label_i18n"
            className="font-label font-bold text-xs sm:text-sm"
          >
            {label}
          </span>
        )}
        {/* A ticking clock must not be announced every second. */}
        {honest && (
        <span className="inline-flex items-start gap-1.5" aria-live="off">
          {units.map((u, i) => (
            <span key={u.label} className="inline-flex items-start gap-1.5">
              {i > 0 && (
                <span
                  aria-hidden="true"
                  className="pt-0.5 font-bold text-xs sm:text-sm opacity-70"
                >
                  :
                </span>
              )}
              <span className="flex flex-col items-center">
                <span
                  className="min-w-[2rem] rounded-bk-input px-1 py-0.5 text-center font-bold text-xs sm:text-sm leading-tight tabular-nums"
                  style={{
                    backgroundColor:
                      "color-mix(in srgb, var(--bk-surface, #ffffff) 14%, transparent)",
                  }}
                >
                  {u.value === null
                    ? PLACEHOLDER
                    : String(u.value).padStart(2, "0")}
                </span>
                <span className="mt-0.5 text-[11px] font-semibold leading-none opacity-70">
                  {u.label}
                </span>
              </span>
            </span>
          ))}
        </span>
        )}
      </div>
    </div>
  );
}
