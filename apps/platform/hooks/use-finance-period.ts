"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { baghdadDayKey } from "@/lib/order-window";
import {
    compareRangeOf,
    dayRange,
    FINANCE_PERIOD_STORAGE_KEY,
    openingPeriod,
    presetRange,
    StoredPeriodSchema,
    type FinancePeriod,
    type Granularity,
    type PresetKey,
    type StoredPeriod,
} from "@/lib/finance/period";

export type { FinancePeriod, Granularity, PresetKey } from "@/lib/finance/period";

function readStored(): StoredPeriod | null {
    if (typeof window === "undefined") return null;
    try {
        const raw = window.localStorage.getItem(FINANCE_PERIOD_STORAGE_KEY);
        const parsed = raw ? StoredPeriodSchema.safeParse(JSON.parse(raw)) : null;
        return parsed?.success ? parsed.data : null;
    } catch {
        // Blocked or corrupt storage only costs the remembered choice.
        return null;
    }
}

function writeStored(value: StoredPeriod): void {
    try {
        window.localStorage.setItem(FINANCE_PERIOD_STORAGE_KEY, JSON.stringify(value));
    } catch {
        // Same: the choice just is not remembered.
    }
}

export function useFinancePeriod(initial: PresetKey = "last30") {
    const [period, setPeriod] = useState<FinancePeriod>(() => openingPeriod(readStored(), initial));

    const { preset, compareMode } = period;
    useEffect(() => {
        if (preset !== "custom") writeStored({ preset, compareMode });
    }, [preset, compareMode]);

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

    const compareRange = useMemo(() => compareRangeOf(period), [period]);

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

    // Expenses are loaded back to the start of the comparison period too, because the
    // comparison profit is netted of that period's expenses just like the current one.
    const expenseFetchRange = useMemo(() => {
        const compareStart = compareRange ? baghdadDayKey(compareRange.start) : null;
        return {
            startDate: compareStart && compareStart < dateRangeStrings.startDate ? compareStart : dateRangeStrings.startDate,
            endDate: dateRangeStrings.endDate,
        };
    }, [compareRange, dateRangeStrings]);

    return {
        period,
        compareRange,
        granularity,
        dateRangeStrings,
        expenseFetchRange,
        applyPreset,
        setCustom,
        setCompareMode,
    };
}
