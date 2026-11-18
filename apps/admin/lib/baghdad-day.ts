/*
 * Days on the Baghdad calendar (UTC+3 all year, no summer time). Staff and
 * shops live on this calendar, so "today", "ends tomorrow" and a date filter
 * are counted here, never on the server's UTC clock. No imports: client
 * components use it too.
 */

const baghdadDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Baghdad", year: "numeric", month: "2-digit", day: "2-digit" });
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

/** The day `n` days after `day` (before, when negative). */
export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** The Baghdad day an instant falls in, as '2026-11-16'. 01:00 in Baghdad is still the day before in UTC. */
export function dayOf(instant: string | Date | number): string {
  return baghdadDay.format(new Date(instant));
}

const WALL_TIME = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/;

/**
 * A time typed in a date-and-time box ('2026-11-18T14:30') read as Baghdad
 * time, as the instant it names. The box itself has no zone: read with
 * `new Date(typed)`, it took the browser's clock zone, so a follow-up set for
 * 14:30 on a laptop in another zone fell at another hour. Null for anything
 * that is not a real day and time.
 */
export function baghdadWallTime(typed: string): string | null {
  const parts = WALL_TIME.exec(typed);
  if (!parts || Number(parts[2]) > 23 || Number(parts[3]) > 59) return null;
  const instant = Date.parse(`${typed}:00+03:00`);
  // '2026-02-30' parses as 2 March: the day must read back as typed.
  if (Number.isNaN(instant) || dayOf(instant) !== parts[1]) return null;
  return new Date(instant).toISOString();
}

/**
 * Where "the last `days` days" starts: midnight in Baghdad `days - 1` days
 * before today, so today counts as one of them: the same window the
 * Merchants list's "30 days" uses (admin_merchant_list_stats).
 */
export function lastDaysStart(days: number, now: Date | number = Date.now()): string {
  return `${addDays(dayOf(now), 1 - days)}T00:00:00+03:00`;
}

/**
 * A trial this many Baghdad days from its end or fewer is "ending": the
 * Trials page's count and red bars, the support card, shop health and the
 * shop list's alert flag all read this one number.
 */
export const TRIAL_ENDING_DAYS = 3;

export interface TrialClock {
  /** The end has passed: the trial is over (and the shop is locked until it pays). */
  ended: boolean;
  /** Calendar days from today to the end day: 0 ends today, 1 tomorrow, -2 ended two days ago. */
  days: number;
}

/**
 * Where a trial stands on the Baghdad calendar. A trial ending at 06:21
 * tomorrow ends tomorrow, whatever the hour now; one that ended at 06:21
 * today ended today. Every screen that names a trial's end reads this, so the
 * Merchants banner, the Trials page and the shop's flag cannot disagree.
 */
export function trialClock(trialEndsAt: string, now: Date | number = Date.now()): TrialClock {
  const end = new Date(trialEndsAt);
  const days = Math.round((Date.parse(dayOf(end)) - Date.parse(dayOf(now))) / DAY_MS);
  return { ended: end.getTime() <= new Date(now).getTime(), days };
}

/**
 * Which day of a shop's life today is, on the Baghdad calendar: 1 on the day
 * it signed up, 2 the day after, whatever the hour. A shop that signed up at
 * 23:50 is on day 2 ten minutes later, as its owner counts it.
 */
export function dayNumber(since: string, now: Date | number = Date.now()): number {
  return Math.round((Date.parse(dayOf(now)) - Date.parse(dayOf(since))) / DAY_MS) + 1;
}

/**
 * The `date_from` and `date_to` days of a list request ('2026-11-16') as the
 * instants that hold those Baghdad days, both whole days included: from 00:00
 * on the first day up to, not including, 00:00 the day after the last. A
 * filter on `created_at <= '2026-11-16'` stopped at midnight UTC on the 16th,
 * so "today" was always empty and the last day was dropped.
 */
export function readDayRange(searchParams: URLSearchParams): { gte: string | null; lt: string | null } | { error: string } {
  const from = searchParams.get("date_from") || null;
  const to = searchParams.get("date_to") || null;
  for (const [name, value] of [["date_from", from], ["date_to", to]] as const) {
    // Noon of that day must fall on that day: '2026-02-30' parses as 2 March, '2026-13-01' not at all.
    const noon = value === null ? 0 : Date.parse(`${value}T12:00:00+03:00`);
    if (value !== null && (!DAY_KEY.test(value) || Number.isNaN(noon) || dayOf(noon) !== value)) {
      return { error: `${name} must be a day such as 2026-11-16` };
    }
  }
  return {
    gte: from ? `${from}T00:00:00+03:00` : null,
    lt: to ? `${addDays(to, 1)}T00:00:00+03:00` : null,
  };
}
