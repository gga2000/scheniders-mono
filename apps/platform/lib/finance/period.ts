import { z } from "zod";
import { addDaysToDayKey, baghdadDayKey, baghdadDayStart } from "@/lib/order-window";
import type { DayRange } from "@/lib/finance/summary-read";

export type Granularity = "day" | "week" | "month" | "quarter" | "year";
export type PresetKey = "today" | "yesterday" | "last7" | "last30" | "mtd" | "ytd" | "custom";

export interface FinancePeriod {
    start: Date;
    end: Date;
    preset: PresetKey;
    compareMode: "previous" | "yoy" | "none";
}

/**
 * Every boundary below is a Baghdad calendar day, not the viewer's local day:
 * the merchant's "today" is Baghdad's wherever the browser is, and a custom
 * range typed as a date means those Baghdad days. (Local-time maths put the
 * range a day off for any browser outside UTC+3.)
 */
const dayStart = (day: string): Date => new Date(baghdadDayStart(day));
const dayEnd = (day: string): Date => new Date(baghdadDayStart(addDaysToDayKey(day, 1)) - 1);

/** The same Baghdad calendar day one year earlier (29 Feb falls back to 28 Feb). */
function sameDayLastYear(day: string): string {
    const [y, m, d] = day.split("-").map(Number);
    const lastYear = y - 1;
    const leapDayMissing = m === 2 && d === 29 && new Date(Date.UTC(lastYear, 1, 29)).getUTCMonth() !== 1;
    return `${String(lastYear).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(leapDayMissing ? 28 : d).padStart(2, "0")}`;
}

export function dayRange(startDay: string, endDay: string): { start: Date; end: Date } {
    return { start: dayStart(startDay), end: dayEnd(endDay) };
}

export function presetRange(preset: PresetKey): { start: Date; end: Date } {
    const today = baghdadDayKey();
    switch (preset) {
        case "today":
            return dayRange(today, today);
        case "yesterday": {
            const y = addDaysToDayKey(today, -1);
            return dayRange(y, y);
        }
        case "last7":
            return dayRange(addDaysToDayKey(today, -6), today);
        case "mtd":
            return dayRange(`${today.slice(0, 7)}-01`, today);
        case "ytd":
            return dayRange(`${today.slice(0, 4)}-01-01`, today);
        case "last30":
        default:
            return dayRange(addDaysToDayKey(today, -29), today);
    }
}

/**
 * The merchant's last period choice, kept per browser so Finances reopens on it.
 * A custom range is not kept: its dates would be stale the next day.
 */
export const FINANCE_PERIOD_STORAGE_KEY = "finance.period.v1";
export const StoredPeriodSchema = z.object({
    preset: z.enum(["today", "yesterday", "last7", "last30", "mtd", "ytd"]),
    compareMode: z.enum(["previous", "yoy", "none"]),
});
export type StoredPeriod = z.infer<typeof StoredPeriodSchema>;

/** The period this choice opens on: the stored preset, or `initial`, and the stored comparison, or the period before. */
export function openingPeriod(stored: StoredPeriod | null, initial: PresetKey): FinancePeriod {
    const preset = stored?.preset ?? initial;
    const range = presetRange(preset);
    return { start: range.start, end: range.end, preset, compareMode: stored?.compareMode ?? "previous" };
}

/** The days compared with `period`, or null when it is compared with nothing. */
export function compareRangeOf(period: FinancePeriod): { start: Date; end: Date } | null {
    if (period.compareMode === "none") return null;
    const startDay = baghdadDayKey(period.start);
    const endDay = baghdadDayKey(period.end);
    if (period.compareMode === "yoy") {
        return dayRange(sameDayLastYear(startDay), sameDayLastYear(endDay));
    }
    // The previous period: as many whole days, ending the day before this one starts.
    const days = Math.round((baghdadDayStart(endDay) - baghdadDayStart(startDay)) / 86_400_000) + 1;
    const prevEnd = addDaysToDayKey(startDay, -1);
    return dayRange(addDaysToDayKey(prevEnd, -(days - 1)), prevEnd);
}

/**
 * The two summaries Finances asks for when it opens on this stored choice:
 * the period's days and its comparison's (what the page hands to
 * useFinanceSummary). The server's first-load read (lib/boot) reads the same.
 */
export function openingSummaryDays(stored: StoredPeriod | null, initial: PresetKey): { current: DayRange; compare: DayRange | null } {
    const period = openingPeriod(stored, initial);
    const compare = compareRangeOf(period);
    return {
        current: { startDate: baghdadDayKey(period.start), endDate: baghdadDayKey(period.end) },
        compare: compare ? { startDate: baghdadDayKey(compare.start), endDate: baghdadDayKey(compare.end) } : null,
    };
}
