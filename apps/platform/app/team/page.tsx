"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLanguage } from "@/hooks/use-language";
import {
    Trophy,
    Users,
    RefreshCw,
    LayoutGrid,
    BarChart3,
    GitCompare,
    Target,
} from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { isAdminRole } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import type { TeamTimeRange } from "@/lib/team-time-window";
import { TeamAnalyticsTab } from "@/components/team/team-analytics-tab";
import { EmployeeComparison } from "@/components/team/employee-comparison";
import { GoalTracking } from "@/components/team/goal-tracking";
import { PastelCard } from "@/components/team/shared-pastel-components";
import { TeamMemberCard } from "@/components/team/team-member-card";
import { toast } from "@/hooks/use-toast";
import { useTeamRealtime, type RealtimeActivity } from "@/components/team/hooks/use-team-realtime";
import { useInfiniteActivities } from "@/components/team/hooks/use-infinite-activities";
import { useTeamDailyTrend, useTeamLeaderboard } from "@/components/team/hooks/use-team-leaderboard";
import { HeroStatsBanner } from "@/components/team/hero-stats-banner";
import { EmployeeDrawer } from "@/components/team/employee-drawer";
import { LiveIndicator } from "@/components/team/live-indicator";
import { LiveActivityTicker, useActivityTicker } from "@/components/team/live-activity-ticker";
import { TopPerformerPodium } from "@/components/team/top-performer-podium";
import { TeamAccessDenied } from "@/components/team/team-access-denied";
import { TeamActivityFeed } from "@/components/team/team-activity-feed";
import { Skeleton } from "@scheniders/ui/skeletons";

type ViewMode = "overview" | "analytics" | "comparison" | "goals";

function isUserOnline(lastLogin: string | null): boolean {
    if (!lastLogin) return false;
    return new Date(lastLogin).getTime() > Date.now() - 15 * 60 * 1000;
}

