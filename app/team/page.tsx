"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    Trophy,
    Activity,
    Users,
    TrendingUp,
    Clock,
    CheckCircle2,
    Package,
    Printer,
    ArrowRight,
    Calendar,
    Medal,
    Shield,
    ShieldCheck,
    Eye,
    RefreshCw,
    Search,
    Filter,
    X,
    ChevronDown,
    BarChart3,
    Zap,
    AlertTriangle,
    LogIn,
    Edit,
    Trash2,
    UserCheck,
    Settings,
    ExternalLink,
    ArrowUpRight,
    ArrowDownRight,
    Timer,
    Target,
    Star,
    Crown,
    Flame,
    Award,
    Lock
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";
import { useAuth } from "@/components/auth/auth-provider";
import { cn } from "@/lib/utils";

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

interface ActivityLogEntry {
    id: string;
    user_id: string | null;
    user_email: string | null;
    action: string;
    entity_type: string | null;
    entity_id: string | null;
    details: Record<string, unknown>;
    created_at: string;
}

type TimeRange = "today" | "week" | "month" | "all";

// Action configuration with enhanced styling
const actionConfig: Record<string, {
    icon: React.ElementType;
    gradient: string;
    label: string;
    labelAr: string;
}> = {
    "order.create": {
        icon: Package,
        gradient: "from-emerald-500/20 to-emerald-600/10",
        label: "Created order",
        labelAr: "أنشأ طلب جديد"
    },
    "order.status_change": {
        icon: RefreshCw,
        gradient: "from-amber-500/20 to-amber-600/10",
        label: "Changed status",
        labelAr: "غيّر حالة طلب"
    },
    "order.edit": {
        icon: Edit,
        gradient: "from-violet-500/20 to-violet-600/10",
        label: "Edited order",
        labelAr: "عدّل طلب"
    },
    "order.print": {
        icon: Printer,
        gradient: "from-blue-500/20 to-blue-600/10",
        label: "Printed orders",
        labelAr: "طبع طلبات"
    },
    "order.delete": {
        icon: Trash2,
        gradient: "from-rose-500/20 to-rose-600/10",
        label: "Deleted order",
        labelAr: "حذف طلب"
    },
    "order.assign": {
        icon: UserCheck,
        gradient: "from-cyan-500/20 to-cyan-600/10",
        label: "Assigned order",
        labelAr: "عيّن طلب"
    },
    "customer.blacklist": {
        icon: AlertTriangle,
        gradient: "from-red-500/20 to-red-600/10",
        label: "Blacklisted customer",
        labelAr: "حظر عميل"
    },
    "user.login": {
        icon: LogIn,
        gradient: "from-green-500/20 to-green-600/10",
        label: "Logged in",
        labelAr: "سجّل دخول"
    },
    "settings.update": {
        icon: Settings,
        gradient: "from-slate-500/20 to-slate-600/10",
        label: "Updated settings",
        labelAr: "حدّث الإعدادات"
    },
};

// Helper to check if user is online (active in last 15 minutes)
function isUserOnline(lastLogin: string | null): boolean {
    if (!lastLogin) return false;
    const fifteenMinutesAgo = Date.now() - 15 * 60 * 1000;
    return new Date(lastLogin).getTime() > fifteenMinutesAgo;
}

// Animated Counter Component
function AnimatedCounter({ value, duration = 1000 }: { value: number; duration?: number }) {
    const [displayValue, setDisplayValue] = useState(0);

    useEffect(() => {
        const startTime = Date.now();
        const startValue = displayValue;
        const diff = value - startValue;

        const animate = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
            setDisplayValue(Math.round(startValue + diff * eased));

            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };

        requestAnimationFrame(animate);
    }, [value, duration]);

    return <>{displayValue.toLocaleString()}</>;
}

