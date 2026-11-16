// =====================================================================
// Countdown maths — shared by countdown_announcement (the promo bar) and
// the pdp_direct_order express offer clock, so both clocks always agree
// on the same second. Server-safe: no hooks, no browser APIs.
//
// A clock is a promise to the shopper that an offer ends at that moment.
// So a clock draws only for a deadline that is real:
//   - "fixed_end" with a date the merchant set: counts to it, then stops.
//   - "daily_reset" never draws: midnight is not the end of any offer, and
//     the same "ends today" would come back tomorrow.
//   - "evergreen_minutes" loops on a fixed wall-clock cycle. It draws only
//     where the caller says a store kept one it saved before (`keepLoop`);
//     no editor offers it for a new choice and the database refuses a new
//     one (refuse_new_restarting_clocks).
// The restarting modes stay in the enum so a stored config keeps parsing:
// a parse failure would silently drop the whole section.
// =====================================================================

/** daily_reset — counted to the next local midnight (retired, never draws).
 *  fixed_end — counts to an explicit ISO datetime.
 *  evergreen_minutes — loops on a fixed, epoch-aligned wall-clock cycle
 *  (retired: draws only where a store kept one). */
export const COUNTDOWN_MODES = ["daily_reset", "fixed_end", "evergreen_minutes"] as const;
export type CountdownMode = (typeof COUNTDOWN_MODES)[number];

/** Modes whose clock restarts on its own: a deadline nobody set. The store
 *  editor hides them unless a section already holds one; the same list is
 *  what the database guard counts. */
export const RESTARTING_COUNTDOWN_MODES: readonly CountdownMode[] = ["daily_reset", "evergreen_minutes"];

export interface CountdownTick {
  hours: number;
  minutes: number;
  seconds: number;
}

/** Loop length used when an evergreen clock carries no duration. */
export const DEFAULT_EVERGREEN_MINUTES = 150;

/** The merchant's end time in ms, or null when there is no usable date. */
function fixedEndMs(endsAt: string | undefined): number | null {
  if (!endsAt) return null;
  const target = new Date(endsAt).getTime();
  return Number.isNaN(target) ? null : target;
}

/**
 * Whether this clock may draw at all, before any time passes: a fixed end
 * with a usable date, or a loop the caller keeps. Server-safe, so the
 * server and the first client render agree on whether the clock exists.
 */
export function countdownDraws(
  mode: CountdownMode,
  endsAt: string | undefined,
  keepLoop: boolean,
): boolean {
  if (mode === "fixed_end") return fixedEndMs(endsAt) !== null;
  if (mode === "evergreen_minutes") return keepLoop;
  return false;
}

/**
 * Milliseconds left, or null when the clock must not draw (see the header).
 * A fixed end that has passed returns 0: the offer is over, and the caller
 * hides the clock rather than freeze it at 00:00:00.
 */
export function countdownRemainingMs(
  mode: CountdownMode,
  endsAt: string | undefined,
  durationMinutes: number | undefined,
  now: Date,
  keepLoop: boolean,
): number | null {
  if (!countdownDraws(mode, endsAt, keepLoop)) return null;
  if (mode === "evergreen_minutes") {
    const cycle = (durationMinutes ?? DEFAULT_EVERGREEN_MINUTES) * 60 * 1000;
    return cycle - (now.getTime() % cycle);
  }
  const target = fixedEndMs(endsAt);
  return target === null ? null : Math.max(0, target - now.getTime());
}

/** The cycle a loop drains over, in ms — what "100% remaining" means for
 *  a progress hairline. null for a fixed end (no repeating cycle). */
export function countdownCycleMs(
  mode: CountdownMode,
  durationMinutes: number | undefined,
): number | null {
  if (mode === "evergreen_minutes") {
    return (durationMinutes ?? DEFAULT_EVERGREEN_MINUTES) * 60 * 1000;
  }
  return null;
}

export function splitCountdown(ms: number): CountdownTick {
  return {
    hours: Math.floor(ms / (1000 * 60 * 60)),
    minutes: Math.floor(ms / (1000 * 60)) % 60,
    seconds: Math.floor(ms / 1000) % 60,
  };
}
