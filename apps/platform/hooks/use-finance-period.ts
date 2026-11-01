"use client";

import { useState, useMemo, useCallback } from "react";
import { addDaysToDayKey, baghdadDayKey, baghdadDayStart } from "@/lib/order-window";

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

function dayRange(startDay: string, endDay: string): { start: Date; end: Date } {
    return { start: dayStart(startDay), end: dayEnd(endDay) };
}

function presetRange(preset: PresetKey): { start: Date; end: Date } {
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

export function useFinancePeriod(initial: PresetKey = "last30") {
    const initialRange = presetRange(initial);
    const [period, setPeriod] = useState<FinancePeriod>({
        start: initialRange.start,
        end: initialRange.end,
        preset: initial,
        compareMode: "previous",
    });

    const applyPreset = useCallback((preset: PresetKey) => {
        const r = presetRange(preset);
        setPeriod((p) => ({ ...p, preset, start: r.start, end: r.end }));
    }, []);

    const setCustom = useCallback((start: Date, end: Date) => {
        setPeriod((p) => ({ ...p, preset: "custom", ...dayRange(baghdadDayKey(start), baghdadDayKey(end)) }));
    }, []);

    const setCompareMode = useCallback((mode: FinancePeriod["compareMode"]) => {
        setPeriod((p) => ({ ...p, compareMode: mode }));
    }, []);

    const compareRange = useMemo<{ start: Date; end: Date } | null>(() => {
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
    }, [period]);

    const granularity = useMemo<Granularity>(() => {
        const days = (period.end.getTime() - period.start.getTime()) / (24 * 60 * 60 * 1000);
        if (days <= 2) return "day";
        if (days <= 60) return "day";
        if (days <= 180) return "week";
        if (days <= 730) return "month";
        return "month";
    }, [period]);

    const dateRangeStrings = useMemo(() => ({
        startDate: baghdadDayKey(period.start),
        endDate: baghdadDayKey(period.end),
    }), [period]);

    return {
        period,
        compareRange,
        granularity,
        dateRangeStrings,
        applyPreset,
        setCustom,
        setCompareMode,
    };
}
