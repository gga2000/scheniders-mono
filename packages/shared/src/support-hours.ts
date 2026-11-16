// =====================================================================
// Merchant support hours: what we promise and when the clock runs
// =====================================================================
// Ali, 2026-11-16: every day 9 AM to 12 AM Baghdad time, first reply
// within 5 minutes. Iraq has no daylight saving (UTC+3 all year), so the
// hours are plain wall clock. The database runs the same rule in
// public.support_clock_start() for the late alert and the scoreboard.
// =====================================================================

/** Support opens at this Baghdad hour and stays open until midnight. */
export const SUPPORT_OPEN_HOUR = 9;
/** The first reply we promise, in minutes of support hours. */
export const SUPPORT_REPLY_MINUTES = 5;

const BAGHDAD_OFFSET_MS = 3 * 3_600_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/** Milliseconds since Baghdad midnight for a moment. */
function baghdadTimeOfDay(atMs: number): number {
  return (((atMs + BAGHDAD_OFFSET_MS) % DAY_MS) + DAY_MS) % DAY_MS;
}

/** True between 9 AM and midnight, Baghdad time. */
export function isSupportOpen(atMs: number): boolean {
  return baghdadTimeOfDay(atMs) >= SUPPORT_OPEN_HOUR * HOUR_MS;
}

/**
 * When the reply clock starts for a message sent at `atMs`: right away inside
 * support hours, 9 AM the same Baghdad day for a message sent at night.
 */
export function supportClockStart(atMs: number): number {
  const sinceMidnight = baghdadTimeOfDay(atMs);
  const opens = SUPPORT_OPEN_HOUR * HOUR_MS;
  return sinceMidnight >= opens ? atMs : atMs - sinceMidnight + opens;
}

/** Minutes of support hours a merchant has waited, never below 0. */
export function supportWaitMinutes(sinceMs: number, nowMs: number): number {
  return Math.max(0, Math.floor((nowMs - supportClockStart(sinceMs)) / 60_000));
}
