"use client";

import { useEffect } from "react";
import { motion } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Skeleton } from "@scheniders/ui/skeletons";
import { useLanguage } from "@/hooks/use-language";
import { cn } from "@/lib/utils";
import type { ActivityLogEntry } from "@/lib/activity-logger";
import type { TeamInsights } from "@/lib/team-insights";
import type { TeamTimeRange } from "@/lib/team-time-window";
import { formatSessionDuration, type WorkSessionStats } from "./hooks/use-work-sessions";
import { ActivityTimeline } from "./activity-timeline";
import { SessionGroupedActivities } from "./session-grouped-activities";
import { PerformanceTrendsChart } from "./charts/performance-trends-chart";
import { ActionBreakdownChart } from "./charts/action-breakdown-chart";
import { PeakHoursHeatmap } from "./charts/peak-hours-heatmap";

export type EmployeeDrawerTab = "activity" | "sessions" | "analytics" | "salary" | "telegram";

export interface DrawerEmployee {
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
}

const ROLE_KEYS: Record<string, string> = {
    owner: "team.roster.role.owner",
    admin: "team.roster.role.admin",
    employee: "team.roster.role.employee",
    viewer: "team.roster.role.viewer",
};

interface EmployeeDrawerPanelProps {
    employee: DrawerEmployee;
    range: TeamTimeRange;
    tab: EmployeeDrawerTab;
    onTabChange: (tab: EmployeeDrawerTab) => void;
    feed: { activities: ActivityLogEntry[]; isLoading: boolean; hasMore: boolean; isLoadingMore: boolean; loadMore: () => Promise<void> };
    sessions: WorkSessionStats;
    charts: { insights: TeamInsights | null; loading: boolean; failed: boolean };
    /** Admin-only tabs; omitted for everyone else. */
    salary?: React.ReactNode;
    telegram?: React.ReactNode;
    onClose: () => void;
    onNavigate?: (direction: "prev" | "next") => void;
    hasPrev?: boolean;
    hasNext?: boolean;
}