export default function TeamPage() {
    const { role, isLoading: authLoading, tenantId } = useAuth();
    const isAdmin = isAdminRole(role);
    const { t } = useLanguage();

    const [timeRange, setTimeRange] = useState<TeamTimeRange>("week");
    const [viewMode, setViewMode] = useState<ViewMode>("overview");
    const [refreshing, setRefreshing] = useState(false);
    const [teamViewMode, setTeamViewMode] = useState<"grid" | "list">("grid");
    const [selectedEmployeeIndex, setSelectedEmployeeIndex] = useState<number | null>(null);
    const [actionFilter, setActionFilter] = useState("all");
    const ticker = useActivityTicker();

    const showLoadError = useCallback(() => {
        toast({ title: t("team.page.errorTitle"), description: t("team.page.errorDesc"), variant: "error" });
    }, [t]);

    const { leaderboard, previousTotals, loading, refetch: fetchLeaderboard } = useTeamLeaderboard({
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
    const heroStats = useMemo(() => {
        const current = {
            totalActions: leaderboard.reduce((sum, e) => sum + e.total_actions, 0),
            ordersCreated: leaderboard.reduce((sum, e) => sum + e.orders_created, 0),
            statusChanges: leaderboard.reduce((sum, e) => sum + e.status_changes, 0),
            ordersPrinted: leaderboard.reduce((sum, e) => sum + e.orders_printed, 0),
        };

        const makeStat = (currentVal: number, prev: number) => ({
            current: currentVal,
            previous: prev,
            // Null trend when there's no baseline (e.g. "all time" or prev period had zero).
            trend: prev > 0 ? Math.round(((currentVal - prev) / prev) * 100) : null,
        });

        return {
            totalActions: makeStat(current.totalActions, previousTotals.totalActions),
            ordersCreated: makeStat(current.ordersCreated, previousTotals.ordersCreated),
            statusChanges: makeStat(current.statusChanges, previousTotals.statusChanges),
            ordersPrinted: makeStat(current.ordersPrinted, previousTotals.ordersPrinted),
            onlineCount: activeUserIds.size > 0 ? activeUserIds.size : leaderboard.filter(e => isUserOnline(e.last_login_at)).length,
        };
    }, [leaderboard, activeUserIds, previousTotals]);

    const { trend, refetchTrend } = useTeamDailyTrend({ tenantId, enabled: isAdmin && !authLoading, onError: showLoadError });
    const actionsTrend = useMemo(() => trend.map((d) => ({ day: d.day, value: d.totalActions })), [trend]);
    const ordersTrend = useMemo(() => trend.map((d) => ({ day: d.day, value: d.ordersCreated })), [trend]);

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

    const tabs: { id: ViewMode; label: string; icon: React.ElementType }[] = [
        { id: "overview", label: t("team.tabs.overview"), icon: LayoutGrid },
        { id: "analytics", label: t("team.tabs.analytics"), icon: BarChart3 },
        { id: "comparison", label: t("team.tabs.comparison"), icon: GitCompare },
        { id: "goals", label: t("team.tabs.goals"), icon: Target },
    ];

    return (
        <div className="min-h-screen p-6 max-w-7xl mx-auto space-y-8 pb-24">
            {/* Header */}
            <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col lg:flex-row lg:items-center justify-between gap-4"
            >
                <div className="flex items-center gap-4">
                    <motion.div
                        className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#E4C1F9] to-[#F5E8FC] flex items-center justify-center shadow-lg"
                        whileHover={{ scale: 1.05, rotate: 5 }}
                    >
                        <Users className="w-7 h-7 text-purple-600" />
                    </motion.div>
                    <div>
                        <div className="flex items-center gap-3">
                            <h1 className="text-2xl font-bold text-[#1E1E1E] dark:text-white">
                                {t("team.title")}
                            </h1>
                            <LiveIndicator isConnected={isConnected} />
                        </div>
                        <p className="text-[#6B6B6B] dark:text-gray-400 mt-0.5">{t("team.subtitle")}</p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <motion.button
                        onClick={() => {
                            setRefreshing(true);
                            Promise.all([fetchLeaderboard(), refetchTrend(), infiniteActivities.refresh()])
                                .catch(showLoadError)
                                .finally(() => setRefreshing(false));
                        }}
                        disabled={refreshing}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        className="p-3 rounded-2xl bg-white dark:bg-[#1A1A1A] border border-[#E8E4DC] dark:border-white/10 hover:shadow-md transition-all"
                        aria-label={t("team.page.refresh")}
                    >
                        <RefreshCw className={cn("w-5 h-5 text-[#1E1E1E] dark:text-white", refreshing && "animate-spin")} />
                    </motion.button>

                    <div className="flex bg-white dark:bg-[#1A1A1A] border border-[#E8E4DC] dark:border-white/10 rounded-2xl p-1 shadow-sm">
                        {(["today", "week", "month", "all"] as TeamTimeRange[]).map((range) => (
                            <button
                                key={range}
                                onClick={() => setTimeRange(range)}
                                className={cn(
                                    "px-4 py-2 rounded-xl text-sm font-bold transition-all",
                                    timeRange === range
                                        ? "bg-[#1E1E1E] dark:bg-white text-white dark:text-[#1E1E1E] shadow-md"
                                        : "text-[#6B6B6B] dark:text-gray-400 hover:text-[#1E1E1E] dark:hover:text-white"
                                )}
                            >
                                {t(`team.page.${range}`)}
                            </button>
                        ))}
                    </div>
                </div>
            </motion.div>

            {/* Live Activity Ticker (Step 7) */}
            <LiveActivityTicker notifications={ticker.notifications} />

            {/* View Tabs */}
            <div className="flex justify-center">
                <div className="flex items-center p-1 bg-white dark:bg-[#1A1A1A] border border-[#E8E4DC] dark:border-white/10 rounded-2xl shadow-sm overflow-x-auto max-w-full">
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setViewMode(tab.id)}
                            className={cn(
                                "flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold transition-all whitespace-nowrap",
                                viewMode === tab.id
                                    ? "bg-[#1E1E1E] dark:bg-white text-white dark:text-[#1E1E1E] shadow-md"
                                    : "text-[#6B6B6B] dark:text-gray-400 hover:text-[#1E1E1E] dark:hover:text-white hover:bg-[#FAF8F5] dark:hover:bg-white/5"
                            )}
                        >
                            <tab.icon className="w-4 h-4" />
                            <span>{tab.label}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Content Area */}
            {isInitialLoading ? (
                <div className="space-y-8" aria-busy="true" aria-live="polite">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                        {Array.from({ length: 5 }).map((_, i) => (
                            <Skeleton key={i} className="h-32 rounded-2xl" />
                        ))}
                    </div>
                    <div className="bg-[var(--card-bg)] rounded-3xl border border-[var(--card-border)] p-6 space-y-4">
                        <Skeleton className="h-7 w-56 rounded" />
                        <div className="flex items-stretch justify-center gap-4 py-4">
                            {Array.from({ length: 3 }).map((_, i) => (
                                <Skeleton key={i} className="flex-1 max-w-[200px] h-44 rounded-3xl" />
                            ))}
                        </div>
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                            {Array.from({ length: 4 }).map((_, i) => (
                                <Skeleton key={i} className="h-48 rounded-2xl" />
                            ))}
                        </div>
                        <Skeleton className="h-[640px] rounded-2xl" />
                    </div>
                </div>
            ) : (
            <AnimatePresence mode="wait">
                {viewMode === "overview" && (
                    <motion.div
                        key="overview"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="space-y-8"
                    >
                        {/* Hero Stats Banner (Step 3) */}
                        <HeroStatsBanner
                            totalActions={heroStats.totalActions}
                            ordersCreated={heroStats.ordersCreated}
                            statusChanges={heroStats.statusChanges}
                            ordersPrinted={heroStats.ordersPrinted}
                            onlineCount={heroStats.onlineCount}
                            totalEmployees={leaderboard.length}
                            actionsTrend={actionsTrend}
                            ordersTrend={ordersTrend}
                            isLoading={loading}
                        />

                        {/* Top Performers */}
                        {leaderboard.some(e => e.total_actions > 0) && (
                            <PastelCard className="p-6">
                                <div className="flex items-center gap-3 mb-2">
                                    <div className="w-10 h-10 rounded-xl bg-[#FBE38E] dark:bg-amber-500/20 flex items-center justify-center">
                                        <Trophy className="w-5 h-5 text-amber-700 dark:text-amber-400" />
                                    </div>
                                    <h2 className="text-xl font-bold text-[#1E1E1E] dark:text-white">
                                        {t(`team.leaderboard.${timeRange}`)}
                                    </h2>
                                </div>
                                <TopPerformerPodium performers={leaderboard.filter(e => e.total_actions > 0)} />
                            </PastelCard>
                        )}

                        {/* Main Grid */}
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            {/* Employee List */}
                            <div className="lg:col-span-2 space-y-4">
                                <div className="flex items-center justify-between">
                                    <h2 className="text-lg font-bold text-[#1E1E1E] dark:text-white flex items-center gap-2">
                                        <Users className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                                        {t("team.performance.title")}
                                    </h2>
                                    <div className="flex items-center gap-3">
                                        <div className="flex bg-white/50 dark:bg-black/20 border border-gray-200 dark:border-gray-800 rounded-xl p-1 shadow-sm backdrop-blur-sm">
                                            <button
                                                onClick={() => setTeamViewMode('grid')}
                                                aria-label={t("team.performance.grid")}
                                                className={cn(
                                                    "p-1.5 rounded-lg transition-all",
                                                    teamViewMode === 'grid'
                                                        ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900 shadow-md"
                                                        : "text-gray-500 hover:text-gray-900 dark:hover:text-white"
                                                )}
                                            >
                                                <LayoutGrid className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => setTeamViewMode('list')}
                                                aria-label={t("team.performance.list")}
                                                className={cn(
                                                    "p-1.5 rounded-lg transition-all",
                                                    teamViewMode === 'list'
                                                        ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900 shadow-md"
                                                        : "text-gray-500 hover:text-gray-900 dark:hover:text-white"
                                                )}
                                            >
                                                <Users className="w-4 h-4" />
                                            </button>
                                        </div>
                                        <span className="text-sm text-[#6B6B6B] dark:text-gray-400">
                                            {leaderboard.length} {t("team.performance.memberCount")}
                                        </span>
                                    </div>
                                </div>

                                <div className={cn(
                                    "grid gap-4",
                                    teamViewMode === 'grid' ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1"
                                )}>
                                    {leaderboard.map((employee, index) => (
                                        <TeamMemberCard
                                            key={employee.user_id}
                                            employee={employee}
                                            viewMode={teamViewMode}
                                            rank={index + 1}
                                            onClick={() => setSelectedEmployeeIndex(index)}
                                            delay={0.1 + index * 0.05}
                                            isActive={activeUserIds.has(employee.user_id)}
                                        />
                                    ))}
                                </div>
                            </div>

                            {/* Activity Feed (Step 4 + Step 8) */}
                            <div className="lg:col-span-1">
                                <TeamActivityFeed
                                    feed={infiniteActivities}
                                    actionFilter={actionFilter}
                                    onActionFilterChange={setActionFilter}
                                    isNew={isNewActivity}
                                />
                            </div>
                        </div>
                    </motion.div>
                )}

                {viewMode === "analytics" && (
                    <motion.div
                        key="analytics"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                    >
                        <TeamAnalyticsTab activities={infiniteActivities.activities} employees={employeesAdapter} />
                    </motion.div>
                )}

                {viewMode === "comparison" && (
                    <motion.div
                        key="comparison"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                    >
                        {employeesAdapter.length >= 2 ? (
                            <EmployeeComparison employees={employeesAdapter} />
                        ) : (
                            <div className="text-center py-20">
                                <p className="text-[#6B6B6B] dark:text-gray-400">{t("team.comparison.notEnough")}</p>
                            </div>
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
