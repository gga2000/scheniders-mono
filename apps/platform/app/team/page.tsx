"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    Trophy,
    Activity,
    Users,
    TrendingUp,
    Clock,
    Package,
    Printer,
    RefreshCw,
    Lock,
    Zap,
    Crown,
    Medal,
    Award,
    ChevronRight,
    LayoutGrid,
    BarChart3,
    GitCompare,
    Target,
    ArrowUpRight,
    ArrowDownRight,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";
import { useAuth } from "@/components/auth/auth-provider";
import { cn } from "@/lib/utils";
import { ActivityLogEntry } from "@/lib/activity-logger";
import { TeamAnalyticsTab } from "@/components/team/team-analytics-tab";
import { EmployeeComparison } from "@/components/team/employee-comparison";
import { GoalTracking } from "@/components/team/goal-tracking";
import { PastelCard, StatCard, pastelColors, PastelColor } from "@/components/team/shared-pastel-components";

// Types
interface EmployeeStats {
    user_id: string;
    user_email: string;
    display_name: string | null;
    avatar_url: string | null;
    role: string;
    is_active: boolean;
    last_login_at: string | null;
    total_actions: number;
    status_changes: number;
    orders_created: number;
    orders_printed: number;
    orders_edited: number;
    logins: number;
}

type TimeRange = "today" | "week" | "month" | "all";
type ViewMode = "overview" | "analytics" | "comparison" | "goals";

// Live Indicator
function LiveIndicator({ isConnected }: { isConnected: boolean }) {
    return (
        <div className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold",
            isConnected
                ? "bg-[#E8F8E0] text-green-700"
                : "bg-[#FCEEF1] text-rose-700"
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

// Enhanced Employee Card
function EmployeeCard({
    employee,
    rank,
    isActive,
    onClick,
    delay = 0,
}: {
    employee: EmployeeStats;
    rank: number;
    isActive: boolean;
    onClick: () => void;
    delay?: number;
}) {
    const online = isUserOnline(employee.last_login_at);
    const rankColors = {
        1: { bg: "bg-[#FBE38E]", icon: Crown, label: "🥇" },
        2: { bg: "bg-[#E5E7EB]", icon: Medal, label: "🥈" },
        3: { bg: "bg-[#F4C7CF]", icon: Award, label: "🥉" },
    };
    const config = rankColors[rank as keyof typeof rankColors];

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay, duration: 0.4 }}
            onClick={onClick}
            className="group cursor-pointer"
        >
            <PastelCard
                className={cn(
                    "p-5",
                    isActive && "ring-2 ring-[#FBE38E]"
                )}
            >
                {/* Rank Badge */}
                {rank <= 3 && config && (
                    <div className="absolute -top-2 -right-2 z-20">
                        <motion.div
                            initial={{ scale: 0, rotate: -180 }}
                            animate={{ scale: 1, rotate: 0 }}
                            transition={{ delay: delay + 0.2, type: "spring" }}
                            className={cn(
                                "w-8 h-8 rounded-full flex items-center justify-center shadow-md",
                                config.bg
                            )}
                        >
                            <config.icon className="w-4 h-4 text-[#1E1E1E]" />
                        </motion.div>
                    </div>
                )}

                <div className="flex items-start gap-4">
                    {/* Avatar */}
                    <div className="relative">
                        <motion.div
                            className={cn(
                                "w-14 h-14 rounded-2xl overflow-hidden",
                                "bg-gradient-to-br from-[#B8E8E0] to-[#E4C1F9]",
                                "flex items-center justify-center",
                                "border-2 border-white",
                                "shadow-md"
                            )}
                            whileHover={{ scale: 1.05 }}
                        >
                            {employee.avatar_url ? (
                                <img
                                    src={employee.avatar_url}
                                    alt=""
                                    className="w-full h-full object-cover"
                                />
                            ) : (
                                <span className="text-xl font-bold text-[#1E1E1E]">
                                    {(employee.display_name || employee.user_email)?.[0]?.toUpperCase()}
                                </span>
                            )}
                        </motion.div>

                        {/* Online indicator */}
                        <div className={cn(
                            "absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white",
                            online ? "bg-green-500" : "bg-gray-400"
                        )}>
                            {online && (
                                <span className="absolute inset-0 rounded-full bg-green-500 animate-ping opacity-50" />
                            )}
                        </div>
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                            <p className="font-bold text-[#1E1E1E] truncate">
                                {employee.display_name || employee.user_email?.split("@")[0]}
                            </p>
                            {employee.role === "admin" && (
                                <span className="shrink-0 px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase bg-[#FBE38E] text-amber-800">
                                    مسؤول
                                </span>
                            )}
                        </div>
                        <p className="text-xs text-[#6B6B6B] truncate">{employee.user_email}</p>
                    </div>
                </div>

                {/* Stats Row */}
                <div className="mt-4 pt-4 border-t border-[#E8E4DC] flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5">
                            <div className="w-7 h-7 rounded-xl bg-[#FDF5D4] flex items-center justify-center">
                                <Activity className="w-3.5 h-3.5 text-amber-600" />
                            </div>
                            <span className="text-sm font-bold text-[#1E1E1E]">{employee.total_actions}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <div className="w-7 h-7 rounded-xl bg-[#E8F8E0] flex items-center justify-center">
                                <Package className="w-3.5 h-3.5 text-green-600" />
                            </div>
                            <span className="text-sm font-bold text-[#1E1E1E]">{employee.orders_created}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <div className="w-7 h-7 rounded-xl bg-[#F5E8FC] flex items-center justify-center">
                                <RefreshCw className="w-3.5 h-3.5 text-purple-600" />
                            </div>
                            <span className="text-sm font-bold text-[#1E1E1E]">{employee.status_changes}</span>
                        </div>
                    </div>

                    <ChevronRight className="w-5 h-5 text-[#9A9A9A] group-hover:text-[#1E1E1E] group-hover:translate-x-1 transition-all" />
                </div>
            </PastelCard>
        </motion.div>
    );
}