/** One member's page: who they are, what they did in the window, their hours, charts and pay. */
export function EmployeeDrawerPanel({
    employee, range, tab, onTabChange, feed, sessions, charts, salary, telegram, onClose, onNavigate, hasPrev = false, hasNext = false,
}: EmployeeDrawerPanelProps) {
    const { t, language } = useLanguage();
    const name = employee.displayName || employee.email.split("@")[0];
    const roleKey = ROLE_KEYS[employee.role.toLowerCase()];

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [onClose]);

    const tabs: { key: EmployeeDrawerTab; label: string }[] = [
        { key: "activity", label: t("team.tabs.activity") },
        { key: "sessions", label: t("team.drawer.hoursTab") },
        { key: "analytics", label: t("team.tabs.analytics") },
        ...(salary ? [{ key: "salary" as const, label: t("team.drawer.salaryTab") }] : []),
        ...(telegram ? [{ key: "telegram" as const, label: t("team.drawer.telegramTab") }] : []),
    ];

    const stats = [
        { label: t("team.stats.totalActions"), value: employee.totalActions },
        { label: t("team.stats.newOrders"), value: employee.ordersCreated },
        { label: t("team.stats.statusChanges"), value: employee.statusChanges },
        { label: t("team.stats.printOps"), value: employee.ordersPrinted },
    ];

    return (
        <>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={onClose}
                className="fixed inset-0 bg-black/30 z-40"
                aria-hidden="true"
            />
            <motion.aside
                role="dialog"
                aria-modal="true"
                aria-label={name}
                initial={{ x: "100%" }}
                animate={{ x: 0 }}
                exit={{ x: "100%" }}
                transition={{ type: "spring", damping: 30, stiffness: 300 }}
                className="fixed top-0 right-0 bottom-0 w-full max-w-xl z-50 flex flex-col bg-[var(--background)] border-l border-[#E8E4DC] dark:border-white/10 shadow-2xl"
            >
                <header className="px-6 pt-5 pb-4 border-b border-[#E8E4DC] dark:border-white/10">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1">
                            {onNavigate && (
                                <>
                                    <button type="button" onClick={() => onNavigate("prev")} disabled={!hasPrev} aria-label={t("team.drawer.prev")} className="p-1.5 rounded-lg hover:bg-[#F0ECE4] dark:hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none">
                                        <ChevronLeft className="w-4 h-4" />
                                    </button>
                                    <button type="button" onClick={() => onNavigate("next")} disabled={!hasNext} aria-label={t("team.drawer.next")} className="p-1.5 rounded-lg hover:bg-[#F0ECE4] dark:hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none">
                                        <ChevronRight className="w-4 h-4" />
                                    </button>
                                </>
                            )}
                        </div>
                        <button type="button" onClick={onClose} aria-label={t("team.drawer.close")} className="p-1.5 rounded-lg hover:bg-[#F0ECE4] dark:hover:bg-white/10">
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    <div className="flex items-center gap-4 mt-3">
                        <span className="relative shrink-0 w-14 h-14 rounded-2xl overflow-hidden bg-white dark:bg-white/10 border border-[#E8E4DC] dark:border-white/10 flex items-center justify-center text-xl font-bold text-[#1E1E1E] dark:text-white">
                            {employee.avatarUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element -- avatar URLs come from arbitrary storage hosts not configured for next/image
                                <img src={employee.avatarUrl} alt="" className="w-full h-full object-cover" />
                            ) : (
                                name[0]?.toUpperCase()
                            )}
                        </span>
                        <div className="min-w-0">
                            <div className="flex items-center gap-2">
                                <h2 className="text-xl font-bold text-[#1E1E1E] dark:text-white truncate"><bdi>{name}</bdi></h2>
                                <span className="shrink-0 px-1.5 py-0.5 rounded-md text-[11px] font-semibold bg-[#F5F0E8] dark:bg-white/10 text-[#6B6B6B] dark:text-gray-300">
                                    {roleKey ? t(roleKey) : employee.role}
                                </span>
                            </div>
                            <p className="text-sm text-[#6B6B6B] dark:text-gray-400 truncate">{employee.email}</p>
                            <p className={cn("text-xs font-medium mt-0.5", employee.isOnline ? "text-emerald-700 dark:text-emerald-400" : "text-[#9A9A9A] dark:text-gray-500")}>
                                {employee.isOnline
                                    ? t("team.drawer.online")
                                    : employee.lastLoginAt
                                        ? `${t("team.drawer.lastLogin")} ${formatDistanceToNow(new Date(employee.lastLoginAt), { addSuffix: true, locale: language === "ar" ? ar : undefined })}`
                                        : t("team.roster.never")}
                            </p>
                        </div>
                    </div>

                    <dl className="grid grid-cols-4 gap-px mt-5 overflow-hidden rounded-xl border border-[#E8E4DC] dark:border-white/10 bg-[#F0ECE4] dark:bg-white/5">
                        {stats.map((s) => (
                            <div key={s.label} className="bg-white dark:bg-[#1A1A1A] px-3 py-2.5">
                                <dt className="text-[11px] text-[#6B6B6B] dark:text-gray-400 truncate">{s.label}</dt>
                                <dd className="text-lg font-bold tabular-nums text-[#1E1E1E] dark:text-white">{s.value.toLocaleString("en-US")}</dd>
                            </div>
                        ))}
                    </dl>
                    <p className="mt-2 text-[11px] text-[#9A9A9A] dark:text-gray-500">{t(`team.drawer.window.${range}`)}</p>
                </header>

                <div role="tablist" className="flex gap-5 px-6 border-b border-[#E8E4DC] dark:border-white/10">
                    {tabs.map((x) => (
                        <button
                            key={x.key}
                            type="button"
                            role="tab"
                            aria-selected={tab === x.key}
                            onClick={() => onTabChange(x.key)}
                            className={cn(
                                "-mb-px py-3 border-b-2 text-sm font-semibold whitespace-nowrap transition-colors",
                                tab === x.key
                                    ? "border-[#1E1E1E] dark:border-white text-[#1E1E1E] dark:text-white"
                                    : "border-transparent text-[#6B6B6B] dark:text-gray-400 hover:text-[#1E1E1E] dark:hover:text-white",
                            )}
                        >
                            {x.label}
                        </button>
                    ))}
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-5">
                    {tab === "activity" && (
                        feed.isLoading ? (
                            <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-xl" />)}</div>
                        ) : (
                            <>
                                <ActivityTimeline activities={feed.activities} showUserInfo={false} maxItems={feed.activities.length} />
                                {feed.hasMore && (
                                    <button
                                        type="button"
                                        onClick={() => void feed.loadMore()}
                                        disabled={feed.isLoadingMore}
                                        className="mt-2 w-full py-2 rounded-xl border border-[#E8E4DC] dark:border-white/10 text-sm font-semibold text-[#1E1E1E] dark:text-white disabled:opacity-50"
                                    >
                                        {t("team.activities.loadMore")}
                                    </button>
                                )}
                            </>
                        )
                    )}

                    {tab === "sessions" && (
                        <div className="space-y-5">
                            <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-[#E8E4DC] dark:border-white/10 bg-[#F0ECE4] dark:bg-white/5">
                                {[
                                    { label: t("team.drawer.hoursWorked"), value: sessions.totalHours },
                                    { label: t("team.drawer.sessionCount"), value: sessions.totalSessions },
                                    { label: t("team.stats.longestSession"), value: formatSessionDuration(sessions.longestSessionMinutes, t) },
                                ].map((s) => (
                                    <div key={s.label} className="bg-white dark:bg-[#1A1A1A] px-3 py-2.5">
                                        <dt className="text-[11px] text-[#6B6B6B] dark:text-gray-400">{s.label}</dt>
                                        <dd className="text-lg font-bold tabular-nums text-[#1E1E1E] dark:text-white">{s.value}</dd>
                                    </div>
                                ))}
                            </dl>
                            <p className="text-xs text-[#9A9A9A] dark:text-gray-500">{t("team.drawer.sessionsNote")}</p>
                            <SessionGroupedActivities sessions={sessions.sessions} />
                        </div>
                    )}

                    {tab === "analytics" && (
                        charts.failed ? (
                            <p className="py-16 text-center text-sm text-[#6B6B6B] dark:text-gray-400">{t("team.analytics.loadFailed")}</p>
                        ) : charts.loading || !charts.insights ? (
                            <Skeleton className="h-64 rounded-2xl" />
                        ) : (
                            <div className="space-y-8">
                                <p className="text-xs text-[#9A9A9A] dark:text-gray-500">{t(`team.analytics.window.${range}`)}</p>
                                <PerformanceTrendsChart data={charts.insights.byDay} showMetrics={["totalActions", "ordersCreated"]} height={200} />
                                <ActionBreakdownChart data={charts.insights.byAction} />
                                <PeakHoursHeatmap data={charts.insights.byHour} />
                            </div>
                        )
                    )}

                    {tab === "salary" && salary}
                    {tab === "telegram" && telegram}
                </div>
            </motion.aside>
        </>
    );
}
