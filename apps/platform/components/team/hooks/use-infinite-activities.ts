"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { ActivityLogEntry } from "@/lib/activity-logger";
import { RealtimeActivity } from "./use-team-realtime";
import { teamRangeStart, type TeamTimeRange } from "@/lib/team-time-window";

interface UseInfiniteActivitiesOptions {
    pageSize?: number;
    timeRange?: TeamTimeRange;
    userId?: string;
    actionFilter?: string;
}

interface UseInfiniteActivitiesReturn {
    activities: ActivityLogEntry[];
    isLoading: boolean;
    isLoadingMore: boolean;
    hasMore: boolean;
    error: string | null;
    loadMore: () => Promise<void>;
    refresh: () => Promise<void>;
    prependActivity: (activity: RealtimeActivity) => void;
    totalCount: number;
}

/**
 * Hook for infinite scroll pagination of activity logs
 */
export function useInfiniteActivities(
    options: UseInfiniteActivitiesOptions = {}
): UseInfiniteActivitiesReturn {
    const { pageSize = 30, timeRange = "week", userId, actionFilter } = options;

    const [activities, setActivities] = useState<ActivityLogEntry[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [totalCount, setTotalCount] = useState(0);

    const cursorRef = useRef<string | null>(null);
    const loadingRef = useRef(false);

    // Same Baghdad-day window as the leaderboard, so "Today" means the same thing everywhere.
    const getDateFilter = useCallback((): string | null => teamRangeStart(timeRange), [timeRange]);

    // Build query with filters
    const buildQuery = useCallback(() => {
        let query = supabase
            .from("activity_logs")
            .select("*", { count: "exact" })
            .order("created_at", { ascending: false });

        const dateFilter = getDateFilter();
        if (dateFilter) {
            query = query.gte("created_at", dateFilter);
        }

        if (userId) {
            query = query.eq("user_id", userId);
        }

        if (actionFilter && actionFilter !== "all") {
            query = query.eq("action", actionFilter);
        }

        return query;
    }, [getDateFilter, userId, actionFilter]);

    // Initial load
    const loadInitial = useCallback(async () => {
        if (loadingRef.current) return;
        loadingRef.current = true;
        setIsLoading(true);
        setError(null);

        try {
            const query = buildQuery().limit(pageSize);
            const { data, error: queryError, count } = await query;

            if (queryError) {
                throw queryError;
            }

            setActivities(data || []);
            setTotalCount(count || 0);
            setHasMore((data?.length || 0) === pageSize);
            cursorRef.current = data?.length
                ? data[data.length - 1].created_at
                : null;
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load activities");
        } finally {
            setIsLoading(false);
            loadingRef.current = false;
        }
    }, [buildQuery, pageSize]);

    // Load more (pagination)
    const loadMore = useCallback(async () => {
        if (loadingRef.current || !hasMore || !cursorRef.current) return;
        loadingRef.current = true;
        setIsLoadingMore(true);

        try {
            const query = buildQuery()
                .lt("created_at", cursorRef.current)
                .limit(pageSize);

            const { data, error: queryError } = await query;

            if (queryError) {
                throw queryError;
            }

            if (data && data.length > 0) {
                setActivities(prev => [...prev, ...data]);
                cursorRef.current = data[data.length - 1].created_at;
                setHasMore(data.length === pageSize);
            } else {
                setHasMore(false);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load more activities");
        } finally {
            setIsLoadingMore(false);
            loadingRef.current = false;
        }
    }, [buildQuery, hasMore, pageSize]);

    // Refresh (reset and reload)
    const refresh = useCallback(async () => {
        cursorRef.current = null;
        setHasMore(true);
        await loadInitial();
    }, [loadInitial]);

    // Prepend new activity (from real-time subscription)
    const prependActivity = useCallback((activity: RealtimeActivity) => {
        // Check if activity matches current filters
        if (userId && activity.user_id !== userId) return;
        if (actionFilter && actionFilter !== "all" && activity.action !== actionFilter) return;

        const dateFilter = getDateFilter();
        if (dateFilter && new Date(activity.created_at) < new Date(dateFilter)) return;

        // Prepend to list
        setActivities(prev => [{
            ...activity,
            details: activity.details || {},
            ip_address: null,
            user_agent: null,
        } as ActivityLogEntry, ...prev]);
        setTotalCount(prev => prev + 1);
    }, [userId, actionFilter, getDateFilter]);

    // Initial load on mount and when filters change
    useEffect(() => {
        loadInitial();
    }, [loadInitial]);

    return {
        activities,
        isLoading,
        isLoadingMore,
        hasMore,
        error,
        loadMore,
        refresh,
        prependActivity,
        totalCount,
    };
}
