"use client";

import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    X,
    Activity,
    Package,
    RefreshCw,
    Printer,
    Clock,
    BarChart3,
    Calendar,
    ChevronLeft,
    ChevronRight,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { AnimatedAvatarRing } from "./animated-avatar-ring";
import { useWorkSessions, formatSessionDuration } from "./hooks/use-work-sessions";
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

type TabType = "activity" | "sessions" | "analytics";

export function EmployeeDrawer({
    employee,
    activities,
    isOpen,
    onClose,
    onNavigate,
    hasPrev = false,
    hasNext = false,
}: EmployeeDrawerProps) {
    const [activeTab, setActiveTab] = useState<TabType>("activity");

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
        { key: "activity", icon: Activity, label: "النشاطات" },
        { key: "sessions", icon: Clock, label: "الجلسات" },
        { key: "analytics", icon: BarChart3, label: "التحليلات" },
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
                                            {employee.role === "admin" ? "مسؤول" : "موظف"}
                                        </span>
                                        {employee.isOnline && (
                                            <span className="px-2 py-0.5 rounded-lg text-xs font-medium bg-green-500/10 text-green-600 flex items-center gap-1">
                                                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                                                متصل
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Quick Stats */}
                            <div className="grid grid-cols-4 gap-3 mt-6">
                                {[
                                    { icon: Activity, value: employee.totalActions, label: "إجمالي", color: "text-primary" },
                                    { icon: Package, value: employee.ordersCreated, label: "طلبات", color: "text-emerald-500" },
                                    { icon: RefreshCw, value: employee.statusChanges, label: "تغييرات", color: "text-amber-500" },
                                    { icon: Clock, value: sessionStats.totalHours, label: "ساعات", color: "text-blue-500" },
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
                                            <p className="text-xs text-muted-foreground">جلسة</p>
                                        </div>
                                        <div className="bg-muted/30 rounded-xl p-4 text-center">
                                            <p className="text-2xl font-bold">{sessionStats.averageSessionMinutes}</p>
                                            <p className="text-xs text-muted-foreground">دقيقة/جلسة</p>
                                        </div>
                                        <div className="bg-muted/30 rounded-xl p-4 text-center">
                                            <p className="text-2xl font-bold">{sessionStats.longestSessionMinutes}</p>
                                            <p className="text-xs text-muted-foreground">أطول جلسة</p>
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
                        </div>

                        {/* Footer */}
                        {employee.lastLoginAt && (
                            <div className="p-4 border-t border-border bg-muted/30">
                                <p className="text-xs text-muted-foreground text-center">
                                    آخر نشاط:{" "}
                                    {formatDistanceToNow(new Date(employee.lastLoginAt), {
                                        addSuffix: true,
                                        locale: ar,
                                    })}
                                </p>
                            </div>
                        )}
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
