"use client";

import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    X,
    Activity,
    Package,
    RefreshCw,
    Clock,
    BarChart3,
    ChevronLeft,
    ChevronRight,
    Settings,
    TrendingDown,
    AlertCircle,
    Star,
    Send,
} from "lucide-react";
import { useSalaryConfig } from "@/hooks/use-salary-config";
import { useSalaryDeductions } from "@/hooks/use-salary-deductions";
import { SalaryConfigForm } from "@/components/salary/salary-config-form";
import { TelegramLinkCard } from "@/components/settings/telegram-link-card";
import { useAuth } from "@/components/auth/auth-provider";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { AnimatedAvatarRing } from "./animated-avatar-ring";
import { useWorkSessions } from "./hooks/use-work-sessions";
import { useLanguage } from "@/hooks/use-language";
import { SessionGroupedActivities } from "./session-grouped-activities";
import { ActivityTimeline } from "./activity-timeline";
import { PerformanceTrendsChart } from "./charts/performance-trends-chart";
import { ActionBreakdownChart } from "./charts/action-breakdown-chart";
import { PeakHoursHeatmap } from "./charts/peak-hours-heatmap";
import { ActivityLogEntry } from "@/lib/activity-logger";

// Types
interface EmployeeData {
    userId: string;
    email: string;
    displayName: string | null;
    avatarUrl: string | null;
    role: string;
    isOnline: boolean;
    lastLoginAt: string | null;
    totalActions: number;
    ordersCreated: number;
    statusChanges: number;
    ordersPrinted: number;
    ordersEdited: number;
}

interface EmployeeDrawerProps {
    employee: EmployeeData;
    activities: ActivityLogEntry[];
    isOpen: boolean;
    onClose: () => void;
    onNavigate?: (direction: "prev" | "next") => void;
    hasPrev?: boolean;
    hasNext?: boolean;
}

type TabType = "activity" | "sessions" | "analytics" | "salary" | "telegram";

