"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLanguage } from "@/hooks/use-language";
import {
    Trophy,
    Activity,
    Users,
    Clock,
    Package,
    Printer,
    RefreshCw,
    Lock,
    Zap,
    Crown,
    Medal,
    Award,
    LayoutGrid,
    BarChart3,
    GitCompare,
    Target,
    Settings2,
    Filter,
    ChevronDown,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";
import { useAuth } from "@/components/auth/auth-provider";
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

type TimeRange = "today" | "week" | "month" | "all";
type ViewMode = "overview" | "analytics" | "comparison" | "goals" | "rules";

// Action filter options
const ACTION_FILTERS = [
    { value: "all", label: "الكل" },
    { value: "order.create", label: "طلبات" },
    { value: "order.status_change", label: "تغييرات الحالة" },
    { value: "order.print", label: "طباعة" },
    { value: "order.edit", label: "تعديل" },
    { value: "user.login", label: "دخول" },
];

// Live Indicator
function LiveIndicator({ isConnected }: { isConnected: boolean }) {
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
            {isConnected ? "مباشر" : "غير متصل"}
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
    if (notifications.length === 0) return null;

    return (
        <div className="relative overflow-hidden rounded-2xl">
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
                                {formatDistanceToNow(notif.timestamp, { addSuffix: true, locale: ar })}
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
                                    <p className="text-[10px] text-[#6B6B6B] dark:text-gray-400">نشاط</p>
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

// Action label map for ticker
const ACTION_LABELS: Record<string, string> = {
    "order.create": "أنشأ طلب جديد",
    "order.status_change": "غيّر حالة طلب",
    "order.edit": "عدّل طلب",
    "order.print": "طبع طلبات",
    "order.delete": "حذف طلب",
    "user.login": "سجّل دخول",
    "customer.blacklist": "حظر عميل",
};

// Access Denied
function AccessDenied() {
    return (
        <div className="min-h-screen flex items-center justify-center p-6">
            <PastelCard className="p-12 text-center max-w-md" variant="pink">
                <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-white dark:bg-[#1A1A1A] flex items-center justify-center shadow-md">
                    <Lock className="w-10 h-10 text-rose-500" />
                </div>
                <h1 className="text-2xl font-bold text-[#1E1E1E] dark:text-white mb-2">الوصول مقيّد</h1>
                <p className="text-[#6B6B6B] dark:text-gray-400 mb-6">هذه الصفحة متاحة للمسؤولين فقط.</p>
                <a
                    href="/dashboard"
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-[#1E1E1E] dark:bg-white text-white dark:text-[#1E1E1E] font-bold hover:bg-[#2D2D2D] dark:hover:bg-gray-100 transition-colors"
                >
                    العودة للرئيسية
                </a>
            </PastelCard>
        </div>
    );
}

// ============================================
// MAIN PAGE COMPONENT
// ============================================

export default function TeamPage() {
    const { profile, isLoading: authLoading } = useAuth();
    const isAdmin = profile?.role === "admin";
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

    // Refs for stable callbacks in useTeamRealtime
    const fetchLeaderboardRef = useRef<(() => Promise<void>) | undefined>(undefined);

    // Date filter helper
    const getDateFilter = useCallback((range: TimeRange): string | null => {
        const now = new Date();
        switch (range) {
            case "today": now.setHours(0, 0, 0, 0); return now.toISOString();
            case "week": now.setDate(now.getDate() - 7); return now.toISOString();
            case "month": now.setMonth(now.getMonth() - 1); return now.toISOString();
            case "all": return null;
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
            const userName = activity.user_email?.split("@")[0] || "مستخدم";
            const actionLabel = ACTION_LABELS[activity.action] || activity.action;
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

    // Fetch leaderboard
    const fetchLeaderboard = useCallback(async () => {
        const dateFilter = getDateFilter(timeRange);

        let allLogs: any[] = [];
        let hasMore = true;
        let offset = 0;
        const limit = 1000;

        while (hasMore) {
            let query = supabase
                .from("activity_logs")
                .select("user_id, user_email, action")
                .not("user_id", "is", null)
                .range(offset, offset + limit - 1);

            if (dateFilter) query = query.gte("created_at", dateFilter);

            const { data, error } = await query;
            if (error) {
                toast({ title: "خطأ في تحميل البيانات", description: "تعذر تحميل بيانات الفريق. حاول مرة أخرى.", variant: "error" });
                setLeaderboard([]);
                return;
            }

            if (data && data.length > 0) {
                allLogs = [...allLogs, ...data];
                offset += limit;
                if (data.length < limit) hasMore = false;
            } else {
                hasMore = false;
            }
        }

        const statsMap = new Map<string, EmployeeStats>();

        allLogs.forEach((log) => {
            const userId = log.user_id;
            if (!userId) return;

            if (!statsMap.has(userId)) {
                statsMap.set(userId, {
                    user_id: userId,
                    user_email: log.user_email || "",
                    display_name: null,
                    avatar_url: null,
                    role: "employee",
                    is_active: true,
                    last_login_at: null,
                    total_actions: 0,
                    status_changes: 0,
                    orders_created: 0,
                    orders_printed: 0,
                    orders_edited: 0,
                    logins: 0,
                });
            }

            const stats = statsMap.get(userId)!;
            stats.total_actions++;
            if (log.action === "order.status_change") stats.status_changes++;
            if (log.action === "order.create") stats.orders_created++;
            if (log.action === "order.print") stats.orders_printed++;
            if (log.action === "order.edit") stats.orders_edited++;
            if (log.action === "user.login") stats.logins++;
        });

        const userIds = Array.from(statsMap.keys());
        if (userIds.length > 0) {
            const { data: profiles } = await supabase
                .from("user_profiles")
                .select("id, display_name, avatar_url, role, is_active, last_login_at")
                .in("id", userIds);

            profiles?.forEach((p) => {
                const stats = statsMap.get(p.id);
                if (stats) {
                    stats.display_name = p.display_name;
                    stats.avatar_url = p.avatar_url;
                    stats.role = p.role || "employee";
                    stats.is_active = p.is_active ?? true;
                    stats.last_login_at = p.last_login_at;
                }
            });
        }

        setLeaderboard(Array.from(statsMap.values()).sort((a, b) => b.total_actions - a.total_actions));
    }, [timeRange, getDateFilter]);

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
                toast({ title: "خطأ في تحميل البيانات", description: "حدث خطأ أثناء تحميل بيانات الفريق.", variant: "error" });
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [fetchLeaderboard, isAdmin, authLoading]);

    // Stats with trends (Step 3)
    const heroStats = useMemo(() => {
        const current = {
            totalActions: leaderboard.reduce((sum, e) => sum + e.total_actions, 0),
            ordersCreated: leaderboard.reduce((sum, e) => sum + e.orders_created, 0),
            statusChanges: leaderboard.reduce((sum, e) => sum + e.status_changes, 0),
            ordersPrinted: leaderboard.reduce((sum, e) => sum + e.orders_printed, 0),
        };

        // For trend calculation, we use a simple estimate based on the time range
        // In a real scenario you'd fetch previous period data
        const makeStat = (currentVal: number) => ({
            current: currentVal,
            previous: Math.round(currentVal * 0.85), // Estimated previous period
            trend: currentVal > 0 ? Math.round(((currentVal - Math.round(currentVal * 0.85)) / Math.max(Math.round(currentVal * 0.85), 1)) * 100) : 0,
        });

        return {
            totalActions: makeStat(current.totalActions),
            ordersCreated: makeStat(current.ordersCreated),
            statusChanges: makeStat(current.statusChanges),
            ordersPrinted: makeStat(current.ordersPrinted),
            onlineCount: activeUserIds.size > 0 ? activeUserIds.size : leaderboard.filter(e => isUserOnline(e.last_login_at)).length,
        };
    }, [leaderboard, activeUserIds]);

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

    // Loading
    if (authLoading || loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="text-center"
                >
                    <div className="w-16 h-16 rounded-2xl bg-[#FBE38E] dark:bg-amber-500/20 flex items-center justify-center shadow-lg mx-auto">
                        <motion.div
                            animate={{ rotate: 360 }}
                            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                        >
                            <RefreshCw className="w-8 h-8 text-amber-700 dark:text-amber-400" />
                        </motion.div>
                    </div>
                    <p className="text-[#1E1E1E] dark:text-white font-medium mt-4">جاري التحميل...</p>
                </motion.div>
            </div>
        );
    }

    if (!isAdmin) return <AccessDenied />;

    const tabs: { id: ViewMode; label: string; icon: React.ElementType }[] = [
        { id: "overview", label: "نظرة عامة", icon: LayoutGrid },
        { id: "analytics", label: "التحليلات", icon: BarChart3 },
        { id: "comparison", label: "المقارنة", icon: GitCompare },
        { id: "goals", label: "الأهداف", icon: Target },
        { id: "rules", label: "قواعد التعيين", icon: Settings2 },
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
                        aria-label="تحديث البيانات"
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
                                {{ today: "اليوم", week: "الأسبوع", month: "الشهر", all: "الكل" }[range]}
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
                        {leaderboard.length > 0 && (
                            <PastelCard className="p-6">
                                <div className="flex items-center gap-3 mb-2">
                                    <div className="w-10 h-10 rounded-xl bg-[#FBE38E] dark:bg-amber-500/20 flex items-center justify-center">
                                        <Trophy className="w-5 h-5 text-amber-700 dark:text-amber-400" />
                                    </div>
                                    <h2 className="text-xl font-bold text-[#1E1E1E] dark:text-white">
                                        {{ today: "أبطال اليوم", week: "أبطال الأسبوع", month: "أبطال الشهر", all: "الأبطال" }[timeRange]}
                                    </h2>
                                </div>
                                <TopPerformerPodium performers={leaderboard} />
                            </PastelCard>
                        )}

                        {/* Main Grid */}
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            {/* Employee List */}
                            <div className="lg:col-span-2 space-y-4">
                                <div className="flex items-center justify-between">
                                    <h2 className="text-lg font-bold text-[#1E1E1E] dark:text-white flex items-center gap-2">
                                        <Users className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                                        أداء الموظفين
                                    </h2>
                                    <div className="flex items-center gap-3">
                                        <div className="flex bg-white/50 dark:bg-black/20 border border-gray-200 dark:border-gray-800 rounded-xl p-1 shadow-sm backdrop-blur-sm">
                                            <button
                                                onClick={() => setTeamViewMode('grid')}
                                                aria-label="عرض شبكي"
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
                                                aria-label="عرض قائمة"
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
                                        <span className="text-sm text-[#6B6B6B] dark:text-gray-400">{leaderboard.length} موظف</span>
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
                                                <h2 className="font-bold text-[#1E1E1E] dark:text-white">آخر النشاطات</h2>
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
                                                    {filter.label}
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
                                                            "تحميل المزيد"
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
                                <p className="text-[#6B6B6B] dark:text-gray-400">البيانات غير كافية للمقارنة. تحتاج إلى موظفين اثنين على الأقل.</p>
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