// Stats Card Component
function StatsCard({
    icon: Icon,
    label,
    value,
    trend,
    gradient,
    delay = 0
}: {
    icon: React.ElementType;
    label: string;
    value: number;
    trend?: { value: number; positive: boolean };
    gradient: string;
    delay?: number;
}) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay, duration: 0.4, ease: "easeOut" }}
            className={cn(
                "relative overflow-hidden rounded-2xl border border-white/10",
                "bg-gradient-to-br backdrop-blur-xl p-5",
                gradient
            )}
        >
            {/* Glassmorphism overlay */}
            <div className="absolute inset-0 bg-white/5 backdrop-blur-sm" />

            {/* Decorative circles */}
            <div className="absolute -top-4 -right-4 w-24 h-24 rounded-full bg-white/5 blur-xl" />
            <div className="absolute -bottom-4 -left-4 w-16 h-16 rounded-full bg-white/5 blur-xl" />

            <div className="relative z-10">
                <div className="flex items-center justify-between mb-3">
                    <div className="w-10 h-10 rounded-xl bg-white/10 backdrop-blur-sm flex items-center justify-center">
                        <Icon className="w-5 h-5 text-foreground" />
                    </div>
                    {trend && (
                        <div className={cn(
                            "flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full",
                            trend.positive
                                ? "bg-emerald-500/20 text-emerald-600"
                                : "bg-rose-500/20 text-rose-600"
                        )}>
                            {trend.positive ? (
                                <ArrowUpRight className="w-3 h-3" />
                            ) : (
                                <ArrowDownRight className="w-3 h-3" />
                            )}
                            {Math.abs(trend.value)}%
                        </div>
                    )}
                </div>
                <p className="text-3xl font-bold text-foreground mb-1">
                    <AnimatedCounter value={value} />
                </p>
                <p className="text-sm text-foreground/70">{label}</p>
            </div>
        </motion.div>
    );
}

// Employee Card Component
function EmployeeCard({
    employee,
    rank,
    onClick,
    delay = 0
}: {
    employee: EmployeeStats;
    rank: number;
    onClick: () => void;
    delay?: number;
}) {
    const online = isUserOnline(employee.last_login_at);

    const getRankStyle = () => {
        switch (rank) {
            case 1: return { icon: Crown, color: "text-yellow-500", bg: "bg-yellow-500/10" };
            case 2: return { icon: Medal, color: "text-slate-400", bg: "bg-slate-400/10" };
            case 3: return { icon: Award, color: "text-orange-500", bg: "bg-orange-500/10" };
            default: return null;
        }
    };

    const rankStyle = getRankStyle();

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay, duration: 0.3 }}
            onClick={onClick}
            className={cn(
                "relative group cursor-pointer",
                "bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl",
                "rounded-2xl border border-border/50",
                "p-5 transition-all duration-300",
                "hover:shadow-xl hover:shadow-primary/5 hover:border-primary/30",
                "hover:scale-[1.02]"
            )}
        >
            {/* Rank Badge */}
            {rankStyle && (
                <div className={cn(
                    "absolute -top-2 -right-2 w-8 h-8 rounded-full flex items-center justify-center",
                    rankStyle.bg, "border border-white/20 shadow-lg"
                )}>
                    <rankStyle.icon className={cn("w-4 h-4", rankStyle.color)} />
                </div>
            )}

            <div className="flex items-start gap-4">
                {/* Avatar with Online Indicator */}
                <div className="relative">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center text-primary font-bold text-lg overflow-hidden border border-primary/10">
                        {employee.avatar_url ? (
                            <img
                                src={employee.avatar_url}
                                alt={employee.display_name || ""}
                                className="w-full h-full object-cover"
                            />
                        ) : (
                            (employee.display_name || employee.user_email)?.[0]?.toUpperCase() || "?"
                        )}
                    </div>
                    {/* Online Indicator */}
                    <div className={cn(
                        "absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white dark:border-zinc-900",
                        online ? "bg-emerald-500" : "bg-zinc-300 dark:bg-zinc-600"
                    )}>
                        {online && (
                            <span className="absolute inset-0 rounded-full bg-emerald-500 animate-ping opacity-75" />
                        )}
                    </div>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        <p className="font-semibold text-foreground truncate">
                            {employee.display_name || employee.user_email?.split("@")[0]}
                        </p>
                        <span className={cn(
                            "shrink-0 px-2 py-0.5 rounded-md text-[10px] font-medium uppercase tracking-wide",
                            employee.role === "admin"
                                ? "bg-amber-500/10 text-amber-600 border border-amber-500/20"
                                : employee.role === "employee"
                                    ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
                                    : "bg-blue-500/10 text-blue-600 border border-blue-500/20"
                        )}>
                            {employee.role === "admin" ? "مسؤول" : employee.role === "employee" ? "موظف" : "مشاهد"}
                        </span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate mb-2">
                        {employee.user_email}
                    </p>

                    {/* Quick Stats */}
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5">
                            <Activity className="w-3.5 h-3.5 text-primary" />
                            <span className="text-sm font-medium">{employee.total_actions}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <Package className="w-3.5 h-3.5 text-emerald-500" />
                            <span className="text-sm font-medium">{employee.orders_created}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <RefreshCw className="w-3.5 h-3.5 text-amber-500" />
                            <span className="text-sm font-medium">{employee.status_changes}</span>
                        </div>
                    </div>
                </div>

                {/* Progress Ring */}
                <div className="flex flex-col items-center">
                    <div className="relative w-12 h-12">
                        <svg className="w-full h-full transform -rotate-90">
                            <circle
                                cx="24"
                                cy="24"
                                r="20"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="4"
                                className="text-zinc-200 dark:text-zinc-700"
                            />
                            <motion.circle
                                cx="24"
                                cy="24"
                                r="20"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="4"
                                strokeLinecap="round"
                                className="text-primary"
                                initial={{ strokeDasharray: "0 126" }}
                                animate={{
                                    strokeDasharray: `${Math.min(employee.total_actions / 50 * 126, 126)} 126`
                                }}
                                transition={{ delay: delay + 0.3, duration: 0.8 }}
                            />
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center">
                            <Flame className="w-4 h-4 text-orange-500" />
                        </div>
                    </div>
                </div>
            </div>

            {/* Last Active */}
            {employee.last_login_at && (
                <div className="mt-4 pt-3 border-t border-border/50 flex items-center justify-between text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                        <Clock className="w-3 h-3" />
                        آخر نشاط: {formatDistanceToNow(new Date(employee.last_login_at), { addSuffix: true, locale: ar })}
                    </span>
                    <span className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 text-primary">
                        عرض التفاصيل
                        <ExternalLink className="w-3 h-3" />
                    </span>
                </div>
            )}
        </motion.div>
    );
}