export function EmployeeDrawer({
    employee,
    activities,
    isOpen,
    onClose,
    onNavigate,
    hasPrev = false,
    hasNext = false,
}: EmployeeDrawerProps) {
    const { t, language } = useLanguage();
    const { role, profile } = useAuth();
    const isAdmin = role === "admin";
    const [activeTab, setActiveTab] = useState<TabType>("activity");
    const [salaryConfigOpen, setSalaryConfigOpen] = useState(false);

    // Salary data (admin-only). The hooks rely on RLS for tenant scoping.
    const { getEffectiveRate, upsertEmployeeConfig } = useSalaryConfig();
    const { advances, penalties, bonuses } = useSalaryDeductions();
    const effectiveRate = getEffectiveRate(employee.userId, employee.role);
    const pendingAdvances = advances.filter(a => a.employee_id === employee.userId && !a.is_deducted);
    const pendingPenalties = penalties.filter(p => p.employee_id === employee.userId && !p.is_applied);
    const pendingBonuses = bonuses.filter(b => b.employee_id === employee.userId && !b.is_applied);

    // Get employee's activities
    const employeeActivities = useMemo(() => {
        return activities.filter((a) => a.user_id === employee.userId);
    }, [activities, employee.userId]);

    // Calculate work sessions
    const sessionStats = useWorkSessions(employeeActivities, employee.userId);

    // Process data for charts
    const trendsData = useMemo(() => {
        const dayMap = new Map<string, {
            totalActions: number;
            ordersCreated: number;
            statusChanges: number;
            ordersPrinted: number;
        }>();

        // Initialize last 7 days
        for (let i = 6; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split("T")[0];
            dayMap.set(dateStr, {
                totalActions: 0,
                ordersCreated: 0,
                statusChanges: 0,
                ordersPrinted: 0,
            });
        }

        employeeActivities.forEach((activity) => {
            const dateStr = activity.created_at.split("T")[0];
            const day = dayMap.get(dateStr);
            if (day) {
                day.totalActions++;
                if (activity.action === "order.create") day.ordersCreated++;
                if (activity.action === "order.status_change") day.statusChanges++;
                if (activity.action === "order.print") day.ordersPrinted++;
            }
        });

        return Array.from(dayMap.entries()).map(([date, stats]) => ({
            date,
            ...stats,
        }));
    }, [employeeActivities]);

    const breakdownData = useMemo(() => {
        const actionMap = new Map<string, number>();
        employeeActivities.forEach((activity) => {
            actionMap.set(activity.action, (actionMap.get(activity.action) || 0) + 1);
        });
        return Array.from(actionMap.entries())
            .map(([action, count]) => ({ action, count }))
            .sort((a, b) => b.count - a.count);
    }, [employeeActivities]);

    const peakHoursData = useMemo(() => {
        const hourMap = new Map<number, number>();
        employeeActivities.forEach((activity) => {
            const hour = new Date(activity.created_at).getHours();
            hourMap.set(hour, (hourMap.get(hour) || 0) + 1);
        });
        return Array.from(hourMap.entries())
            .map(([hour, count]) => ({ hour, count }))
            .sort((a, b) => a.hour - b.hour);
    }, [employeeActivities]);

    // Close on escape
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        if (isOpen) {
            document.addEventListener("keydown", handleEscape);
        }
        return () => document.removeEventListener("keydown", handleEscape);
    }, [isOpen, onClose]);

    const tabs: { key: TabType; icon: React.ElementType; label: string }[] = [
        { key: "activity", icon: Activity, label: t("team.tabs.activity") },
        { key: "sessions", icon: Clock, label: t("team.tabs.sessions") },
        { key: "analytics", icon: BarChart3, label: t("team.tabs.analytics") },
        ...(isAdmin ? [{ key: "salary" as TabType, icon: Settings, label: "الراتب" }] : []),
        ...(isAdmin ? [{ key: "telegram" as TabType, icon: Send, label: "تليكرام" }] : []),
    ];

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40"
                    />

                    {/* Drawer */}
                    <motion.div
                        initial={{ x: "100%" }}
                        animate={{ x: 0 }}
                        exit={{ x: "100%" }}
                        transition={{ type: "spring", damping: 25, stiffness: 300 }}
                        className={cn(
                            "fixed top-0 left-0 bottom-0 w-full max-w-xl z-50",
                            "bg-background border-r border-border shadow-2xl",
                            "flex flex-col"
                        )}
                    >
                        {/* Header */}
                        <div className="relative p-6 border-b border-border bg-gradient-to-br from-primary/5 to-transparent">
                            {/* Navigation */}
                            <div className="absolute top-4 left-4 flex items-center gap-2">
                                {onNavigate && (
                                    <>
                                        <button
                                            onClick={() => onNavigate("prev")}
                                            disabled={!hasPrev}
                                            className={cn(
                                                "p-2 rounded-xl transition-colors",
                                                hasPrev
                                                    ? "hover:bg-muted"
                                                    : "opacity-30 cursor-not-allowed"
                                            )}
                                        >
                                            <ChevronRight className="w-5 h-5" />
                                        </button>
                                        <button
                                            onClick={() => onNavigate("next")}
                                            disabled={!hasNext}
                                            className={cn(
                                                "p-2 rounded-xl transition-colors",
                                                hasNext
                                                    ? "hover:bg-muted"
                                                    : "opacity-30 cursor-not-allowed"
                                            )}
                                        >
                                            <ChevronLeft className="w-5 h-5" />
                                        </button>
                                    </>
                                )}
                            </div>

                            {/* Close button */}
                            <button
                                onClick={onClose}
                                className="absolute top-4 right-4 p-2 rounded-xl hover:bg-muted transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>

                            {/* Employee Info */}
                            <div className="flex items-center gap-4 mt-8">
                                <AnimatedAvatarRing
                                    avatarUrl={employee.avatarUrl}
                                    displayName={employee.displayName}
                                    email={employee.email}
                                    isOnline={employee.isOnline}
                                    activityLevel={Math.min((employee.totalActions / 100) * 100, 100)}
                                    size="lg"
                                />
                                <div>
                                    <h2 className="text-xl font-bold text-foreground">
                                        {employee.displayName || employee.email.split("@")[0]}
                                    </h2>
                                    <p className="text-sm text-muted-foreground">{employee.email}</p>
                                    <div className="flex items-center gap-2 mt-2">
                                        <span
                                            className={cn(
                                                "px-2 py-0.5 rounded-lg text-xs font-medium",
                                                employee.role === "admin"
                                                    ? "bg-amber-500/10 text-amber-600"
                                                    : "bg-emerald-500/10 text-emerald-600"
                                            )}
                                        >
                                            {employee.role === "admin" ? t("team.drawer.adminRole") : t("team.drawer.employeeRole")}
                                        </span>
                                        {employee.isOnline && (
                                            <span className="px-2 py-0.5 rounded-lg text-xs font-medium bg-green-500/10 text-green-600 flex items-center gap-1">
                                                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                                                {t("team.drawer.online")}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Quick Stats */}
                            <div className="grid grid-cols-4 gap-3 mt-6">
                                {[
                                    { icon: Activity, value: employee.totalActions, label: t("team.stats.total"), color: "text-primary" },
                                    { icon: Package, value: employee.ordersCreated, label: t("team.stats.orders"), color: "text-emerald-500" },
                                    { icon: RefreshCw, value: employee.statusChanges, label: t("team.stats.changes"), color: "text-amber-500" },
                                    { icon: Clock, value: sessionStats.totalHours, label: t("team.stats.hoursLabel"), color: "text-blue-500" },
                                ].map((stat, i) => (
                                    <div key={i} className="bg-white/50 rounded-xl p-3 text-center backdrop-blur-sm">
                                        <stat.icon className={cn("w-4 h-4 mx-auto mb-1", stat.color)} />
                                        <p className="text-lg font-bold">{stat.value}</p>
                                        <p className="text-[10px] text-muted-foreground">{stat.label}</p>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Tabs */}
                        <div className="flex border-b border-border">
                            {tabs.map((tab) => (
                                <button
                                    key={tab.key}
                                    onClick={() => setActiveTab(tab.key)}
                                    className={cn(
                                        "flex-1 flex items-center justify-center gap-2 py-3",
                                        "text-sm font-medium transition-colors border-b-2",
                                        activeTab === tab.key
                                            ? "border-primary text-primary"
                                            : "border-transparent text-muted-foreground hover:text-foreground"
                                    )}
                                >
                                    <tab.icon className="w-4 h-4" />
                                    {tab.label}
                                </button>
                            ))}
                        </div>

                        {/* Content */}
                        <div className="flex-1 overflow-y-auto p-6">
                            {activeTab === "activity" && (
                                <ActivityTimeline
                                    activities={employeeActivities}
                                    showUserInfo={false}
                                    maxItems={100}
                                />
                            )}

                            {activeTab === "sessions" && (
                                <div className="space-y-6">
                                    {/* Session summary */}
                                    <div className="grid grid-cols-3 gap-3">
                                        <div className="bg-muted/30 rounded-xl p-4 text-center">
                                            <p className="text-2xl font-bold">{sessionStats.totalSessions}</p>
                                            <p className="text-xs text-muted-foreground">{t("team.stats.sessionLabel")}</p>
                                        </div>
                                        <div className="bg-muted/30 rounded-xl p-4 text-center">
                                            <p className="text-2xl font-bold">{sessionStats.averageSessionMinutes}</p>
                                            <p className="text-xs text-muted-foreground">{t("team.stats.minPerSession")}</p>
                                        </div>
                                        <div className="bg-muted/30 rounded-xl p-4 text-center">
                                            <p className="text-2xl font-bold">{sessionStats.longestSessionMinutes}</p>
                                            <p className="text-xs text-muted-foreground">{t("team.stats.longestSession")}</p>
                                        </div>
                                    </div>

                                    <SessionGroupedActivities sessions={sessionStats.sessions} />
                                </div>
                            )}

                            {activeTab === "analytics" && (
                                <div className="space-y-6">
                                    <PerformanceTrendsChart
                                        data={trendsData}
                                        showMetrics={["totalActions", "ordersCreated"]}
                                        height={200}
                                    />
                                    <div className="grid grid-cols-1 gap-6">
                                        <ActionBreakdownChart data={breakdownData} height={200} />
                                        <PeakHoursHeatmap
                                            data={peakHoursData}
                                            employeeName={employee.displayName || employee.email}
                                        />
                                    </div>
                                </div>
                            )}

                            {activeTab === "salary" && isAdmin && (
                                <div className="space-y-5">
                                    {/* Current rates */}
                                    <div className="p-4 bg-muted/30 rounded-xl space-y-3">
                                        <div className="flex items-center justify-between">
                                            <p className="text-sm font-semibold">الراتب الشهري</p>
                                            <p className="text-sm font-bold">
                                                {new Intl.NumberFormat("en-IQ").format(effectiveRate.baseMonthlySalary)} IQD
                                            </p>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <p className="text-sm text-muted-foreground">مكافأة لكل طلب مكتمل</p>
                                            <p className="text-sm font-medium">
                                                {new Intl.NumberFormat("en-IQ").format(effectiveRate.perOrderBonus)} IQD
                                            </p>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <p className="text-xs text-muted-foreground">المصدر</p>
                                            <span className={cn(
                                                "text-xs px-2 py-0.5 rounded-full",
                                                effectiveRate.source === "employee_config"
                                                    ? "bg-blue-100 text-blue-700"
                                                    : effectiveRate.source === "role_default"
                                                    ? "bg-amber-100 text-amber-700"
                                                    : "bg-muted text-muted-foreground"
                                            )}>
                                                {effectiveRate.source === "employee_config"
                                                    ? "خاص بالموظف"
                                                    : effectiveRate.source === "role_default"
                                                    ? "افتراضي الدور"
                                                    : "غير محدد"}
                                            </span>
                                        </div>
                                        <button
                                            onClick={() => setSalaryConfigOpen(true)}
                                            className="w-full mt-2 px-4 py-2 rounded-xl bg-primary/10 text-primary text-sm font-medium hover:bg-primary/20 transition-colors flex items-center justify-center gap-2"
                                        >
                                            <Settings className="w-4 h-4" />
                                            تعديل الراتب
                                        </button>
                                    </div>

                                    {/* Pending deductions */}
                                    <div className="space-y-2">
                                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                            الاستحقاقات المعلقة
                                        </p>
                                        {pendingAdvances.length === 0 && pendingPenalties.length === 0 && pendingBonuses.length === 0 ? (
                                            <p className="text-sm text-muted-foreground text-center py-4">لا توجد استحقاقات معلقة</p>
                                        ) : (
                                            <>
                                                {pendingAdvances.map(a => (
                                                    <div key={a.id} className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-900/10 rounded-xl">
                                                        <TrendingDown className="w-4 h-4 text-amber-600 shrink-0" />
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-xs font-medium">{a.reason ?? "سلفة"}</p>
                                                        </div>
                                                        <p className="text-xs font-bold text-amber-700 tabular-nums">
                                                            −{new Intl.NumberFormat("en-IQ").format(a.amount)} IQD
                                                        </p>
                                                    </div>
                                                ))}
                                                {pendingPenalties.map(p => (
                                                    <div key={p.id} className="flex items-center gap-2 p-3 bg-rose-50 dark:bg-rose-900/10 rounded-xl">
                                                        <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-xs font-medium">{p.reason}</p>
                                                        </div>
                                                        <p className="text-xs font-bold text-rose-700 tabular-nums">
                                                            −{new Intl.NumberFormat("en-IQ").format(p.amount)} IQD
                                                        </p>
                                                    </div>
                                                ))}
                                                {pendingBonuses.map(b => (
                                                    <div key={b.id} className="flex items-center gap-2 p-3 bg-violet-50 dark:bg-violet-900/10 rounded-xl">
                                                        <Star className="w-4 h-4 text-violet-600 shrink-0" />
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-xs font-medium">{b.reason ?? "مكافأة"}</p>
                                                        </div>
                                                        <p className="text-xs font-bold text-violet-700 tabular-nums">
                                                            +{new Intl.NumberFormat("en-IQ").format(b.amount)} IQD
                                                        </p>
                                                    </div>
                                                ))}
                                            </>
                                        )}
                                    </div>
                                </div>
                            )}

                            {activeTab === "telegram" && isAdmin && (
                                <TelegramLinkCard
                                    userProfileId={employee.userId}
                                    currentAdminId={(profile as { id?: string } | null)?.id}
                                    displayName={employee.displayName || employee.email.split("@")[0]}
                                />
                            )}
                        </div>

                        {/* Footer */}
                        {employee.lastLoginAt && (
                            <div className="p-4 border-t border-border bg-muted/30">
                                <p className="text-xs text-muted-foreground text-center">
                                    {t("team.drawer.lastActivity")}
                                    {formatDistanceToNow(new Date(employee.lastLoginAt), {
                                        addSuffix: true,
                                        locale: language === "ar" ? ar : undefined,
                                    })}
                                </p>
                            </div>
                        )}
                    </motion.div>
                </>
            )}

            {/* Salary config form (rendered outside drawer to avoid z-index issues) */}
            {isAdmin && (
                <SalaryConfigForm
                    isOpen={salaryConfigOpen}
                    onClose={() => setSalaryConfigOpen(false)}
                    employeeName={employee.displayName || employee.email.split("@")[0]}
                    employeeId={employee.userId}
                    currentRate={effectiveRate}
                    onSubmit={async (config) => {
                        await upsertEmployeeConfig(employee.userId, config);
                    }}
                />
            )}
        </AnimatePresence>
    );
}
