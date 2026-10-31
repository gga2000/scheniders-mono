"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLanguage } from "@/hooks/use-language";
import { useAuth } from "@/components/auth/auth-provider";
import { isAdminRole } from "@/lib/permissions";
import type { TeamTimeRange } from "@/lib/team-time-window";
import { TeamAnalyticsTab } from "@/components/team/team-analytics-tab";
import { EmployeeComparison } from "@/components/team/employee-comparison";
import { GoalTracking } from "@/components/team/goal-tracking";
import { toast } from "@/hooks/use-toast";
import { useTeamRealtime, type RealtimeActivity } from "@/components/team/hooks/use-team-realtime";
import { useInfiniteActivities } from "@/components/team/hooks/use-infinite-activities";
import { useTeamDailyTrend, useTeamLeaderboard } from "@/components/team/hooks/use-team-leaderboard";
import { useTeamRollup } from "@/components/team/hooks/use-team-rollup";
import { TeamStatStrip } from "@/components/team/team-stat-strip";
import { EmployeeDrawer } from "@/components/team/employee-drawer";
import { TeamPageHeader } from "@/components/team/team-page-header";
import { TeamViewTabs, type TeamViewMode } from "@/components/team/team-view-tabs";
import { LiveActivityTicker, useActivityTicker } from "@/components/team/live-activity-ticker";
import { TeamRosterTable } from "@/components/team/team-roster-table";
import { TeamAccessDenied } from "@/components/team/team-access-denied";
import { TeamActivityFeed } from "@/components/team/team-activity-feed";
import { Skeleton } from "@scheniders/ui/skeletons";

function isUserOnline(lastLogin: string | null): boolean {
    if (!lastLogin) return false;
    return new Date(lastLogin).getTime() > Date.now() - 15 * 60 * 1000;
}

