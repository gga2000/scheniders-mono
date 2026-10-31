"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "@/lib/supabase";
import type { EmployeeStats } from "@/lib/team-types";
import { teamPreviousWindow, teamRangeStart, type TeamTimeRange } from "@/lib/team-time-window";
import { addDaysToDayKey, baghdadDayKey, baghdadDayStart } from "@/lib/order-window";

// bigint counts come back from PostgREST as strings or numbers; validate the RPC boundary.
const leaderboardRowsSchema = z.array(z.object({
    user_id: z.string(),
    user_email: z.string().nullable(),
    total_actions: z.coerce.number(),
    status_changes: z.coerce.number(),
    orders_created: z.coerce.number(),
    orders_printed: z.coerce.number(),
    orders_edited: z.coerce.number(),
    logins: z.coerce.number(),
}));

const periodTotalsSchema = z.array(z.object({
    total_actions: z.coerce.number(),
    orders_created: z.coerce.number(),
    status_changes: z.coerce.number(),
    orders_printed: z.coerce.number(),
}));

export interface PeriodTotals {
    totalActions: number;
    ordersCreated: number;
    statusChanges: number;
    ordersPrinted: number;
}

const ZERO_TOTALS: PeriodTotals = { totalActions: 0, ordersCreated: 0, statusChanges: 0, ordersPrinted: 0 };

interface UseTeamLeaderboardOptions {
    timeRange: TeamTimeRange;
    tenantId: string | null | undefined;
    enabled: boolean;
    onError: () => void;
}

async function loadLeaderboard(
    timeRange: TeamTimeRange,
    tenantId: string,
): Promise<{ leaderboard: EmployeeStats[]; previousTotals: PeriodTotals }> {
    const { data, error } = await supabase.rpc("team_leaderboard", {
        p_since: teamRangeStart(timeRange) ?? undefined,
    });
    if (error) throw error;
    const rows = leaderboardRowsSchema.parse(data);

    // Every active member of this store, not just people with activity in the window:
    // a manager needs to see who did nothing today. Role is the per-store role.
    const { data: members, error: membersError } = await supabase
        .from("tenant_members")
        .select("user_id, role")
        .eq("tenant_id", tenantId)
        .eq("status", "active");
    if (membersError) throw membersError;
    const memberRoleById = new Map<string, string>((members ?? []).map((m) => [m.user_id, m.role]));

    const rowById = new Map(rows.map((r) => [r.user_id, r]));
    const userIds = Array.from(new Set([...memberRoleById.keys(), ...rowById.keys()]));
    const profileById = new Map<string, {
        email: string | null;
        display_name: string | null;
        avatar_url: string | null;
        role: string | null;
        is_active: boolean | null;
        last_login_at: string | null;
    }>();
    if (userIds.length > 0) {
        const { data: profiles, error: profilesError } = await supabase
            .from("user_profiles")
            .select("id, email, display_name, avatar_url, role, is_active, last_login_at")
            .in("id", userIds);
        if (profilesError) throw profilesError;
        profiles?.forEach((p) => profileById.set(p.id, p));
    }

    const leaderboard: EmployeeStats[] = userIds
        .map((userId) => {
            const profile = profileById.get(userId);
            const r = rowById.get(userId);
            return {
                user_id: userId,
                user_email: r?.user_email || profile?.email || "",
                display_name: profile?.display_name ?? null,
                avatar_url: profile?.avatar_url ?? null,
                role: memberRoleById.get(userId) || profile?.role || "employee",
                is_active: profile?.is_active ?? true,
                last_login_at: profile?.last_login_at ?? null,
                total_actions: r?.total_actions ?? 0,
                status_changes: r?.status_changes ?? 0,
                orders_created: r?.orders_created ?? 0,
                orders_printed: r?.orders_printed ?? 0,
                orders_edited: r?.orders_edited ?? 0,
                logins: r?.logins ?? 0,
            };
        })
        .sort((a, b) => b.total_actions - a.total_actions);

    const prev = teamPreviousWindow(timeRange);
    if (!prev) return { leaderboard, previousTotals: ZERO_TOTALS };
    const { data: totals, error: totalsError } = await supabase.rpc("team_period_totals", {
        p_start: prev.start,
        p_end: prev.end,
    });
    if (totalsError) throw totalsError;
    const row = periodTotalsSchema.parse(totals)[0];
    return {
        leaderboard,
        previousTotals: {
            totalActions: row?.total_actions ?? 0,
            ordersCreated: row?.orders_created ?? 0,
            statusChanges: row?.status_changes ?? 0,
            ordersPrinted: row?.orders_printed ?? 0,
        },
    };
}

async function loadDailyTrend(): Promise<DailyTrendPoint[]> {
    const today = baghdadDayKey();
    const days = Array.from({ length: 7 }, (_, i) => addDaysToDayKey(today, i - 6));
    const results = await Promise.all(
        days.map((day) =>
            supabase.rpc("team_period_totals", {
                p_start: new Date(baghdadDayStart(day)).toISOString(),
                p_end: new Date(baghdadDayStart(addDaysToDayKey(day, 1))).toISOString(),
            }),
        ),
    );
    return days.map((day, i) => {
        const { data, error } = results[i];
        if (error) throw error;
        const row = periodTotalsSchema.parse(data)[0];
        return { day, totalActions: row?.total_actions ?? 0, ordersCreated: row?.orders_created ?? 0 };
    });
}

export interface DailyTrendPoint {
    day: string;
    totalActions: number;
    ordersCreated: number;
}

/**
 * The store roster with per-person activity counts for the window, plus the previous window's
 * totals for trend deltas. Counting happens in the database (team_leaderboard, tenant- and
 * admin-scoped); every active member is listed, including people with no activity yet.
 */
export function useTeamLeaderboard({ timeRange, tenantId, enabled, onError }: UseTeamLeaderboardOptions) {
    const query = useQuery({
        queryKey: ["team-leaderboard", tenantId, timeRange],
        enabled: enabled && !!tenantId,
        queryFn: () => loadLeaderboard(timeRange, tenantId ?? ""),
        placeholderData: (previous) => previous,
    });
    const { isError } = query;
    useEffect(() => {
        if (isError) onError();
    }, [isError, onError]);

    return {
        leaderboard: query.data?.leaderboard ?? [],
        previousTotals: query.data?.previousTotals ?? ZERO_TOTALS,
        loading: query.isPending,
        /** When the data was fetched; used as "now" for presence so render stays pure. */
        updatedAt: query.dataUpdatedAt,
        refetch: async () => {
            await query.refetch();
        },
    };
}

/**
 * Real per-day totals for the last 7 Baghdad days, counted in the database. Fetched on mount
 * and on manual refresh, not on every realtime event.
 */
export function useTeamDailyTrend({ tenantId, enabled, onError }: {
    tenantId: string | null | undefined;
    enabled: boolean;
    onError: () => void;
}) {
    const query = useQuery({
        queryKey: ["team-daily-trend", tenantId],
        enabled: enabled && !!tenantId,
        queryFn: loadDailyTrend,
    });
    const { isError } = query;
    useEffect(() => {
        if (isError) onError();
    }, [isError, onError]);
    return {
        trend: query.data ?? [],
        refetchTrend: async () => {
            await query.refetch();
        },
    };
}
