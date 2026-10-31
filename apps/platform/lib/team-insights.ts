import { z } from "zod";

/** Shape of team_activity_rollup (see packages/supabase/migrations/20261031223104_team_activity_rollup.sql). */
export const rollupSchema = z.object({
    by_day: z.array(z.object({
        day: z.string(),
        total_actions: z.coerce.number(),
        orders_created: z.coerce.number(),
        status_changes: z.coerce.number(),
        orders_printed: z.coerce.number(),
    })),
    by_hour: z.array(z.object({ hour: z.coerce.number().int().min(0).max(23), n: z.coerce.number() })),
    by_action: z.array(z.object({ action: z.string(), n: z.coerce.number() })),
});

export type TeamRollup = z.infer<typeof rollupSchema>;

export interface TeamInsights {
    /** One entry per Baghdad day in the window, zero-filled, oldest first. */
    byDay: { date: string; totalActions: number; ordersCreated: number; statusChanges: number; ordersPrinted: number }[];
    /** Hours 0-23 in Baghdad time that had any activity. */
    byHour: { hour: number; count: number }[];
    byAction: { action: string; count: number }[];
}

/** Shapes the RPC result for the charts; days with no activity still get a point. */
export function buildTeamInsights(rollup: TeamRollup, dayKeys: string[]): TeamInsights {
    const byDayKey = new Map(rollup.by_day.map((d) => [d.day, d]));
    return {
        byDay: dayKeys.map((date) => {
            const d = byDayKey.get(date);
            return {
                date,
                totalActions: d?.total_actions ?? 0,
                ordersCreated: d?.orders_created ?? 0,
                statusChanges: d?.status_changes ?? 0,
                ordersPrinted: d?.orders_printed ?? 0,
            };
        }),
        byHour: rollup.by_hour.map((h) => ({ hour: h.hour, count: h.n })),
        byAction: rollup.by_action.map((a) => ({ action: a.action, count: a.n })),
    };
}
