"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLanguage } from "@/hooks/use-language";
import {
    Trophy,
    Users,
    Clock,
    RefreshCw,
    Lock,
    Crown,
    Medal,
    Award,
    LayoutGrid,
    BarChart3,
    GitCompare,
    Target,
    Settings2,
} from "lucide-react";
import { z } from "zod";
import { baghdadDayKey, baghdadDayStart } from "@/lib/order-window";
import { supabase } from "@/lib/supabase";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";
import { useAuth } from "@/components/auth/auth-provider";
import { isAdminRole } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { TeamAnalyticsTab } from "@/components/team/team-analytics-tab";
import { EmployeeComparison } from "@/components/team/employee-comparison";
import { GoalTracking } from "@/components/team/goal-tracking";
import { PastelCard } from "@/components/team/shared-pastel-components";
import { TeamMemberCard } from "@/components/team/team-member-card";
import { AssignmentRulesTab } from "@/components/team/assignment-rules-tab";
import { toast } from "@/hooks/use-toast";
import { EmployeeStats } from "@/lib/team-types";
import { useTeamRealtime, type RealtimeActivity } from "@/components/team/hooks/use-team-realtime";
import { useInfiniteActivities } from "@/components/team/hooks/use-infinite-activities";
import { HeroStatsBanner } from "@/components/team/hero-stats-banner";
import { ActivityTimeline } from "@/components/team/activity-timeline";
import { EmployeeDrawer } from "@/components/team/employee-drawer";
import { Skeleton } from "@scheniders/ui/skeletons";

type TimeRange = "today" | "week" | "month" | "all";
type ViewMode = "overview" | "analytics" | "comparison" | "goals" | "rules";

// Action filter options
const ACTION_FILTERS = [
    { value: "all", labelKey: "team.filters.all" },
    { value: "order.create", labelKey: "team.filters.orders" },
    { value: "order.status_change", labelKey: "team.filters.statusChanges" },
    { value: "order.print", labelKey: "team.filters.print" },
    { value: "order.edit", labelKey: "team.filters.edit" },
    { value: "user.login", labelKey: "team.filters.login" },
];

// Live Indicator
function LiveIndicator({ isConnected }: { isConnected: boolean }) {
    const { t } = useLanguage();
    return (
        <div className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold",
            isConnected
                ? "bg-[#E8F8E0] text-green-700 dark:bg-green-500/20 dark:text-green-400"
                : "bg-[#FCEEF1] text-rose-700 dark:bg-rose-500/20 dark:text-rose-400"
        )}>
            <span className="relative flex h-2 w-2">
                {isConnected && (
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75" />
                )}
                <span className={cn(
                    "relative inline-flex rounded-full h-2 w-2",
                    isConnected ? "bg-green-500" : "bg-rose-500"
                )} />
            </span>
            {isConnected ? t("team.page.live") : t("team.page.offline")}
        </div>
    );
}

// Live Activity Ticker notification
interface TickerNotification {
    id: string;
    message: string;
    timestamp: Date;
}

