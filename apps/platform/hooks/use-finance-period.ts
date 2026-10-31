"use client";

import { useState, useMemo, useCallback } from "react";
import { baghdadDayKey } from "@/lib/order-window";

export type Granularity = "day" | "week" | "month" | "quarter" | "year";
export type PresetKey = "today" | "yesterday" | "last7" | "last30" | "mtd" | "ytd" | "custom";

export interface FinancePeriod {
    start: Date;
    end: Date;
    preset: PresetKey;
    compareMode: "previous" | "yoy" | "none";
}

function startOfDay(d: Date): Date {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
}

function endOfDay(d: Date): Date {
    const x = new Date(d);
    x.setHours(23, 59, 59, 999);
    return x;
}

function addDays(d: Date, n: number): Date {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
}

function addYears(d: Date, n: number): Date {
    const x = new Date(d);
    x.setFullYear(x.getFullYear() + n);
    return x;
}

function startOfMonth(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

function startOfYear(d: Date): Date {
    return new Date(d.getFullYear(), 0, 1, 0, 0, 0, 0);
}

function presetRange(preset: PresetKey): { start: Date; end: Date } {
    const now = new Date();
    switch (preset) {
        case "today":
            return { start: startOfDay(now), end: endOfDay(now) };
        case "yesterday": {
            const y = addDays(now, -1);
            return { start: startOfDay(y), end: endOfDay(y) };
        }
        case "last7":
            return { start: startOfDay(addDays(now, -6)), end: endOfDay(now) };
        case "last30":
            return { start: startOfDay(addDays(now, -29)), end: endOfDay(now) };
        case "mtd":
            return { start: startOfMonth(now), end: endOfDay(now) };
        case "ytd":
            return { start: startOfYear(now), end: endOfDay(now) };
        default:
            return { start: startOfDay(addDays(now, -29)), end: endOfDay(now) };
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
        setPeriod((p) => ({ ...p, preset: "custom", start: startOfDay(start), end: endOfDay(end) }));
    }, []);

    const setCompareMode = useCallback((mode: FinancePeriod["compareMode"]) => {
        setPeriod((p) => ({ ...p, compareMode: mode }));
    }, []);

    const compareRange = useMemo<{ start: Date; end: Date } | null>(() => {
        if (period.compareMode === "none") return null;
        if (period.compareMode === "yoy") {
            return { start: addYears(period.start, -1), end: addYears(period.end, -1) };
        }
        const lenMs = period.end.getTime() - period.start.getTime();
        const end = new Date(period.start.getTime() - 1);
        const start = new Date(end.getTime() - lenMs);
        return { start: startOfDay(start), end: endOfDay(end) };
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
