/*
 * One way to write money, counts and days in the console.
 *
 * The same wallet read "43,800 IQD", "44K", "IQD 43,800" and "0IQD" on four
 * screens, and a day read "11/15/2026", "Nov 15" or "5mo ago". Staff compare
 * numbers across screens, so each kind of number is written one way: whole
 * dinars with commas and " IQD" after, and days as "Sun 15 Nov" in Baghdad
 * time, with the year only when it is not this year.
 */

const WHOLE = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/** 43800 -> "43,800 IQD". IQD has no smaller unit, so a fraction is rounded away. */
export function formatIQD(amount: number): string {
  return `${WHOLE.format(Math.round(amount))} IQD`;
}

/** 5445 -> "5,445". */
export function formatCount(n: number): string {
  return WHOLE.format(Math.round(n));
}

const BAGHDAD = "Asia/Baghdad";
const DAY = new Intl.DateTimeFormat("en-GB", { timeZone: BAGHDAD, weekday: "short", day: "numeric", month: "short" });
const DAY_YEAR = new Intl.DateTimeFormat("en-GB", {
  timeZone: BAGHDAD,
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
});
const TIME = new Intl.DateTimeFormat("en-GB", { timeZone: BAGHDAD, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const YEAR = new Intl.DateTimeFormat("en-GB", { timeZone: BAGHDAD, year: "numeric" });

function asDate(value: string | number | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

/** "Sun 15 Nov" in Baghdad time; "Wed 9 Apr 2025" when it is not this year. */
export function formatDay(value: string | number | Date, now: Date = new Date()): string {
  const date = asDate(value);
  const sameYear = YEAR.format(date) === YEAR.format(now);
  // en-GB writes "Sun, 15 Nov"; the comma is dropped so every screen reads the same.
  return (sameYear ? DAY : DAY_YEAR).format(date).replace(",", "");
}

/** "Sun 15 Nov, 14:05" in Baghdad time. */
export function formatDayTime(value: string | number | Date, now: Date = new Date()): string {
  const date = asDate(value);
  return `${formatDay(date, now)}, ${TIME.format(date)}`;
}