export default function TeamPage() {
    const { role, isLoading: authLoading, tenantId } = useAuth();
    const isAdmin = isAdminRole(role);
    const { t } = useLanguage();

    const [timeRange, setTimeRange] = useState<TeamTimeRange>("week");
    const [viewMode, setViewMode] = useState<TeamViewMode>("team");
    const [refreshing, setRefreshing] = useState(false);
    const [selectedEmployeeIndex, setSelectedEmployeeIndex] = useState<number | null>(null);
    const [actionFilter, setActionFilter] = useState("all");
    const ticker = useActivityTicker();

    const showLoadError = useCallback(() => {
        toast({ title: t("team.page.errorTitle"), description: t("team.page.errorDesc"), variant: "error" });
    }, [t]);

    const { leaderboard, previousTotals, loading, updatedAt: leaderboardUpdatedAt, refetch: fetchLeaderboard } = useTeamLeaderboard({
        timeRange,
        tenantId,
        enabled: isAdmin && !authLoading,
        onError: showLoadError,
    });

    // Realtime callback reads the latest fetch through a ref so the subscription stays stable.
    const fetchLeaderboardRef = useRef(fetchLeaderboard);
    useEffect(() => {
        fetchLeaderboardRef.current = fetchLeaderboard;
    }, [fetchLeaderboard]);

    // Infinite Activities (Step 2)
    const infiniteActivities = useInfiniteActivities({
        timeRange,
        pageSize: 30,
        actionFilter,
    });

    const { prependActivity } = infiniteActivities;
    const { push: pushTicker } = ticker;

    // Real-time subscription
    const { isConnected, activeUserIds, lastActivity } = useTeamRealtime({
        onNewActivity: useCallback((activity: RealtimeActivity) => {
            prependActivity(activity);
            fetchLeaderboardRef.current?.();

            const userName = activity.user_email?.split("@")[0] || t("team.goals.formerMember");
            const actionLabel = t(`team.timeline.${activity.action.replace("order.", "").replace("user.", "").replace("customer.", "").replace("settings.", "")}`) || activity.action;
            const entitySuffix = activity.entity_id ? ` #${activity.entity_id.slice(-6)}` : "";
            pushTicker({
                id: activity.id,
                message: `${userName} ${actionLabel}${entitySuffix}`,
                timestamp: new Date(activity.created_at),
            });
        }, [prependActivity, pushTicker, t]),
        enabled: isAdmin && !authLoading,
    });

    // Stats with trends — uses real previous-period totals from DB.
    const teamStats = useMemo(() => {
        const current = {
            totalActions: leaderboard.reduce((sum, e) => sum + e.total_actions, 0),
            ordersCreated: leaderboard.reduce((sum, e) => sum + e.orders_created, 0),
            statusChanges: leaderboard.reduce((sum, e) => sum + e.status_changes, 0),
            ordersPrinted: leaderboard.reduce((sum, e) => sum + e.orders_printed, 0),
        };

        const makeStat = (currentVal: number, prev: number) => ({
            current: currentVal,
            // Null trend when there's no baseline (e.g. "all time" or prev period had zero).
            trend: prev > 0 ? Math.round(((currentVal - prev) / prev) * 100) : null,
        });

        return {
            totalActions: makeStat(current.totalActions, previousTotals.totalActions),
            ordersCreated: makeStat(current.ordersCreated, previousTotals.ordersCreated),
            statusChanges: makeStat(current.statusChanges, previousTotals.statusChanges),
            ordersPrinted: makeStat(current.ordersPrinted, previousTotals.ordersPrinted),
        };
    }, [leaderboard, previousTotals]);

    // Insights charts are counted in the database; only fetched once the tab is opened.
    const rollup = useTeamRollup({ timeRange, tenantId, enabled: isAdmin && !authLoading && viewMode === "insights", onError: showLoadError });

    const { trend, refetchTrend } = useTeamDailyTrend({ tenantId, enabled: isAdmin && !authLoading, onError: showLoadError });
    const actionsTrend = useMemo(() => trend.map((d) => ({ day: d.day, value: d.totalActions })), [trend]);

    // Employee Data Adapter
    const employeesAdapter = useMemo(() => {
        return leaderboard.map(emp => ({
            userId: emp.user_id,
            email: emp.user_email,
            displayName: emp.display_name,
            avatarUrl: emp.avatar_url,
            role: emp.role,
            isOnline: activeUserIds.has(emp.user_id) || isUserOnline(emp.last_login_at),
            lastLoginAt: emp.last_login_at,
            totalActions: emp.total_actions,
            ordersCreated: emp.orders_created,
            statusChanges: emp.status_changes,
            ordersPrinted: emp.orders_printed,
            ordersEdited: emp.orders_edited,
            logins: emp.logins,
        }));
    }, [leaderboard, activeUserIds]);

    // The feed names people the way the roster does: display name first, then email.
    const resolveActorName = useCallback((entry: { user_id: string | null; user_email: string | null }) => {
        const m = entry.user_id ? leaderboard.find((e) => e.user_id === entry.user_id) : undefined;
        if (m?.display_name) return m.display_name;
        return entry.user_email ? entry.user_email.split("@")[0] : null;
    }, [leaderboard]);

    // Selected employee for drawer (Step 5)
    const selectedEmployee = selectedEmployeeIndex !== null ? employeesAdapter[selectedEmployeeIndex] : null;

    const handleNavigateEmployee = useCallback((direction: "prev" | "next") => {
        setSelectedEmployeeIndex(prev => {
            if (prev === null) return null;
            if (direction === "prev" && prev > 0) return prev - 1;
            if (direction === "next" && prev < employeesAdapter.length - 1) return prev + 1;
            return prev;
        });
    }, [employeesAdapter.length]);

    // Check if an activity is "new" (arrived within last 3 seconds)
    const newActivityTimestamps = useRef<Map<string, number>>(new Map());

    useEffect(() => {
        if (lastActivity) {
            newActivityTimestamps.current.set(lastActivity.id, Date.now());
            // Clean up old entries
            const now = Date.now();
            newActivityTimestamps.current.forEach((ts, id) => {
                if (now - ts > 3000) newActivityTimestamps.current.delete(id);
            });
        }
    }, [lastActivity]);

    const isNewActivity = useCallback((activityId: string) => {
        const ts = newActivityTimestamps.current.get(activityId);
        return ts ? Date.now() - ts < 3000 : false;
    }, []);

    // Loading: render page chrome with skeletons in-place (no full-screen spinner)
    const isInitialLoading = authLoading || loading;

    if (!authLoading && !isAdmin) return <TeamAccessDenied />;

    return (
        <div className="min-h-screen px-4 py-5 sm:p-6 max-w-7xl mx-auto space-y-6 pb-24">
            <TeamPageHeader
                isConnected={isConnected}
                refreshing={refreshing}
                onRefresh={() => {
                    setRefreshing(true);
                    Promise.all([fetchLeaderboard(), refetchTrend(), infiniteActivities.refresh(), ...(viewMode === "insights" ? [rollup.refetch()] : [])])
                        .catch(showLoadError)
                        .finally(() => setRefreshing(false));
                }}
                timeRange={timeRange}
                onTimeRangeChange={setTimeRange}
            />

            {/* Live Activity Ticker (Step 7) */}
            <LiveActivityTicker notifications={ticker.notifications} />

            <TeamViewTabs value={viewMode} onChange={setViewMode} />

            {/* Content Area */}
            {isInitialLoading ? (
                <div className="space-y-6" aria-busy="true" aria-live="polite">
                    <Skeleton className="h-[104px] rounded-2xl" />
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <Skeleton className="lg:col-span-2 h-[420px] rounded-3xl" />
                        <Skeleton className="h-[420px] rounded-3xl" />
                    </div>
                </div>
            ) : (
            <AnimatePresence mode="wait">
                {viewMode === "team" && (
                    <motion.div
                        key="team"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="space-y-6"
                    >
                        <TeamStatStrip
                            range={timeRange}
                            totalActions={teamStats.totalActions}
                            ordersCreated={teamStats.ordersCreated}
                            statusChanges={teamStats.statusChanges}
                            ordersPrinted={teamStats.ordersPrinted}
                            actionsByDay={actionsTrend}
                        />

                        {/* Roster + live feed */}
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            <div className="lg:col-span-2">
                                <TeamRosterTable
                                    members={leaderboard}
                                    activeUserIds={activeUserIds}
                                    now={leaderboardUpdatedAt}
                                    onSelect={(userId) => {
                                        const index = employeesAdapter.findIndex((e) => e.userId === userId);
                                        if (index >= 0) setSelectedEmployeeIndex(index);
                                    }}
                                />
                            </div>

                            {/* Activity Feed (Step 4 + Step 8) */}
                            <div className="lg:col-span-1">
                                <TeamActivityFeed
                                    feed={infiniteActivities}
                                    actionFilter={actionFilter}
                                    onActionFilterChange={setActionFilter}
                                    isNew={isNewActivity}
                                    resolveName={resolveActorName}
                                />
                            </div>
                        </div>
                    </motion.div>
                )}

                {viewMode === "insights" && (
                    <motion.div
                        key="insights"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="space-y-6"
                    >
                        <TeamAnalyticsTab range={timeRange} insights={rollup.insights} loading={rollup.loading} failed={rollup.failed} />
                        {employeesAdapter.length >= 2 ? (
                            <EmployeeComparison employees={employeesAdapter} />
                        ) : (
                            <p className="text-center py-10 text-[#6B6B6B] dark:text-gray-400">{t("team.comparison.notEnough")}</p>
                        )}
                    </motion.div>
                )}

                {viewMode === "goals" && (
                    <motion.div
                        key="goals"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                    >
                        <GoalTracking employees={employeesAdapter} />
                    </motion.div>
                )}
            </AnimatePresence>
            )}

            {/* Employee Drawer (Step 5) */}
            {selectedEmployee && (
                <EmployeeDrawer
                    employee={selectedEmployee}
                    activities={infiniteActivities.activities}
                    isOpen={selectedEmployeeIndex !== null}
                    onClose={() => setSelectedEmployeeIndex(null)}
                    onNavigate={handleNavigateEmployee}
                    hasPrev={selectedEmployeeIndex !== null && selectedEmployeeIndex > 0}
                    hasNext={selectedEmployeeIndex !== null && selectedEmployeeIndex < employeesAdapter.length - 1}
                />
            )}
        </div>
    );
}
