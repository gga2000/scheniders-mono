"use client";

import { useMemo } from "react";
import { z } from "zod";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useLanguage } from "@/hooks/use-language";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "@/hooks/use-toast";
import { teamInsightsWindow } from "@/lib/team-time-window";
import { buildTeamInsights, rollupSchema } from "@/lib/team-insights";
import { GOAL_METRICS, GOAL_PERIODS, goalProgress, type Goal, type NewGoal } from "@/lib/team-goals";
import { GoalBoard, type GoalRow } from "./goal-board";

const goalRowsSchema = z.array(
    z.object({
        id: z.string(),
        employee_id: z.string(),
        type: z.enum(GOAL_PERIODS),
        metric: z.enum(GOAL_METRICS),
        target: z.coerce.number(),
        created_at: z.string(),
    }),
);

// Goals live in the team_goals table (per store, RLS-protected), not in the browser.
function useGoals() {
    const { tenantId } = useAuth();
    const { t } = useLanguage();
    const queryClient = useQueryClient();
    const queryKey = ["team-goals", tenantId] as const;

    const query = useQuery({
        queryKey,
        enabled: !!tenantId,
        queryFn: async (): Promise<Goal[]> => {
            const { data, error } = await supabase
                .from("team_goals")
                .select("id, employee_id, type, metric, target, created_at")
                .eq("tenant_id", tenantId ?? "")
                .order("created_at", { ascending: true });
            if (error) throw error;
            return goalRowsSchema.parse(data).map((r) => ({
                id: r.id,
                employeeId: r.employee_id,
                type: r.type,
                metric: r.metric,
                target: r.target,
                createdAt: r.created_at,
            }));
        },
    });

    const addMutation = useMutation({
        mutationFn: async (goal: NewGoal) => {
            if (!tenantId) throw new Error("No active store");
            const { error } = await supabase.from("team_goals").insert({
                tenant_id: tenantId,
                employee_id: goal.employeeId,
                type: goal.type,
                metric: goal.metric,
                target: goal.target,
            });
            if (error) throw error;
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey }),
    });

    const deleteMutation = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase.from("team_goals").delete().eq("id", id);
            if (error) throw error;
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey }),
        onError: (e: Error) => toast({ title: t("team.goals.deleteFailed"), description: e.message, variant: "error" }),
    });

    return {
        goals: query.data ?? [],
        loading: query.isPending && !!tenantId,
        failed: query.isError,
        /** Resolves true once saved; on failure shows a toast and keeps the form open. */
        addGoal: async (goal: NewGoal): Promise<boolean> => {
            try {
                await addMutation.mutateAsync(goal);
                return true;
            } catch (e) {
                toast({ title: t("team.goals.saveFailed"), description: e instanceof Error ? e.message : undefined, variant: "error" });
                return false;
            }
        },
        deleteGoal: (id: string) => deleteMutation.mutate(id),
    };
}

/**
 * Each member with a goal gets one 30-day count from the database (team_member_activity_rollup);
 * daily, weekly and monthly goals read the last 1, 7 and 30 days of it. Counted the same way as
 * the leaderboard, with no row cap.
 */
function useGoalProgress(tenantId: string | null | undefined, employeeIds: string[]) {
    const results = useQueries({
        queries: employeeIds.map((userId) => ({
            queryKey: ["team-rollup", tenantId, "month", userId],
            enabled: !!tenantId,
            queryFn: async () => {
                const window = teamInsightsWindow("month");
                const { data, error } = await supabase.rpc("team_member_activity_rollup", {
                    p_start: window.start,
                    p_end: window.end,
                    p_user_id: userId,
                });
                if (error) throw error;
                return buildTeamInsights(rollupSchema.parse(data), window.dayKeys);
            },
        })),
    });
    const byMember = new Map(employeeIds.map((id, i) => [id, results[i]?.data?.byDay]));
    return { byMember, failed: results.some((r) => r.isError) };
}

export function GoalTracking({ employees }: { employees: { userId: string; email: string; displayName: string | null }[] }) {
    const { t } = useLanguage();
    const { tenantId } = useAuth();
    const { goals, loading, failed, addGoal, deleteGoal } = useGoals();
    const people = useMemo(
        () => employees.map((e) => ({ userId: e.userId, name: e.displayName || e.email.split("@")[0] })),
        [employees],
    );
    const names = useMemo(() => new Map(people.map((p) => [p.userId, p.name])), [people]);
    const goalOwners = useMemo(() => [...new Set(goals.map((g) => g.employeeId))], [goals]);
    const progress = useGoalProgress(tenantId, goalOwners);

    const rows: GoalRow[] = goals.map((goal) => ({
        goal,
        name: names.get(goal.employeeId) ?? t("team.goals.formerMember"),
        current: goalProgress(goal, progress.byMember.get(goal.employeeId)),
    }));

    return (
        <GoalBoard
            rows={rows}
            employees={people}
            loading={loading}
            goalsFailed={failed}
            progressFailed={progress.failed}
            onAdd={addGoal}
            onDelete={deleteGoal}
        />
    );
}
