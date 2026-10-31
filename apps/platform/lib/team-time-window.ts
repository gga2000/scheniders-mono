import { addDaysToDayKey, baghdadDayKey, baghdadDayStart } from "@/lib/order-window";

export type TeamTimeRange = "today" | "week" | "month" | "all";

/** Whole Baghdad calendar days each range covers, counting today. */
const RANGE_DAYS: Record<Exclude<TeamTimeRange, "all">, number> = {
    today: 1,
    week: 7,
    month: 30,
};

/**
 * Start of the current window as an ISO instant (null = all time).
 * Windows are whole Baghdad days ending today, so "Today" means since 00:00 in Baghdad on
 * every device, and the leaderboard, activity feed and goals all agree.
 */
export function teamRangeStart(range: TeamTimeRange, now: number = Date.now()): string | null {
    if (range === "all") return null;
    const firstDay = addDaysToDayKey(baghdadDayKey(now), -(RANGE_DAYS[range] - 1));
    return new Date(baghdadDayStart(firstDay)).toISOString();
}

/** The window of the same length immediately before the current one, for trend deltas. */
export function teamPreviousWindow(
    range: TeamTimeRange,
    now: number = Date.now(),
): { start: string; end: string } | null {
    if (range === "all") return null;
    const days = RANGE_DAYS[range];
    const currentFirstDay = addDaysToDayKey(baghdadDayKey(now), -(days - 1));
    const previousFirstDay = addDaysToDayKey(currentFirstDay, -days);
    return {
        start: new Date(baghdadDayStart(previousFirstDay)).toISOString(),
        end: new Date(baghdadDayStart(currentFirstDay)).toISOString(),
    };
}

/**
 * Days the Insights charts cover. A one-day chart says nothing, so "Today" shows the last week;
 * "All" is capped at a year, the most the rollup RPC accepts.
 */
const INSIGHTS_DAYS: Record<TeamTimeRange, number> = { today: 7, week: 7, month: 30, all: 365 };

/** The Insights window as whole Baghdad days ending today, oldest first. */
export function teamInsightsWindow(range: TeamTimeRange, now: number = Date.now()): {
    start: string;
    end: string;
    dayKeys: string[];
} {
    const days = INSIGHTS_DAYS[range];
    const today = baghdadDayKey(now);
    const dayKeys = Array.from({ length: days }, (_, i) => addDaysToDayKey(today, i - (days - 1)));
    return {
        start: new Date(baghdadDayStart(dayKeys[0])).toISOString(),
        end: new Date(baghdadDayStart(addDaysToDayKey(today, 1))).toISOString(),
        dayKeys,
    };
}
