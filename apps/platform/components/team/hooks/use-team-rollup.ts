"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { teamInsightsWindow, type TeamTimeRange } from "@/lib/team-time-window";
import { buildTeamInsights, rollupSchema } from "@/lib/team-insights";

/** Insights counts for the whole window, counted in the database (not from the loaded feed rows). */
export function useTeamRollup({ timeRange, tenantId, enabled, onError }: {
    timeRange: TeamTimeRange;
    tenantId: string | null | undefined;
    enabled: boolean;
    onError: () => void;
}) {
    const query = useQuery({
        queryKey: ["team-rollup", tenantId, timeRange],
        enabled: enabled && !!tenantId,
        queryFn: async () => {
            const window = teamInsightsWindow(timeRange);
            const { data, error } = await supabase.rpc("team_activity_rollup", {
                p_start: window.start,
                p_end: window.end,
            });
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
