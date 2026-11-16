"use client";

import { useCallback, useEffect, useState } from "react";
import type { DateRangeKey } from "@/lib/analytics/dashboard-calculations";

const RANGES: readonly DateRangeKey[] = ["today", "7d", "30d", "all"];
/** The period the dashboard opens on when the link names none. */
export const DEFAULT_DASHBOARD_RANGE: DateRangeKey = "7d";

/** The period a `?range=` value names, or null when it names none. */
export function readDashboardRange(value: string | null): DateRangeKey | null {
    return RANGES.find((range) => range === value) ?? null;
}

/**
 * The dashboard's period, kept in `?range=` like the tab, so Back from an
 * Orders drill-down, a reload or a shared link opens the same days (round 15
 * critic: Back reset it to 7 days). Read after mount, as the tab is.
 */
export function useDashboardRange(): [DateRangeKey, (range: DateRangeKey) => void] {
    const [range, setRange] = useState<DateRangeKey>(DEFAULT_DASHBOARD_RANGE);
    useEffect(() => {
        const fromUrl = readDashboardRange(new URLSearchParams(window.location.search).get("range"));
        if (fromUrl) setRange(fromUrl); // eslint-disable-line react-hooks/set-state-in-effect -- the URL is only readable after mount
    }, []);
    const choose = useCallback((next: DateRangeKey) => {
        setRange(next);
        const url = new URL(window.location.href);
        if (next === DEFAULT_DASHBOARD_RANGE) url.searchParams.delete("range");
        else url.searchParams.set("range", next);
        window.history.replaceState(window.history.state, "", url);
    }, []);
    return [range, choose];
}
