"use client";

import { useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth/auth-provider";
import { CACHE_PRESETS } from "@/lib/query-config";
import { fetchAllPages } from "@/lib/analytics/dashboard-order-facts";
import { DateRange } from "@/hooks/use-reports-metrics";

/**
 * Employee Activity Metrics  
 * Fetches real employee performance data from activity_logs table
 */

export interface EmployeeActivityMetrics {
    userId: string;
    userEmail: string;
    displayName: string;
    totalActions: number;
    ordersCreated: number;
    statusChanges: number;
    ordersEdited: number;
    ordersPrinted: number;
    confirmedOrders: number;
    deliveredOrders: number;
    avgActionsPerDay: number;
    mostRecentAction: Date | null;
    isOnline: boolean;
    rank: number;
}

export interface UseEmployeeMetricsResult {
    employees: EmployeeActivityMetrics[];
    loading: boolean;
    error: string | null;
    refresh: () => Promise<void>;
    totalActions: number;
    topPerformer: EmployeeActivityMetrics | null;
}

interface ActivityLogRow {
    user_id: string;
    user_email: string;
    action: string;
    created_at: string;
    details: Record<string, unknown>;
}

interface UserProfileRow {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
    last_login_at: string | null;
}

/** Rows per `.in()` request: keeps the URL well under the gateway limit. */
const ID_CHUNK = 200;

export function useEmployeeMetrics(dateRange: DateRange): UseEmployeeMetricsResult {
    const { session, clientReady, tenantId } = useAuth();
    const from = dateRange.from.toISOString();
    const to = dateRange.to.toISOString();

    const query = useQuery({
        queryKey: ["reports", "employee-activity", tenantId, from, to],
        queryFn: async () => {
            if (!tenantId) throw new Error("employee metrics requested without a tenant");
            // Every page: a response is capped at 1,000 rows, and a busy month has far more
            // actions — stopping at the first page silently under-counts every employee.
            const logs = await fetchAllPages<ActivityLogRow>(async (start, end) => {
                const { data, error } = await supabase
                    .from("activity_logs")
                    .select("user_id, user_email, action, created_at, details")
                    .eq("tenant_id", tenantId)
                    .gte("created_at", from)
                    .lte("created_at", to)
                    .not("user_id", "is", null)
                    .order("created_at", { ascending: false })
                    .order("id", { ascending: false })
                    .range(start, end);
                if (error) throw new Error(error.message);
                return (data ?? []) as ActivityLogRow[];
            });

            const userIds = [...new Set(logs.map(l => l.user_id))];
            const profiles: UserProfileRow[] = [];
            for (let i = 0; i < userIds.length; i += ID_CHUNK) {
                const { data, error } = await supabase
                    .from("user_profiles")
                    .select("id, display_name, avatar_url, last_login_at")
                    .in("id", userIds.slice(i, i + ID_CHUNK));
                if (error) throw new Error(error.message);
                profiles.push(...(data ?? []));
            }
            return { logs, profiles };
        },
        enabled: !!session && clientReady && !!tenantId,
        staleTime: CACHE_PRESETS.FREQUENT.staleTime,
        gcTime: CACHE_PRESETS.FREQUENT.gcTime,
        retry: 2,
    });

    const rawData = useMemo(() => query.data?.logs ?? [], [query.data]);
    const profiles = useMemo(
        () => new Map((query.data?.profiles ?? []).map(p => [p.id, p])),
        [query.data]
    );
    const loading = query.isPending;
    const error = query.error ? query.error.message : null;
    const { refetch } = query;
    const refresh = useCallback(async () => { await refetch(); }, [refetch]);

    // Process raw data into employee metrics
    const employees = useMemo(() => {
        const statsMap = new Map<string, {
            userEmail: string;
            actions: number;
            ordersCreated: number;
            statusChanges: number;
            ordersEdited: number;
            ordersPrinted: number;
            confirmedOrders: number;
            deliveredOrders: number;
            dates: Set<string>;
            lastAction: Date | null;
        }>();

        rawData.forEach(log => {
            const userId = log.user_id;
            if (!userId) return;

            if (!statsMap.has(userId)) {
                statsMap.set(userId, {
                    userEmail: log.user_email || '',
                    actions: 0,
                    ordersCreated: 0,
                    statusChanges: 0,
                    ordersEdited: 0,
                    ordersPrinted: 0,
                    confirmedOrders: 0,
                    deliveredOrders: 0,
                    dates: new Set(),
                    lastAction: null,
                });
            }

            const stats = statsMap.get(userId)!;
            stats.actions++;
            stats.dates.add(new Date(log.created_at).toDateString());

            const actionDate = new Date(log.created_at);
            if (!stats.lastAction || actionDate > stats.lastAction) {
                stats.lastAction = actionDate;
            }

            // Track specific actions
            switch (log.action) {
                case "order.create":
                    stats.ordersCreated++;
                    break;
                case "order.status_change":
                    stats.statusChanges++;
                    // Check if it was a confirmation or delivery
                    const details = log.details as { to_status?: string };
                    if (details?.to_status === "confirmed") {
                        stats.confirmedOrders++;
                    }
                    if (details?.to_status === "delivered" || details?.to_status === "completed") {
                        stats.deliveredOrders++;
                    }
                    break;
                case "order.edit":
                    stats.ordersEdited++;
                    break;
                case "order.print":
                    stats.ordersPrinted++;
                    break;
            }
        });

        // Convert to array and calculate metrics
        const result: EmployeeActivityMetrics[] = [];

        statsMap.forEach((stats, userId) => {
            const profile = profiles.get(userId);
            const daysActive = stats.dates.size || 1;

            // Check if online (action in last 15 minutes)
            const isOnline = stats.lastAction
                ? (Date.now() - stats.lastAction.getTime()) < 15 * 60 * 1000
                : false;

            result.push({
                userId,
                userEmail: stats.userEmail,
                displayName: profile?.display_name || stats.userEmail.split('@')[0],
                totalActions: stats.actions,
                ordersCreated: stats.ordersCreated,
                statusChanges: stats.statusChanges,
                ordersEdited: stats.ordersEdited,
                ordersPrinted: stats.ordersPrinted,
                confirmedOrders: stats.confirmedOrders,
                deliveredOrders: stats.deliveredOrders,
                avgActionsPerDay: stats.actions / daysActive,
                mostRecentAction: stats.lastAction,
                isOnline,
                rank: 0,
            });
        });

        // Sort by total actions and assign ranks
        result.sort((a, b) => b.totalActions - a.totalActions);
        result.forEach((emp, i) => emp.rank = i + 1);

        return result;
    }, [rawData, profiles]);

    const totalActions = useMemo(() =>
        employees.reduce((sum, e) => sum + e.totalActions, 0),
        [employees]
    );

    const topPerformer = employees[0] || null;

    return {
        employees,
        loading,
        error,
        refresh,
        totalActions,
        topPerformer,
    };
}
