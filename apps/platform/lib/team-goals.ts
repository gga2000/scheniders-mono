import type { TeamInsights } from "@/lib/team-insights";

export type GoalPeriod = "daily" | "weekly" | "monthly";
export type GoalMetric = "totalActions" | "ordersCreated" | "statusChanges" | "ordersPrinted";

export interface Goal {
    id: string;
    employeeId: string;
    type: GoalPeriod;
    metric: GoalMetric;
    target: number;
    createdAt: string;
}

export type NewGoal = Omit<Goal, "id" | "createdAt">;

export const GOAL_PERIODS = ["daily", "weekly", "monthly"] as const satisfies readonly GoalPeriod[];
export const GOAL_METRICS = ["totalActions", "ordersCreated", "statusChanges", "ordersPrinted"] as const satisfies readonly GoalMetric[];

/**
 * Whole Baghdad days each goal counts, ending today: the same windows as the page's
 * Today / 7 days / 30 days switch, so a goal and the leaderboard never disagree.
 */
export const GOAL_PERIOD_DAYS: Record<GoalPeriod, number> = { daily: 1, weekly: 7, monthly: 30 };

/**
 * A goal's progress from one member's 30-day rollup: the sum of its metric over the last
 * N days. Returns null while that member's counts are not loaded.
 */
export function goalProgress(goal: Goal, memberDays: TeamInsights["byDay"] | undefined): number | null {
    if (!memberDays) return null;
    return memberDays
        .slice(-GOAL_PERIOD_DAYS[goal.type])
        .reduce((sum, day) => sum + day[goal.metric], 0);
}
