"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/lib/supabase";
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

export function useEmployeeMetrics(dateRange: DateRange): UseEmployeeMetricsResult {
    const [rawData, setRawData] = useState<ActivityLogRow[]>([]);
    const [profiles, setProfiles] = useState<Map<string, UserProfileRow>>(new Map());
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchData = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            // Fetch activity logs for the date range
            const { data: logs, error: logsError } = await supabase
                .from("activity_logs")
                .select("user_id, user_email, action, created_at, details")
                .gte("created_at", dateRange.from.toISOString())
                .lte("created_at", dateRange.to.toISOString())
                .not("user_id", "is", null)
                .order("created_at", { ascending: false });

            if (logsError) {
                throw new Error(logsError.message);
            }

            setRawData(logs || []);

            // Get unique user IDs
            const userIds = [...new Set((logs || []).map(l => l.user_id))];

            if (userIds.length > 0) {
                // Fetch user profiles
                const { data: profileData } = await supabase
                    .from("user_profiles")
                    .select("id, display_name, avatar_url, last_login_at")
                    .in("id", userIds);

                const profileMap = new Map<string, UserProfileRow>();
                (profileData || []).forEach(p => profileMap.set(p.id, p));
                setProfiles(profileMap);
            }

        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to fetch employee metrics");
        } finally {
            setLoading(false);
        }
    }, [dateRange.from, dateRange.to]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

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
        refresh: fetchData,
        totalActions,
        topPerformer,
    };
}