// Top Performer Podium (Pastel Style)
function TopPerformerPodium({ performers }: { performers: EmployeeStats[] }) {
    const top3 = performers.slice(0, 3);
    if (top3.length === 0) return null;

    const podiumConfig = [
        { order: 1, height: "h-32", y: 0, color: "from-[#FBE38E] to-[#FDF5D4]", ring: "ring-[#FBE38E]", icon: Crown },
        { order: 0, height: "h-24", y: 32, color: "from-[#E5E7EB] to-[#F3F4F6]", ring: "ring-gray-300", icon: Medal },
        { order: 2, height: "h-20", y: 48, color: "from-[#F4C7CF] to-[#FCEEF1]", ring: "ring-[#F4C7CF]", icon: Award },
    ];

    return (
        <div className="relative py-8">
            {/* Trophy decoration */}
            <motion.div
                animate={{ y: [0, -5, 0] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="absolute top-2 left-1/2 -translate-x-1/2"
            >
                <div className="w-14 h-14 rounded-2xl bg-[#FBE38E] flex items-center justify-center shadow-lg">
                    <Trophy className="w-7 h-7 text-amber-700" />
                </div>
            </motion.div>

            <div className="relative flex items-end justify-center gap-4 pt-16">
                {top3.map((emp, index) => {
                    const config = podiumConfig[index];

                    return (
                        <motion.div
                            key={emp.user_id}
                            initial={{ opacity: 0, y: 50 }}
                            animate={{ opacity: 1, y: config.y }}
                            transition={{ delay: 0.2 + index * 0.1, type: "spring" }}
                            className="relative"
                            style={{ order: config.order }}
                        >
                            <div className={cn(
                                "relative p-5 rounded-3xl",
                                "bg-gradient-to-br",
                                config.color,
                                "ring-2",
                                config.ring,
                                "shadow-lg"
                            )}>
                                {/* Rank badge */}
                                <div className={cn(
                                    "absolute -top-3 left-1/2 -translate-x-1/2",
                                    "w-10 h-10 rounded-full bg-white flex items-center justify-center",
                                    "shadow-md border-2 border-white"
                                )}>
                                    <config.icon className={cn(
                                        "w-5 h-5",
                                        index === 0 ? "text-amber-600" : index === 1 ? "text-gray-500" : "text-rose-500"
                                    )} />
                                </div>

                                {/* Avatar */}
                                <div className="w-20 h-20 mx-auto mt-2 rounded-2xl overflow-hidden bg-white flex items-center justify-center border-2 border-white shadow-md">
                                    {emp.avatar_url ? (
                                        <img src={emp.avatar_url} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                        <span className="text-2xl font-bold text-[#1E1E1E]">
                                            {(emp.display_name || emp.user_email)?.[0]?.toUpperCase()}
                                        </span>
                                    )}
                                </div>

                                {/* Info */}
                                <div className="mt-4 text-center">
                                    <p className="font-bold text-[#1E1E1E] truncate max-w-[100px]">
                                        {emp.display_name || emp.user_email?.split("@")[0]}
                                    </p>
                                    <p className={cn(
                                        "text-2xl font-bold mt-1",
                                        index === 0 ? "text-amber-700" : index === 1 ? "text-gray-600" : "text-rose-600"
                                    )}>
                                        {emp.total_actions}
                                    </p>
                                    <p className="text-xs text-[#6B6B6B]">نشاط</p>
                                </div>
                            </div>
                        </motion.div>
                    );
                })}
            </div>
        </div>
    );
}

// Activity Item (Pastel)
function ActivityItem({ activity, isNew }: { activity: ActivityLogEntry; isNew?: boolean }) {
    const actionConfig: Record<string, { icon: React.ElementType; bg: string; text: string; label: string }> = {
        "order.create": { icon: Package, bg: "bg-[#E8F8E0]", text: "text-green-600", label: "طلب جديد" },
        "order.status_change": { icon: RefreshCw, bg: "bg-[#FDF5D4]", text: "text-amber-600", label: "تغيير حالة" },
        "order.edit": { icon: Activity, bg: "bg-[#F5E8FC]", text: "text-purple-600", label: "تعديل" },
        "order.print": { icon: Printer, bg: "bg-[#E5F6F3]", text: "text-teal-600", label: "طباعة" },
        "user.login": { icon: Users, bg: "bg-[#F3F4F6]", text: "text-gray-600", label: "دخول" },
    };

    const config = actionConfig[activity.action] || { icon: Activity, bg: "bg-gray-100", text: "text-gray-600", label: activity.action };
    const Icon = config.icon;

    return (
        <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className={cn(
                "flex items-center gap-3 p-3 rounded-2xl",
                "hover:bg-[#FAF8F5] transition-colors",
                isNew && "bg-[#FDF5D4]"
            )}
        >
            <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center", config.bg)}>
                <Icon className={cn("w-4 h-4", config.text)} />
            </div>

            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-[#1E1E1E] truncate">
                        {activity.user_email?.split("@")[0]}
                    </span>
                    <span className={cn("text-xs px-2 py-0.5 rounded-lg", config.bg, config.text)}>
                        {config.label}
                    </span>
                </div>
                <p className="text-xs text-[#9A9A9A]">
                    {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true, locale: ar })}
                </p>
            </div>
        </motion.div>
    );
}

// Helper functions
function isUserOnline(lastLogin: string | null): boolean {
    if (!lastLogin) return false;
    return new Date(lastLogin).getTime() > Date.now() - 15 * 60 * 1000;
}

// Access Denied
function AccessDenied() {
    return (
        <div className="min-h-screen flex items-center justify-center p-6">
            <PastelCard className="p-12 text-center max-w-md" variant="pink">
                <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-white flex items-center justify-center shadow-md">
                    <Lock className="w-10 h-10 text-rose-500" />
                </div>
                <h1 className="text-2xl font-bold text-[#1E1E1E] mb-2">الوصول مقيّد</h1>
                <p className="text-[#6B6B6B] mb-6">هذه الصفحة متاحة للمسؤولين فقط.</p>
                <a
                    href="/dashboard"
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-[#1E1E1E] text-white font-bold hover:bg-[#2D2D2D] transition-colors"
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

    // State
    const [timeRange, setTimeRange] = useState<TimeRange>("week");
    const [viewMode, setViewMode] = useState<ViewMode>("overview");
    const [leaderboard, setLeaderboard] = useState<EmployeeStats[]>([]);
    const [activities, setActivities] = useState<ActivityLogEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [isConnected, setIsConnected] = useState(true);
    const [newActivityIds, setNewActivityIds] = useState<Set<string>>(new Set());

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

    // Fetch leaderboard
    const fetchLeaderboard = useCallback(async () => {
        const dateFilter = getDateFilter(timeRange);

        let query = supabase
            .from("activity_logs")
            .select("user_id, user_email, action")
            .not("user_id", "is", null);

        if (dateFilter) query = query.gte("created_at", dateFilter);

        const { data, error } = await query;
        if (error) return;

        const statsMap = new Map<string, EmployeeStats>();

        data?.forEach((log) => {
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

    // Fetch activities
    const fetchActivities = useCallback(async () => {
        const dateFilter = getDateFilter(timeRange);

        let query = supabase
            .from("activity_logs")
            .select("*")
            .order("created_at", { ascending: false })
            .limit(50);

        if (dateFilter) query = query.gte("created_at", dateFilter);

        const { data, error } = await query;
        if (!error && data) setActivities(data);
    }, [timeRange, getDateFilter]);

    // Initial fetch
    useEffect(() => {
        if (!isAdmin && !authLoading) return;

        const fetchData = async () => {
            setLoading(true);

            // Failsafe: Force loading false after 5 seconds to prevent infinite hang
            const timeoutId = setTimeout(() => {
                setLoading(false);
            }, 5000);

            try {
                await Promise.all([fetchLeaderboard(), fetchActivities()]);
            } catch (error) {
                console.error("TeamPage: Error during data fetch:", error);
            } finally {
                clearTimeout(timeoutId);
                setLoading(false);
            }
        };
        fetchData();
    }, [fetchLeaderboard, fetchActivities, isAdmin, authLoading]);

    // Real-time subscription
    useEffect(() => {
        const channel = supabase
            .channel("team-activities")
            .on("postgres_changes", { event: "INSERT", schema: "public", table: "activity_logs" }, (payload) => {
                const newActivity = payload.new as ActivityLogEntry;
                setActivities((prev) => [newActivity, ...prev.slice(0, 49)]);
                setNewActivityIds((prev) => new Set([...prev, newActivity.id]));
                setTimeout(() => {
                    setNewActivityIds((prev) => {
                        const next = new Set(prev);
                        next.delete(newActivity.id);
                        return next;
                    });
                }, 3000);
                fetchLeaderboard();
            })
            .subscribe((status) => {
                setIsConnected(status === "SUBSCRIBED");
            });

        return () => { supabase.removeChannel(channel); };
    }, [fetchLeaderboard]);

    // Stats
    const stats = useMemo(() => ({
        totalActions: leaderboard.reduce((sum, e) => sum + e.total_actions, 0),
        ordersCreated: leaderboard.reduce((sum, e) => sum + e.orders_created, 0),
        statusChanges: leaderboard.reduce((sum, e) => sum + e.status_changes, 0),
        ordersPrinted: leaderboard.reduce((sum, e) => sum + e.orders_printed, 0),
        onlineCount: leaderboard.filter((e) => isUserOnline(e.last_login_at)).length,
    }), [leaderboard]);

    // Employee Data Adapter for children components
    const employeesAdapter = useMemo(() => {
        return leaderboard.map(emp => ({
            userId: emp.user_id,
            email: emp.user_email,
            displayName: emp.display_name,
            avatarUrl: emp.avatar_url,
            isOnline: isUserOnline(emp.last_login_at),
            totalActions: emp.total_actions,
            ordersCreated: emp.orders_created,
            statusChanges: emp.status_changes,
            ordersPrinted: emp.orders_printed,
            ordersEdited: emp.orders_edited,
            logins: emp.logins
        }));
    }, [leaderboard]);

    // Loading
    if (authLoading || loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="text-center"
                >
                    <div className="w-16 h-16 rounded-2xl bg-[#FBE38E] flex items-center justify-center shadow-lg mx-auto">
                        <motion.div
                            animate={{ rotate: 360 }}
                            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                        >
                            <RefreshCw className="w-8 h-8 text-amber-700" />
                        </motion.div>
                    </div>
                    <p className="text-[#1E1E1E] font-medium mt-4">جاري التحميل...</p>
                </motion.div>
            </div>
        );
    }

    if (!isAdmin) return <AccessDenied />;

    const tabs: { id: ViewMode; label: string; icon: any }[] = [
        { id: "overview", label: "نظرة عامة", icon: LayoutGrid },
        { id: "analytics", label: "التحليلات", icon: BarChart3 },
        { id: "comparison", label: "المقارنة", icon: GitCompare },
        { id: "goals", label: "الأهداف", icon: Target },
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
                            <h1 className="text-2xl font-bold text-[#1E1E1E]">
                                لوحة مراقبة الفريق
                            </h1>
                            <LiveIndicator isConnected={isConnected} />
                        </div>
                        <p className="text-[#6B6B6B] mt-0.5">تتبع أداء الموظفين والنشاطات بشكل مفصّل</p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <motion.button
                        onClick={() => { setRefreshing(true); Promise.all([fetchLeaderboard(), fetchActivities()]).then(() => setRefreshing(false)); }}
                        disabled={refreshing}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        className="p-3 rounded-2xl bg-white border border-[#E8E4DC] hover:shadow-md transition-all"
                    >
                        <RefreshCw className={cn("w-5 h-5 text-[#1E1E1E]", refreshing && "animate-spin")} />
                    </motion.button>

                    <div className="flex bg-white border border-[#E8E4DC] rounded-2xl p-1 shadow-sm">
                        {(["today", "week", "month", "all"] as TimeRange[]).map((range) => (
                            <button
                                key={range}
                                onClick={() => setTimeRange(range)}
                                className={cn(
                                    "px-4 py-2 rounded-xl text-sm font-bold transition-all",
                                    timeRange === range
                                        ? "bg-[#1E1E1E] text-white shadow-md"
                                        : "text-[#6B6B6B] hover:text-[#1E1E1E]"
                                )}
                            >
                                {{ today: "اليوم", week: "الأسبوع", month: "الشهر", all: "الكل" }[range]}
                            </button>
                        ))}
                    </div>
                </div>
            </motion.div>

            {/* View Tabs */}
            <div className="flex justify-center">
                <div className="flex items-center p-1 bg-white border border-[#E8E4DC] rounded-2xl shadow-sm overflow-x-auto max-w-full">
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setViewMode(tab.id)}
                            className={cn(
                                "flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold transition-all whitespace-nowrap",
                                viewMode === tab.id
                                    ? "bg-[#1E1E1E] text-white shadow-md"
                                    : "text-[#6B6B6B] hover:text-[#1E1E1E] hover:bg-[#FAF8F5]"
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
                        {/* Stats Grid */}
                        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                            <StatCard icon={Activity} label="إجمالي النشاطات" value={stats.totalActions} trend={12} color="yellow" delay={0.1} />
                            <StatCard icon={Package} label="طلبات جديدة" value={stats.ordersCreated} trend={8} color="green" delay={0.15} />
                            <StatCard icon={RefreshCw} label="تغييرات الحالة" value={stats.statusChanges} trend={-3} color="mint" delay={0.2} />
                            <StatCard icon={Printer} label="عمليات الطباعة" value={stats.ordersPrinted} trend={5} color="purple" delay={0.25} />

                            {/* Online Count */}
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.3 }}
                            >
                                <PastelCard className="p-5 h-full" variant="green">
                                    <div className="flex items-center gap-3">
                                        <div className="relative">
                                            <div className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center shadow-md">
                                                <Zap className="w-6 h-6 text-green-600" />
                                            </div>
                                            <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-green-500 shadow-md">
                                                <span className="absolute inset-0 rounded-full bg-green-500 animate-ping opacity-75" />
                                            </span>
                                        </div>
                                        <div>
                                            <p className="text-3xl font-bold text-[#1E1E1E]">{stats.onlineCount}</p>
                                            <p className="text-sm text-green-700">متصل الآن</p>
                                        </div>
                                    </div>
                                </PastelCard>
                            </motion.div>
                        </div>

                        {/* Top Performers */}
                        {leaderboard.length > 0 && (
                            <PastelCard className="p-6">
                                <div className="flex items-center gap-3 mb-2">
                                    <div className="w-10 h-10 rounded-xl bg-[#FBE38E] flex items-center justify-center">
                                        <Trophy className="w-5 h-5 text-amber-700" />
                                    </div>
                                    <h2 className="text-xl font-bold text-[#1E1E1E]">أبطال الأسبوع</h2>
                                </div>
                                <TopPerformerPodium performers={leaderboard} />
                            </PastelCard>
                        )}

                        {/* Main Grid */}
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            {/* Employee List */}
                            <div className="lg:col-span-2 space-y-4">
                                <div className="flex items-center justify-between">
                                    <h2 className="text-lg font-bold text-[#1E1E1E] flex items-center gap-2">
                                        <Users className="w-5 h-5 text-purple-600" />
                                        أداء الموظفين
                                    </h2>
                                    <span className="text-sm text-[#6B6B6B]">{leaderboard.length} موظف</span>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {leaderboard.map((employee, index) => (
                                        <EmployeeCard
                                            key={employee.user_id}
                                            employee={employee}
                                            rank={index + 1}
                                            isActive={false}
                                            onClick={() => { }}
                                            delay={0.3 + index * 0.05}
                                        />
                                    ))}
                                </div>
                            </div>

                            {/* Activity Feed */}
                            <div className="lg:col-span-1">
                                <PastelCard className="overflow-hidden">
                                    <div className="p-4 border-b border-[#E8E4DC] flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <div className="w-8 h-8 rounded-xl bg-[#E5F6F3] flex items-center justify-center">
                                                <Clock className="w-4 h-4 text-teal-600" />
                                            </div>
                                            <h2 className="font-bold text-[#1E1E1E]">آخر النشاطات</h2>
                                        </div>
                                        <span className="relative flex h-2.5 w-2.5">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
                                        </span>
                                    </div>

                                    <div className="max-h-[600px] overflow-y-auto p-2">
                                        {activities.length === 0 ? (
                                            <p className="text-center text-[#9A9A9A] py-8">لا توجد نشاطات</p>
                                        ) : (
                                            activities.slice(0, 20).map((activity) => (
                                                <ActivityItem
                                                    key={activity.id}
                                                    activity={activity}
                                                    isNew={newActivityIds.has(activity.id)}
                                                />
                                            ))
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
                        <TeamAnalyticsTab activities={activities} employees={employeesAdapter} />
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
                                <p className="text-[#6B6B6B]">البيانات غير كافية للمقارنة. تحتاج إلى موظفين اثنين على الأقل.</p>
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
        </div>
    );
}
