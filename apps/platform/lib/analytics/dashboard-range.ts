import type { DateRangeKey } from "@/lib/analytics/dashboard-calculations";

const RANGES: readonly DateRangeKey[] = ["today", "7d", "30d", "all"];
/** The period the dashboard opens on when the link names none. */
export const DEFAULT_DASHBOARD_RANGE: DateRangeKey = "7d";

/** The period a `?range=` value names, or null when it names none. */
export function readDashboardRange(value: string | null): DateRangeKey | null {
    return RANGES.find((range) => range === value) ?? null;
}