function LiveActivityTicker({ notifications }: { notifications: TickerNotification[] }) {
    const { language } = useLanguage();
    if (notifications.length === 0) return null;

    return (
        <div
            className="relative overflow-hidden rounded-2xl"
            role="status"
            aria-live="polite"
            aria-atomic="false"
        >
            <AnimatePresence mode="popLayout">
                {notifications.map((notif) => (
                    <motion.div
                        key={notif.id}
                        initial={{ opacity: 0, y: -20, height: 0 }}
                        animate={{ opacity: 1, y: 0, height: "auto" }}
                        exit={{ opacity: 0, x: 100, height: 0 }}
                        transition={{ type: "spring", damping: 25, stiffness: 300 }}
                        className="mb-2"
                    >
                        <div className="flex items-center gap-3 px-4 py-2.5 bg-white/80 dark:bg-[#1A1A1A]/80 backdrop-blur-xl border border-[#E8E4DC] dark:border-white/10 rounded-xl shadow-sm">
                            <span className="relative flex h-2 w-2 shrink-0">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                            </span>
                            <p className="text-sm text-[#1E1E1E] dark:text-white flex-1">
                                {notif.message}
                            </p>
                            <span className="text-[10px] text-[#9A9A9A] dark:text-gray-500 shrink-0">
                                {formatDistanceToNow(notif.timestamp, { addSuffix: true, locale: language === "ar" ? ar : undefined })}
                            </span>
                        </div>
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>
    );
}

// Top Performer Podium (Compact Style)
function TopPerformerPodium({ performers }: { performers: EmployeeStats[] }) {
    const { t } = useLanguage();
    const top3 = performers.slice(0, 3);
    if (top3.length === 0) return null;

    const podiumConfig = [
        { color: "from-[#FBE38E] to-[#FDF5D4] dark:from-amber-500/30 dark:to-amber-500/10", ring: "ring-[#FBE38E] dark:ring-amber-500/40", icon: Crown },
        { color: "from-[#E5E7EB] to-[#F3F4F6] dark:from-gray-600/30 dark:to-gray-600/10", ring: "ring-gray-300 dark:ring-gray-500/40", icon: Medal },
        { color: "from-[#F4C7CF] to-[#FCEEF1] dark:from-rose-500/30 dark:to-rose-500/10", ring: "ring-[#F4C7CF] dark:ring-rose-500/40", icon: Award },
    ];

    const displayOrder = [top3[1], top3[0], top3[2]].filter(Boolean); // 2nd, 1st, 3rd

    return (
        <div className="relative py-4">
            <div className="flex items-stretch justify-center gap-4">
                {displayOrder.map((emp) => {
                    const originalIndex = top3.findIndex(p => p.user_id === emp.user_id);
                    const config = podiumConfig[originalIndex];

                    return (
                        <motion.div
                            key={emp.user_id}
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ type: "spring" }}
                            className="relative flex-1 max-w-[200px]"
                        >
                            <div className={cn(
                                "relative p-4 rounded-3xl h-full flex flex-col items-center",
                                "bg-gradient-to-br",
                                config.color,
                                "ring-2",
                                config.ring,
                                "shadow-md dark:shadow-xl"
                            )}>
                                <div className={cn(
                                    "absolute -top-3",
                                    "w-8 h-8 rounded-full bg-white dark:bg-[#1A1A1A] flex items-center justify-center",
                                    "shadow-sm border border-white dark:border-[#1A1A1A]"
                                )}>
                                    <config.icon className={cn(
                                        "w-4 h-4",
                                        originalIndex === 0 ? "text-amber-600" : originalIndex === 1 ? "text-gray-500" : "text-rose-500"
                                    )} />
                                </div>

                                <div className="w-16 h-16 mt-3 rounded-2xl overflow-hidden bg-white dark:bg-[#1A1A1A] flex items-center justify-center border-2 border-white dark:border-[#1A1A1A] shadow-sm">
                                    {emp.avatar_url ? (
                                        <img src={emp.avatar_url} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                        <span className="text-xl font-bold text-[#1E1E1E] dark:text-white">
                                            {(emp.display_name || emp.user_email)?.[0]?.toUpperCase()}
                                        </span>
                                    )}
                                </div>

                                <div className="mt-3 text-center">
                                    <p className="font-bold text-[#1E1E1E] dark:text-white truncate max-w-[120px] text-sm">
                                        {emp.display_name || emp.user_email?.split("@")[0]}
                                    </p>
                                    <p className={cn(
                                        "text-xl font-bold",
                                        originalIndex === 0 ? "text-amber-700 dark:text-amber-400" : originalIndex === 1 ? "text-gray-600 dark:text-gray-300" : "text-rose-600 dark:text-rose-400"
                                    )}>
                                        {emp.total_actions}
                                    </p>
                                    <p className="text-[10px] text-[#6B6B6B] dark:text-gray-400">{t("team.stats.sessionLabel")}</p>
                                </div>
                            </div>
                        </motion.div>
                    );
                })}
            </div>
        </div>
    );
}

// Helper functions
function isUserOnline(lastLogin: string | null): boolean {
    if (!lastLogin) return false;
    return new Date(lastLogin).getTime() > Date.now() - 15 * 60 * 1000;
}

// Access Denied
function AccessDenied() {
    const { t } = useLanguage();
    return (
        <div className="min-h-screen flex items-center justify-center p-6">
            <PastelCard className="p-12 text-center max-w-md" variant="pink">
                <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-white dark:bg-[#1A1A1A] flex items-center justify-center shadow-md">
                    <Lock className="w-10 h-10 text-rose-500" />
                </div>
                <h1 className="text-2xl font-bold text-[#1E1E1E] dark:text-white mb-2">{t("team.page.accessDenied")}</h1>
                <p className="text-[#6B6B6B] dark:text-gray-400 mb-6">{t("team.page.adminOnly")}</p>
                <a
                    href="/dashboard"
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-[#1E1E1E] dark:bg-white text-white dark:text-[#1E1E1E] font-bold hover:bg-[#2D2D2D] dark:hover:bg-gray-100 transition-colors"
                >
                    {t("team.page.backToDashboard")}
                </a>
            </PastelCard>
        </div>
    );
}

// bigint counts come back from PostgREST as numbers; validate the RPC boundary.
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

// ============================================
// MAIN PAGE COMPONENT
// ============================================

export default function TeamPage() {
    const { role, isLoading: authLoading, tenantId } = useAuth();
    const isAdmin = isAdminRole(role);
    const { t } = useLanguage();

    // State
    const [timeRange, setTimeRange] = useState<TimeRange>("week");
    const [viewMode, setViewMode] = useState<ViewMode>("overview");
    const [leaderboard, setLeaderboard] = useState<EmployeeStats[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [teamViewMode, setTeamViewMode] = useState<'grid' | 'list'>('grid');
    const [selectedEmployeeIndex, setSelectedEmployeeIndex] = useState<number | null>(null);
    const [actionFilter, setActionFilter] = useState("all");
    const [tickerNotifications, setTickerNotifications] = useState<TickerNotification[]>([]);
    // Previous-period totals for real trend deltas (replaces the old * 0.85 placeholder).
    const [previousTotals, setPreviousTotals] = useState({
        totalActions: 0,
        ordersCreated: 0,
        statusChanges: 0,
        ordersPrinted: 0,
    });

    // Refs for stable callbacks in useTeamRealtime
    const fetchLeaderboardRef = useRef<(() => Promise<void>) | undefined>(undefined);

    // Current-period start as ISO (null = all time).
    const getDateFilter = useCallback((range: TimeRange): string | null => {
        const now = new Date();
        switch (range) {
            case "today": return new Date(baghdadDayStart(baghdadDayKey())).toISOString();
            case "week": now.setDate(now.getDate() - 7); return now.toISOString();
            case "month": now.setMonth(now.getMonth() - 1); return now.toISOString();
            case "all": return null;
        }
    }, []);

    // Previous-period window of the same length, used for trend comparison.
    const getPreviousWindow = useCallback((range: TimeRange): { start: string; end: string } | null => {
        const start = new Date();
        const end = new Date();
        switch (range) {
            case "today": {
                const todayStart = baghdadDayStart(baghdadDayKey());
                return {
                    start: new Date(todayStart - 24 * 60 * 60 * 1000).toISOString(),
                    end: new Date(todayStart).toISOString(),
                };
            }
            case "week":
                start.setDate(start.getDate() - 14);
                end.setDate(end.getDate() - 7);
                return { start: start.toISOString(), end: end.toISOString() };
            case "month":
                start.setMonth(start.getMonth() - 2);
                end.setMonth(end.getMonth() - 1);
                return { start: start.toISOString(), end: end.toISOString() };
            case "all":
                return null;
        }
    }, []);

    // Infinite Activities (Step 2)
    const infiniteActivities = useInfiniteActivities({
        timeRange,
        pageSize: 30,
        actionFilter,
    });

    // Real-time subscription (Step 1)
    const { isConnected, activeUserIds, lastActivity } = useTeamRealtime({
        onNewActivity: useCallback((activity: RealtimeActivity) => {
            infiniteActivities.prependActivity(activity);
            fetchLeaderboardRef.current?.();

            // Add ticker notification (Step 7)
            const userName = activity.user_email?.split("@")[0] || "User";
            const actionLabel = t(`team.timeline.${activity.action.replace('order.', '').replace('user.', '').replace('customer.', '').replace('settings.', '')}`) || activity.action;
            const entitySuffix = activity.entity_id ? ` #${activity.entity_id.slice(-6)}` : "";

            const notification: TickerNotification = {
                id: activity.id,
                message: `${userName} ${actionLabel}${entitySuffix}`,
                timestamp: new Date(activity.created_at),
            };

            setTickerNotifications(prev => [notification, ...prev].slice(0, 3));

            // Auto-dismiss after 5 seconds
            setTimeout(() => {
                setTickerNotifications(prev => prev.filter(n => n.id !== notification.id));
            }, 5000);
        }, [infiniteActivities.prependActivity]),
        enabled: isAdmin && !authLoading,
    });

    // Fetch leaderboard (aggregated in the database, tenant- and admin-scoped)
    const fetchLeaderboard = useCallback(async () => {
        const { data, error } = await supabase.rpc("team_leaderboard", {
            p_since: getDateFilter(timeRange) ?? undefined,
        });
        const parsed = leaderboardRowsSchema.safeParse(data);
        if (error || !parsed.success) {
            toast({ title: t("team.page.errorTitle"), description: t("team.page.errorDesc"), variant: "error" });
            setLeaderboard([]);
            return;
        }

        // The roster is every active member of this store, not just people with activity in the
        // window: a manager needs to see who did nothing today. Role is the per-store role.
        const { data: members } = tenantId
            ? await supabase
                .from("tenant_members")
                .select("user_id, role")
                .eq("tenant_id", tenantId)
                .eq("status", "active")
            : { data: null };
        const memberRoleById = new Map<string, string>((members ?? []).map((m) => [m.user_id, m.role]));

        const rowById = new Map(parsed.data.map((r) => [r.user_id, r]));
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
            const { data: profiles } = await supabase
                .from("user_profiles")
                .select("id, email, display_name, avatar_url, role, is_active, last_login_at")
                .in("id", userIds);
            profiles?.forEach((p) => profileById.set(p.id, p));
        }

        const stats: EmployeeStats[] = userIds.map((userId) => {
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
        });
        setLeaderboard(stats.sort((a, b) => b.total_actions - a.total_actions));

        // Previous-period totals for trend deltas.
        const prev = getPreviousWindow(timeRange);
        if (!prev) {
            setPreviousTotals({ totalActions: 0, ordersCreated: 0, statusChanges: 0, ordersPrinted: 0 });
            return;
        }
        const { data: totals } = await supabase.rpc("team_period_totals", {
            p_start: prev.start,
            p_end: prev.end,
        });
        const row = periodTotalsSchema.safeParse(totals).data?.[0];
        setPreviousTotals({
            totalActions: row?.total_actions ?? 0,
            ordersCreated: row?.orders_created ?? 0,
            statusChanges: row?.status_changes ?? 0,
            ordersPrinted: row?.orders_printed ?? 0,
        });
    }, [timeRange, tenantId, getDateFilter, getPreviousWindow]);

    // Keep ref in sync
    useEffect(() => {
        fetchLeaderboardRef.current = fetchLeaderboard;
    }, [fetchLeaderboard]);

    // Initial fetch
    useEffect(() => {
        if (authLoading) return;
        if (!isAdmin) return;

        const fetchData = async () => {
            setLoading(true);
            try {
                await fetchLeaderboard();
            } catch {
                toast({ title: t("team.page.errorTitle"), description: t("team.page.errorDesc"), variant: "error" });
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [fetchLeaderboard, isAdmin, authLoading]);

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

    // Sparkline data (last 7 days aggregated from activities)
    const sparklineData = useMemo(() => {
        const days: { day: string; value: number }[] = [];
        for (let i = 6; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split("T")[0];
            const count = infiniteActivities.activities.filter(a =>
                a.created_at.startsWith(dateStr)
            ).length;
            days.push({ day: dateStr, value: count });
        }
        return days;
    }, [infiniteActivities.activities]);

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

    if (!authLoading && !isAdmin) return <AccessDenied />;

    const tabs: { id: ViewMode; label: string; icon: React.ElementType }[] = [
        { id: "overview", label: t("team.tabs.overview"), icon: LayoutGrid },
        { id: "analytics", label: t("team.tabs.analytics"), icon: BarChart3 },
        { id: "comparison", label: t("team.tabs.comparison"), icon: GitCompare },
        { id: "goals", label: t("team.tabs.goals"), icon: Target },
        { id: "rules", label: t("team.tabs.rules"), icon: Settings2 },
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
                            Promise.all([fetchLeaderboard(), infiniteActivities.refresh()]).then(() => setRefreshing(false));
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
                        {(["today", "week", "month", "all"] as TimeRange[]).map((range) => (
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
            <LiveActivityTicker notifications={tickerNotifications} />

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
                            sparklineData={sparklineData}
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
                                <PastelCard className="overflow-hidden">
                                    <div className="p-4 border-b border-[#E8E4DC] dark:border-white/10">
                                        <div className="flex items-center justify-between mb-3">
                                            <div className="flex items-center gap-2">
                                                <div className="w-8 h-8 rounded-xl bg-[#E5F6F3] dark:bg-teal-500/15 flex items-center justify-center">
                                                    <Clock className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                                                </div>
                                                <h2 className="font-bold text-[#1E1E1E] dark:text-white">{t("team.activities.latest")}</h2>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {infiniteActivities.totalCount > 0 && (
                                                    <span className="text-xs text-[#9A9A9A] dark:text-gray-500">
                                                        {infiniteActivities.totalCount}
                                                    </span>
                                                )}
                                                <span className="relative flex h-2.5 w-2.5">
                                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                                                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
                                                </span>
                                            </div>
                                        </div>

                                        {/* Action Filter Chips (Step 8) */}
                                        <div className="flex flex-wrap gap-1.5">
                                            {ACTION_FILTERS.map((filter) => (
                                                <button
                                                    key={filter.value}
                                                    onClick={() => setActionFilter(filter.value)}
                                                    className={cn(
                                                        "px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all",
                                                        actionFilter === filter.value
                                                            ? "bg-[#1E1E1E] dark:bg-white text-white dark:text-[#1E1E1E] shadow-sm"
                                                            : "bg-gray-100 dark:bg-white/5 text-[#6B6B6B] dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-white/10"
                                                    )}
                                                >
                                                    {t(filter.labelKey)}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="max-h-[600px] overflow-y-auto p-4">
                                        {infiniteActivities.isLoading ? (
                                            <div className="space-y-3">
                                                {Array.from({ length: 5 }).map((_, i) => (
                                                    <div key={i} className="flex gap-3 animate-pulse">
                                                        <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-800 shrink-0" />
                                                        <div className="flex-1">
                                                            <div className="h-4 w-3/4 bg-gray-100 dark:bg-gray-800 rounded mb-2" />
                                                            <div className="h-3 w-1/2 bg-gray-50 dark:bg-gray-800/50 rounded" />
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : infiniteActivities.activities.length === 0 ? (
                                            <div className="flex flex-col items-center justify-center py-12 text-center">
                                                <div className="w-14 h-14 rounded-2xl bg-[#F5F0E8] dark:bg-white/5 flex items-center justify-center mb-3">
                                                    <Clock className="w-6 h-6 text-[#9A9A9A] dark:text-gray-500" />
                                                </div>
                                                <p className="text-sm font-semibold text-[#1E1E1E] dark:text-white">
                                                    {t("team.activities.emptyTitle")}
                                                </p>
                                                <p className="text-xs text-[#6B6B6B] dark:text-gray-400 mt-1 max-w-[220px]">
                                                    {actionFilter === "all"
                                                        ? t("team.activities.emptyAll")
                                                        : t("team.activities.emptyFiltered")}
                                                </p>
                                                {actionFilter !== "all" && (
                                                    <button
                                                        onClick={() => setActionFilter("all")}
                                                        className="mt-3 px-3 py-1.5 rounded-lg bg-[#1E1E1E] dark:bg-white text-white dark:text-[#1E1E1E] text-xs font-semibold"
                                                    >
                                                        {t("team.activities.clearFilter")}
                                                    </button>
                                                )}
                                            </div>
                                        ) : (
                                            <>
                                                <ActivityTimeline
                                                    activities={infiniteActivities.activities}
                                                    groupBy="hour"
                                                    showUserInfo={true}
                                                    maxItems={50}
                                                    isNew={isNewActivity}
                                                />

                                                {/* Load More */}
                                                {infiniteActivities.hasMore && (
                                                    <motion.button
                                                        onClick={infiniteActivities.loadMore}
                                                        disabled={infiniteActivities.isLoadingMore}
                                                        whileHover={{ scale: 1.02 }}
                                                        whileTap={{ scale: 0.98 }}
                                                        className="w-full mt-4 py-3 rounded-xl bg-gray-100 dark:bg-white/5 text-sm font-semibold text-[#6B6B6B] dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-white/10 transition-colors"
                                                    >
                                                        {infiniteActivities.isLoadingMore ? (
                                                            <RefreshCw className="w-4 h-4 animate-spin mx-auto" />
                                                        ) : (
                                                            t("team.activities.loadMore")
                                                        )}
                                                    </motion.button>
                                                )}
                                            </>
                                        )}
                                    </div>
                                </PastelCard>
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

                {viewMode === "rules" && (
                    <motion.div
                        key="rules"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                    >
                        <AssignmentRulesTab employees={leaderboard.map(emp => ({
                            id: emp.user_id,
                            name: emp.display_name || emp.user_email?.split("@")[0] || "",
                            avatarUrl: emp.avatar_url,
                        }))} />
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