// Employee Detail Modal
function EmployeeDetailModal({
    employee,
    activities,
    onClose
}: {
    employee: EmployeeStats;
    activities: ActivityLogEntry[];
    onClose: () => void;
}) {
    const [activeTab, setActiveTab] = useState<"activity" | "stats">("activity");
    const employeeActivities = activities.filter(a => a.user_id === employee.user_id);

    // Group activities by day
    const groupedActivities = useMemo(() => {
        const groups: Record<string, ActivityLogEntry[]> = {};
        employeeActivities.forEach(activity => {
            const date = new Date(activity.created_at).toLocaleDateString("ar-IQ");
            if (!groups[date]) groups[date] = [];
            groups[date].push(activity);
        });
        return groups;
    }, [employeeActivities]);

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={onClose}
        >
            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                onClick={e => e.stopPropagation()}
                className="bg-background border border-border rounded-3xl w-full max-w-2xl max-h-[85vh] overflow-hidden shadow-2xl"
            >
                {/* Header */}
                <div className="relative p-6 border-b border-border bg-gradient-to-br from-primary/5 to-transparent">
                    <button
                        onClick={onClose}
                        className="absolute top-4 left-4 p-2 rounded-xl hover:bg-muted transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>

                    <div className="flex items-center gap-4">
                        <div className="relative">
                            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center text-primary font-bold text-2xl overflow-hidden border-2 border-primary/10">
                                {employee.avatar_url ? (
                                    <img src={employee.avatar_url} alt="" className="w-full h-full object-cover" />
                                ) : (
                                    (employee.display_name || employee.user_email)?.[0]?.toUpperCase()
                                )}
                            </div>
                            <div className={cn(
                                "absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 border-background",
                                isUserOnline(employee.last_login_at) ? "bg-emerald-500" : "bg-zinc-400"
                            )} />
                        </div>
                        <div>
                            <h2 className="text-2xl font-bold">
                                {employee.display_name || employee.user_email?.split("@")[0]}
                            </h2>
                            <p className="text-muted-foreground">{employee.user_email}</p>
                            <div className="flex items-center gap-2 mt-2">
                                <span className={cn(
                                    "px-2.5 py-1 rounded-lg text-xs font-medium",
                                    employee.role === "admin"
                                        ? "bg-amber-500/10 text-amber-600"
                                        : "bg-emerald-500/10 text-emerald-600"
                                )}>
                                    {employee.role === "admin" ? "مسؤول" : "موظف"}
                                </span>
                                {isUserOnline(employee.last_login_at) && (
                                    <span className="px-2.5 py-1 rounded-lg text-xs font-medium bg-emerald-500/10 text-emerald-600 flex items-center gap-1">
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                        متصل الآن
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Quick Stats */}
                    <div className="grid grid-cols-4 gap-3 mt-6">
                        {[
                            { icon: Activity, value: employee.total_actions, label: "إجمالي", color: "text-primary" },
                            { icon: Package, value: employee.orders_created, label: "طلبات", color: "text-emerald-500" },
                            { icon: RefreshCw, value: employee.status_changes, label: "تغييرات", color: "text-amber-500" },
                            { icon: Printer, value: employee.orders_printed, label: "طباعة", color: "text-blue-500" },
                        ].map((stat, i) => (
                            <div key={i} className="bg-white/50 dark:bg-zinc-800/50 rounded-xl p-3 text-center backdrop-blur-sm">
                                <stat.icon className={cn("w-5 h-5 mx-auto mb-1", stat.color)} />
                                <p className="text-xl font-bold">{stat.value}</p>
                                <p className="text-[10px] text-muted-foreground">{stat.label}</p>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-border">
                    <button
                        onClick={() => setActiveTab("activity")}
                        className={cn(
                            "flex-1 py-3 text-sm font-medium transition-colors border-b-2",
                            activeTab === "activity"
                                ? "border-primary text-primary"
                                : "border-transparent text-muted-foreground hover:text-foreground"
                        )}
                    >
                        سجل النشاطات
                    </button>
                    <button
                        onClick={() => setActiveTab("stats")}
                        className={cn(
                            "flex-1 py-3 text-sm font-medium transition-colors border-b-2",
                            activeTab === "stats"
                                ? "border-primary text-primary"
                                : "border-transparent text-muted-foreground hover:text-foreground"
                        )}
                    >
                        تحليل الأداء
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 max-h-[400px] overflow-y-auto">
                    {activeTab === "activity" ? (
                        <div className="space-y-6">
                            {Object.entries(groupedActivities).length === 0 ? (
                                <div className="text-center py-12 text-muted-foreground">
                                    <Activity className="w-12 h-12 mx-auto mb-3 opacity-30" />
                                    <p>لا توجد نشاطات مسجلة</p>
                                </div>
                            ) : (
                                Object.entries(groupedActivities).map(([date, logs]) => (
                                    <div key={date}>
                                        <div className="flex items-center gap-2 mb-3">
                                            <Calendar className="w-4 h-4 text-muted-foreground" />
                                            <span className="text-sm font-medium text-muted-foreground">{date}</span>
                                            <span className="text-xs text-muted-foreground/60">({logs.length} نشاط)</span>
                                        </div>
                                        <div className="space-y-2 pr-4 border-r-2 border-primary/20 mr-2">
                                            {logs.map(log => {
                                                const config = actionConfig[log.action] || {
                                                    icon: Activity,
                                                    gradient: "from-zinc-500/20 to-zinc-600/10",
                                                    labelAr: log.action
                                                };
                                                const Icon = config.icon;
                                                const details = log.details as Record<string, unknown>;

                                                return (
                                                    <div key={log.id} className="flex items-start gap-3 p-3 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors">
                                                        <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center bg-gradient-to-br", config.gradient)}>
                                                            <Icon className="w-4 h-4" />
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-sm font-medium">
                                                                {config.labelAr}
                                                                {Boolean(details?.order_id) && (
                                                                    <span className="text-primary mr-1">
                                                                        #{String(details.order_id)}
                                                                    </span>
                                                                )}
                                                            </p>
                                                            {Boolean(details?.from_status) && Boolean(details?.to_status) && (
                                                                <p className="text-xs text-muted-foreground">
                                                                    {String(details.from_status)} ← {String(details.to_status)}
                                                                </p>
                                                            )}
                                                        </div>
                                                        <span className="text-[10px] text-muted-foreground shrink-0">
                                                            {new Date(log.created_at).toLocaleTimeString("ar-IQ", {
                                                                hour: "2-digit",
                                                                minute: "2-digit"
                                                            })}
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {/* Performance Metrics */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 rounded-2xl p-4 border border-emerald-500/10">
                                    <div className="flex items-center gap-2 mb-2">
                                        <Target className="w-4 h-4 text-emerald-500" />
                                        <span className="text-sm font-medium">معدل الإنتاجية</span>
                                    </div>
                                    <p className="text-3xl font-bold text-emerald-600">
                                        {employee.orders_created > 0
                                            ? Math.round((employee.orders_created / employee.total_actions) * 100)
                                            : 0}%
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-1">نسبة الطلبات من النشاطات</p>
                                </div>
                                <div className="bg-gradient-to-br from-amber-500/10 to-amber-600/5 rounded-2xl p-4 border border-amber-500/10">
                                    <div className="flex items-center gap-2 mb-2">
                                        <Zap className="w-4 h-4 text-amber-500" />
                                        <span className="text-sm font-medium">النشاط اليومي</span>
                                    </div>
                                    <p className="text-3xl font-bold text-amber-600">
                                        {Math.round(employee.total_actions / 7)}
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-1">متوسط النشاطات يومياً</p>
                                </div>
                            </div>

                            {/* Activity Breakdown */}
                            <div className="bg-muted/30 rounded-2xl p-4">
                                <h4 className="font-medium mb-4 flex items-center gap-2">
                                    <BarChart3 className="w-4 h-4 text-primary" />
                                    توزيع النشاطات
                                </h4>
                                <div className="space-y-3">
                                    {[
                                        { label: "طلبات جديدة", value: employee.orders_created, total: employee.total_actions, color: "bg-emerald-500" },
                                        { label: "تغييرات الحالة", value: employee.status_changes, total: employee.total_actions, color: "bg-amber-500" },
                                        { label: "طباعة", value: employee.orders_printed, total: employee.total_actions, color: "bg-blue-500" },
                                        { label: "تعديلات", value: employee.orders_edited, total: employee.total_actions, color: "bg-violet-500" },
                                    ].map((item, i) => (
                                        <div key={i}>
                                            <div className="flex items-center justify-between text-sm mb-1">
                                                <span>{item.label}</span>
                                                <span className="font-medium">{item.value}</span>
                                            </div>
                                            <div className="h-2 bg-muted rounded-full overflow-hidden">
                                                <motion.div
                                                    initial={{ width: 0 }}
                                                    animate={{ width: `${item.total > 0 ? (item.value / item.total) * 100 : 0}%` }}
                                                    transition={{ delay: 0.2 + i * 0.1, duration: 0.5 }}
                                                    className={cn("h-full rounded-full", item.color)}
                                                />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </motion.div>
        </motion.div>
    );
}

// Activity Feed Item
function ActivityItem({ activity, delay = 0 }: { activity: ActivityLogEntry; delay?: number }) {
    const config = actionConfig[activity.action] || {
        icon: Activity,
        gradient: "from-zinc-500/20 to-zinc-600/10",
        labelAr: activity.action
    };
    const Icon = config.icon;
    const details = activity.details as Record<string, unknown>;

    return (
        <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay, duration: 0.3 }}
            className="flex items-start gap-3 p-4 hover:bg-muted/50 transition-colors rounded-xl group"
        >
            <div className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br shrink-0",
                config.gradient
            )}>
                <Icon className="w-5 h-5" />
            </div>

            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-sm">
                        {activity.user_email?.split("@")[0] || "مستخدم"}
                    </span>
                    <span className="text-sm text-muted-foreground">
                        {config.labelAr}
                    </span>
                    {Boolean(details?.order_id) && (
                        <span className="text-sm font-medium text-primary">
                            #{String(details.order_id)}
                        </span>
                    )}
                </div>

                {Boolean(details?.from_status) && Boolean(details?.to_status) && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="px-1.5 py-0.5 rounded bg-muted">{String(details.from_status)}</span>
                        <ArrowRight className="w-3 h-3" />
                        <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary">{String(details.to_status)}</span>
                    </div>
                )}
            </div>

            <span className="text-xs text-muted-foreground shrink-0">
                {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true, locale: ar })}
            </span>
        </motion.div>
    );
}

// Access Denied Component
function AccessDenied() {
    return (
        <div className="min-h-[80vh] flex items-center justify-center p-6">
            <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center max-w-md"
            >
                <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-gradient-to-br from-rose-500/20 to-rose-600/10 flex items-center justify-center">
                    <Lock className="w-12 h-12 text-rose-500" />
                </div>
                <h1 className="text-2xl font-bold mb-2">الوصول مقيّد</h1>
                <p className="text-muted-foreground mb-6">
                    هذه الصفحة متاحة للمسؤولين فقط. يرجى التواصل مع المسؤول للحصول على صلاحيات الوصول.
                </p>
                <a
                    href="/dashboard"
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
                >
                    العودة للرئيسية
                    <ArrowRight className="w-4 h-4" />
                </a>
            </motion.div>
        </div>
    );
}

// Main Page Component
export default function TeamPage() {
    const { profile, isLoading: authLoading } = useAuth();
    const isAdmin = profile?.role === "admin";

    const [timeRange, setTimeRange] = useState<TimeRange>("week");
    const [leaderboard, setLeaderboard] = useState<EmployeeStats[]>([]);
    const [activities, setActivities] = useState<ActivityLogEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [selectedEmployee, setSelectedEmployee] = useState<EmployeeStats | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [actionFilter, setActionFilter] = useState<string>("all");

    // Get date filter based on time range
    const getDateFilter = useCallback((range: TimeRange): string | null => {
        const now = new Date();
        switch (range) {
            case "today":
                now.setHours(0, 0, 0, 0);
                return now.toISOString();
            case "week":
                now.setDate(now.getDate() - 7);
                return now.toISOString();
            case "month":
                now.setMonth(now.getMonth() - 1);
                return now.toISOString();
            case "all":
                return null;
        }
    }, []);

    // Fetch employee stats
    const fetchLeaderboard = useCallback(async () => {
        const dateFilter = getDateFilter(timeRange);

        let query = supabase
            .from("activity_logs")
            .select("user_id, user_email, action")
            .not("user_id", "is", null);

        if (dateFilter) {
            query = query.gte("created_at", dateFilter);
        }

        const { data, error } = await query;

        if (error) {
            console.error("Error fetching leaderboard:", error);
            return;
        }

        // Aggregate stats by user
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

        // Fetch display names and profiles for users
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

        // Sort by total actions and convert to array
        const sorted = Array.from(statsMap.values())
            .sort((a, b) => b.total_actions - a.total_actions);

        setLeaderboard(sorted);
    }, [timeRange, getDateFilter]);

    // Fetch recent activities
    const fetchActivities = useCallback(async () => {
        const dateFilter = getDateFilter(timeRange);

        let query = supabase
            .from("activity_logs")
            .select("*")
            .order("created_at", { ascending: false })
            .limit(100);

        if (dateFilter) {
            query = query.gte("created_at", dateFilter);
        }

        const { data, error } = await query;

        if (error) {
            console.error("Error fetching activities:", error);
            return;
        }

        setActivities(data || []);
    }, [timeRange, getDateFilter]);

    // Initial fetch
    useEffect(() => {
        if (!isAdmin && !authLoading) return;

        const fetchData = async () => {
            setLoading(true);
            await Promise.all([fetchLeaderboard(), fetchActivities()]);
            setLoading(false);
        };
        fetchData();
    }, [fetchLeaderboard, fetchActivities, isAdmin, authLoading]);

    // Refresh data
    const handleRefresh = async () => {
        setRefreshing(true);
        await Promise.all([fetchLeaderboard(), fetchActivities()]);
        setRefreshing(false);
    };

    // Calculate total stats
    const stats = useMemo(() => {
        const totalActions = leaderboard.reduce((sum, e) => sum + e.total_actions, 0);
        const totalStatusChanges = leaderboard.reduce((sum, e) => sum + e.status_changes, 0);
        const totalOrdersCreated = leaderboard.reduce((sum, e) => sum + e.orders_created, 0);
        const totalOrdersPrinted = leaderboard.reduce((sum, e) => sum + e.orders_printed, 0);
        const onlineCount = leaderboard.filter(e => isUserOnline(e.last_login_at)).length;
        const avgActions = leaderboard.length > 0 ? Math.round(totalActions / leaderboard.length) : 0;

        return { totalActions, totalStatusChanges, totalOrdersCreated, totalOrdersPrinted, onlineCount, avgActions };
    }, [leaderboard]);

    // Filter activities
    const filteredActivities = useMemo(() => {
        return activities.filter(a => {
            if (actionFilter !== "all" && a.action !== actionFilter) return false;
            if (searchQuery) {
                const query = searchQuery.toLowerCase();
                const details = a.details as Record<string, unknown>;
                const orderId = (details?.order_id as string)?.toLowerCase() || "";
                const email = a.user_email?.toLowerCase() || "";
                if (!orderId.includes(query) && !email.includes(query)) return false;
            }
            return true;
        });
    }, [activities, actionFilter, searchQuery]);

    // Loading state
    if (authLoading || loading) {
        return (
            <div className="p-6 max-w-7xl mx-auto">
                <div className="flex items-center justify-center h-64">
                    <div className="relative">
                        <div className="w-16 h-16 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
                        <Users className="absolute inset-0 m-auto w-6 h-6 text-primary" />
                    </div>
                </div>
            </div>
        );
    }

    // Access control
    if (!isAdmin) {
        return <AccessDenied />;
    }

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            {/* Header */}
            <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col lg:flex-row lg:items-center justify-between gap-4"
            >
                <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-primary/50 flex items-center justify-center shadow-lg shadow-primary/25">
                        <Users className="w-7 h-7 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-3">
                            لوحة مراقبة الفريق
                            <span className="text-xs px-2 py-1 rounded-lg bg-amber-500/10 text-amber-600 border border-amber-500/20 font-medium">
                                للمسؤولين فقط
                            </span>
                        </h1>
                        <p className="text-muted-foreground mt-0.5">
                            تتبع أداء الموظفين والنشاطات بشكل مفصّل
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {/* Refresh Button */}
                    <button
                        onClick={handleRefresh}
                        disabled={refreshing}
                        className="p-2.5 rounded-xl bg-muted hover:bg-muted/80 transition-colors"
                    >
                        <RefreshCw className={cn("w-5 h-5", refreshing && "animate-spin")} />
                    </button>

                    {/* Time Range Filter */}
                    <div className="flex bg-muted rounded-xl p-1">
                        {([
                            { value: "today", label: "اليوم" },
                            { value: "week", label: "الأسبوع" },
                            { value: "month", label: "الشهر" },
                            { value: "all", label: "الكل" },
                        ] as { value: TimeRange; label: string }[]).map((range) => (
                            <button
                                key={range.value}
                                onClick={() => setTimeRange(range.value)}
                                className={cn(
                                    "px-4 py-2 rounded-lg text-sm font-medium transition-all",
                                    timeRange === range.value
                                        ? "bg-background shadow-sm text-foreground"
                                        : "text-muted-foreground hover:text-foreground"
                                )}
                            >
                                {range.label}
                            </button>
                        ))}
                    </div>
                </div>
            </motion.div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                <StatsCard
                    icon={Activity}
                    label="إجمالي النشاطات"
                    value={stats.totalActions}
                    gradient="from-amber-500/20 to-orange-500/10"
                    delay={0.1}
                />
                <StatsCard
                    icon={RefreshCw}
                    label="تغييرات الحالة"
                    value={stats.totalStatusChanges}
                    gradient="from-emerald-500/20 to-teal-500/10"
                    delay={0.15}
                />
                <StatsCard
                    icon={Package}
                    label="طلبات جديدة"
                    value={stats.totalOrdersCreated}
                    gradient="from-blue-500/20 to-cyan-500/10"
                    delay={0.2}
                />
                <StatsCard
                    icon={Printer}
                    label="عمليات الطباعة"
                    value={stats.totalOrdersPrinted}
                    gradient="from-violet-500/20 to-purple-500/10"
                    delay={0.25}
                />
                <StatsCard
                    icon={Users}
                    label="متصلون الآن"
                    value={stats.onlineCount}
                    gradient="from-green-500/20 to-emerald-500/10"
                    delay={0.3}
                />
                <StatsCard
                    icon={TrendingUp}
                    label="متوسط / موظف"
                    value={stats.avgActions}
                    gradient="from-rose-500/20 to-pink-500/10"
                    delay={0.35}
                />
            </div>

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                {/* Employees Section - 3 columns */}
                <div className="lg:col-span-3 space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-bold flex items-center gap-2">
                            <Trophy className="w-5 h-5 text-amber-500" />
                            أداء الموظفين
                        </h2>
                        <span className="text-sm text-muted-foreground">
                            {leaderboard.length} موظف
                        </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {leaderboard.length === 0 ? (
                            <div className="md:col-span-2 text-center py-12 bg-muted/30 rounded-2xl">
                                <Medal className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
                                <p className="text-muted-foreground">لا توجد بيانات متاحة</p>
                            </div>
                        ) : (
                            leaderboard.map((employee, index) => (
                                <EmployeeCard
                                    key={employee.user_id}
                                    employee={employee}
                                    rank={index + 1}
                                    onClick={() => setSelectedEmployee(employee)}
                                    delay={0.1 + index * 0.05}
                                />
                            ))
                        )}
                    </div>
                </div>

                {/* Activity Feed - 2 columns */}
                <div className="lg:col-span-2">
                    <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.3 }}
                        className="bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl rounded-3xl border border-border/50 overflow-hidden h-full"
                    >
                        {/* Header */}
                        <div className="p-4 border-b border-border/50">
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-lg font-bold flex items-center gap-2">
                                    <Clock className="w-5 h-5 text-primary" />
                                    آخر النشاطات
                                </h2>
                                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                            </div>

                            {/* Filters */}
                            <div className="flex gap-2">
                                <div className="relative flex-1">
                                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                    <input
                                        type="text"
                                        placeholder="بحث برقم الطلب..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="w-full h-9 pr-9 pl-3 rounded-lg bg-muted/50 border-0 text-sm focus:ring-2 focus:ring-primary/20 outline-none"
                                    />
                                </div>
                                <select
                                    value={actionFilter}
                                    onChange={(e) => setActionFilter(e.target.value)}
                                    className="h-9 px-3 rounded-lg bg-muted/50 border-0 text-sm focus:ring-2 focus:ring-primary/20 outline-none"
                                >
                                    <option value="all">الكل</option>
                                    <option value="order.create">طلبات جديدة</option>
                                    <option value="order.status_change">تغيير الحالة</option>
                                    <option value="order.edit">تعديلات</option>
                                    <option value="order.print">طباعة</option>
                                </select>
                            </div>
                        </div>

                        {/* Activity List */}
                        <div className="max-h-[600px] overflow-y-auto">
                            {filteredActivities.length === 0 ? (
                                <div className="text-center py-12 text-muted-foreground">
                                    <Activity className="w-12 h-12 mx-auto mb-3 opacity-30" />
                                    <p>لا توجد نشاطات</p>
                                </div>
                            ) : (
                                <div className="divide-y divide-border/30">
                                    {filteredActivities.slice(0, 30).map((activity, index) => (
                                        <ActivityItem
                                            key={activity.id}
                                            activity={activity}
                                            delay={0.02 * index}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    </motion.div>
                </div>
            </div>

            {/* Employee Detail Modal */}
            <AnimatePresence>
                {selectedEmployee && (
                    <EmployeeDetailModal
                        employee={selectedEmployee}
                        activities={activities}
                        onClose={() => setSelectedEmployee(null)}
                    />
                )}
            </AnimatePresence>
        </div>
    );
}
