// =====================================================================
// Countdown maths — shared by countdown_announcement (the promo bar) and
// the pdp_direct_order express offer clock, so both clocks always agree
// on the same second. Server-safe: no hooks, no browser APIs.
// =====================================================================

import { z } from "zod";

/** daily_reset — counts to the next local midnight (evergreen).
 *  fixed_end — counts to an explicit ISO datetime, clamped at zero.
 *  evergreen_minutes — loops on a fixed, epoch-aligned wall-clock cycle. */
export const countdownModeSchema = z.enum([
  "daily_reset",
  "fixed_end",
  "evergreen_minutes",
]);
export type CountdownMode = z.infer<typeof countdownModeSchema>;

export interface CountdownTick {
  hours: number;
  minutes: number;
  seconds: number;
}

/** Loop length used when an evergreen clock carries no duration. */
export const DEFAULT_EVERGREEN_MINUTES = 150;

/**
 * Milliseconds until the countdown target.
 * daily_reset targets the next local midnight (evergreen); fixed_end
 * targets the ISO datetime, clamped at zero once it passes;
 * evergreen_minutes loops on a fixed wall-clock cycle of
 * `duration_minutes` (epoch-aligned, so every visitor sees the same
 * remaining time and it never sits at zero). A fixed_end clock without a
 * usable `ends_at` degrades to the daily reset so it never renders a
 * frozen garbage value.
 */
export function countdownRemainingMs(
  mode: CountdownMode,
  endsAt: string | undefined,
  durationMinutes: number | undefined,
  now: Date,
): number {
  if (mode === "fixed_end" && endsAt) {
    const target = new Date(endsAt).getTime();
    if (!Number.isNaN(target)) return Math.max(0, target - now.getTime());
  }
  if (mode === "evergreen_minutes") {
    const cycle = (durationMinutes ?? DEFAULT_EVERGREEN_MINUTES) * 60 * 1000;
    return cycle - (now.getTime() % cycle);
  }
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  return Math.max(0, midnight.getTime() - now.getTime());
}

/** The cycle a clock drains over, in ms — what "100% remaining" means for
 *  a progress hairline. null for fixed_end (no repeating cycle). */
export function countdownCycleMs(
  mode: CountdownMode,
  durationMinutes: number | undefined,
): number | null {
  if (mode === "evergreen_minutes") {
    return (durationMinutes ?? DEFAULT_EVERGREEN_MINUTES) * 60 * 1000;
  }
  if (mode === "daily_reset") return 24 * 60 * 60 * 1000;
  return null;
}

export function splitCountdown(ms: number): CountdownTick {
  return {
    hours: Math.floor(ms / (1000 * 60 * 60)),
    minutes: Math.floor(ms / (1000 * 60)) % 60,
    seconds: Math.floor(ms / 1000) % 60,
  };
}

export function computeCountdown(
  mode: CountdownMode,
  endsAt: string | undefined,
  durationMinutes: number | undefined,
  now: Date,
): CountdownTick {
  return splitCountdown(
    countdownRemainingMs(mode, endsAt, durationMinutes, now),
  );
}
