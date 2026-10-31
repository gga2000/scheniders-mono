"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { teamInsightsWindow, type TeamTimeRange } from "@/lib/team-time-window";
import { buildTeamInsights, rollupSchema } from "@/lib/team-insights";

/** Insights counts for the whole window (team or one member), counted in the database, not from loaded feed rows. */
export function useTeamRollup({ timeRange, tenantId, userId, enabled, onError }: {
    timeRange: TeamTimeRange;
    tenantId: string | null | undefined;
    /** One member's counts instead of the whole team's. */
    userId?: string;
    enabled: boolean;
    onError: () => void;
}) {
    const query = useQuery({
        queryKey: ["team-rollup", tenantId, timeRange, userId ?? "team"],
        enabled: enabled && !!tenantId,
        queryFn: async () => {
            const window = teamInsightsWindow(timeRange);
            const { data, error } = userId
                ? await supabase.rpc("team_member_activity_rollup", { p_start: window.start, p_end: window.end, p_user_id: userId })
                : await supabase.rpc("team_activity_rollup", { p_start: window.start, p_end: window.end });
            if (error) throw error;
            return buildTeamInsights(rollupSchema.parse(data), window.dayKeys);
        },
    });
    const { isError } = query;
    useEffect(() => {
        if (isError) onError();
    }, [isError, onError]);
    return {
        insights: query.data ?? null,
        loading: query.isPending,
        failed: query.isError,
        refetch: async () => {
            await query.refetch();
        },
    };
}
