/*
 * One way to write money, counts and days in the console.
 *
 * The same wallet read "43,800 IQD", "44K", "IQD 43,800" and "0IQD" on four
 * screens, and a day read "11/15/2026", "Nov 15" or "5mo ago". Staff compare
 * numbers across screens, so each kind of number is written one way: whole
 * dinars with commas and " IQD" after, and days as "Sun 15 Nov" in Baghdad
 * time, with the year only when it is not this year. Something that happened
 * in the last day reads "12 min ago" or "5 h ago"; anything older is its day.
 */

import { trialClock } from "./baghdad-day";

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
/*
 * The day's parts, put in our own order below. Not en-GB: it writes September
 * "Sept" and every other month in three letters, so a day in September read
 * "Tue 1 Sept" beside "Sun 15 Nov" and the charts' "Sep".
 */
const DAY_PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: BAGHDAD,
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
});
const TIME = new Intl.DateTimeFormat("en-GB", { timeZone: BAGHDAD, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

function asDate(value: string | number | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

function dayParts(date: Date): { weekday: string; day: string; month: string; year: string } {
  const parts = { weekday: "", day: "", month: "", year: "" };
  for (const { type, value } of DAY_PARTS.formatToParts(date)) {
    if (type === "weekday" || type === "day" || type === "month" || type === "year") parts[type] = value;
  }
  return parts;
}

/** "Sun 15 Nov" in Baghdad time; "Wed 9 Apr 2025" when it is not this year. */
export function formatDay(value: string | number | Date, now: Date = new Date()): string {
  const { weekday, day, month, year } = dayParts(asDate(value));
  const text = `${weekday} ${day} ${month}`;
  return year === dayParts(now).year ? text : `${text} ${year}`;
}

const DAY_KEY = new Intl.DateTimeFormat("en-CA", { timeZone: BAGHDAD, year: "numeric", month: "2-digit", day: "2-digit" });

/** "2026-11-15": the Baghdad calendar day, for grouping by day. */
export function formatDayKey(value: string | number | Date): string {
  return DAY_KEY.format(asDate(value));
}

/** "14:05" in Baghdad time. */
export function formatTime(value: string | number | Date): string {
  return TIME.format(asDate(value));
}

/** "Sun 15 Nov, 14:05" in Baghdad time. */
export function formatDayTime(value: string | number | Date, now: Date = new Date()): string {
  const date = asDate(value);
  return `${formatDay(date, now)}, ${TIME.format(date)}`;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/**
 * When something happened: "just now", "12 min ago" and "5 h ago" within the
 * last day, then the day ("Sun 15 Nov"). A time still to come is its day too.
 */
export function formatWhen(value: string | number | Date, now: Date = new Date()): string {
  const date = asDate(value);
  const elapsed = now.getTime() - date.getTime();
  if (elapsed <= -MINUTE || elapsed >= 24 * HOUR) return formatDay(date, now);
  // A few seconds "ahead" is the server's clock, not the future.
  if (elapsed < MINUTE) return "just now";
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)} min ago`;
  return `${Math.floor(elapsed / HOUR)} h ago`;
}

const DAY_MS = 24 * HOUR;

/**
 * How long until something: "in 40 min", "in 15 h", "in 3 days"; "ended" once
 * it has passed. Whole units, rounded down, so "in 1 day" never means 47 hours.
 */
export function formatUntil(value: string | number | Date, now: Date = new Date()): string {
  const left = asDate(value).getTime() - now.getTime();
  if (left <= 0) return "ended";
  if (left < HOUR) return `in ${Math.max(1, Math.floor(left / MINUTE))} min`;
  if (left < DAY_MS) return `in ${Math.floor(left / HOUR)} h`;
  const days = Math.floor(left / DAY_MS);
  return days === 1 ? "in 1 day" : `in ${days} days`;
}

/**
 * How long until a trial or a month ends, as staff read it beside its date:
 * hours or minutes under a day, then days on the Baghdad calendar, as the
 * Trials page counts them (trialClock). A trial ending Fri 06:00 is "in 3
 * days" on Tuesday evening on both screens; whole 24-hour spans said "in 2".
 */
export function formatUntilDay(value: string | number | Date, now: Date = new Date()): string {
  const end = asDate(value);
  if (end.getTime() - now.getTime() < DAY_MS) return formatUntil(end, now);
  const { days } = trialClock(end.toISOString(), now);
  return days === 1 ? "tomorrow" : `in ${days} days`;
}
