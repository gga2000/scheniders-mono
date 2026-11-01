"use client";

import { useLanguage } from "@/hooks/use-language";
import { motion } from "framer-motion";
import { EmployeeActivityMetrics } from "@/hooks/use-employee-metrics";
import {
    Trophy, Medal, Activity, Package, RefreshCw, Printer,
    CheckCircle2, Truck, Users, Zap, Clock, TrendingUp,
    Loader2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { ar as arLocale } from "date-fns/locale";

interface TrueEmployeePerformanceProps {
    data: EmployeeActivityMetrics[];
    loading?: boolean;
    error?: string | null;
    onRefresh?: () => void;
}

const container = {
    hidden: { opacity: 0 },
    show: {
        opacity: 1,
        transition: { staggerChildren: 0.1 }
    }
};

const item = {
    hidden: { y: 20, opacity: 0 },
    show: { y: 0, opacity: 1 }
};

const getMedalGradient = (rank: number) => {
    if (rank === 1) return "from-yellow-400 to-amber-500";
    if (rank === 2) return "from-gray-300 to-gray-400";
    if (rank === 3) return "from-amber-600 to-orange-700";
    return "from-blue-400 to-blue-500";
};

const getMedalShadow = (rank: number) => {
    if (rank === 1) return "shadow-yellow-500/30";
    if (rank === 2) return "shadow-gray-400/30";
    if (rank === 3) return "shadow-orange-500/30";
    return "shadow-blue-400/20";
};

export function TrueEmployeePerformance({
    data,
    loading,
    error,
    onRefresh
}: TrueEmployeePerformanceProps) {
    const { t, language } = useLanguage();
    // Loading state
    if (loading) {
        return (
            <div className="pastel-card p-8 flex items-center justify-center">
                <div className="text-center">
                    <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-2" />
                    <p className="text-sm text-muted">{t("reports.team.loading")}</p>
                </div>
            </div>
        );
    }

    // Error state
    if (error) {
        return (
            <div className="pastel-card p-8 text-center bg-gradient-to-br from-rose-50 to-red-50">
                <p className="text-rose-700 mb-2">{error}</p>
                {onRefresh && (
                    <button
                        onClick={onRefresh}
                        className="text-sm text-rose-600 hover:text-rose-800 underline"
                    >
                        {t("reports.common.retry")}
                    </button>
                )}
            </div>
        );
    }

    // Empty state
    if (data.length === 0) {
        return (
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="pastel-card p-8 text-center"
            >
                <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
                    <Users className="w-8 h-8 text-gray-400" />
                </div>
                <h3 className="text-lg font-bold text-foreground">{t("reports.team.empty")}</h3>
                <p className="text-sm text-muted mt-1">{t("reports.team.emptyDesc")}</p>
            </motion.div>
        );
    }

    // Calculate totals
    const totalActions = data.reduce((sum, e) => sum + e.totalActions, 0);
    const onlineCount = data.filter(e => e.isOnline).length;
    const topPerformers = data.slice(0, 3);
    const otherEmployees = data.slice(3);

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="pastel-card p-6 overflow-hidden relative"
        >
            {/* Background decoration */}
            <div className="absolute -top-20 -right-20 w-60 h-60 bg-gradient-to-br from-amber-500/10 to-yellow-500/10 rounded-full blur-3xl" />

            <div className="relative z-10">
                {/* Header */}
                <div className="flex items-start justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-amber-100 rounded-xl text-amber-600">
                            <Trophy className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-foreground">{t("reports.team.title")}</h3>
                            <p className="text-sm text-muted">{t("reports.team.activeMembers", { n: data.length })}</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {/* Online indicator */}
                        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-full">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                            <span className="text-xs font-medium text-emerald-700">{t("reports.team.online", { n: onlineCount })}</span>
                        </div>

                        {onRefresh && (
                            <button
                                onClick={onRefresh}
                                className="p-2 rounded-xl hover:bg-gray-100 transition-colors"
                                title={t("reports.common.refresh")}
                            >
                                <RefreshCw className="w-4 h-4 text-muted" />
                            </button>
                        )}
                    </div>
                </div>

                {/* Summary stats */}
                <div className="grid grid-cols-4 gap-3 mb-6">
                    {[
                        { icon: Activity, label: t("reports.team.totalActions"), value: totalActions, color: "text-violet-600", bg: "bg-violet-100" },
                        { icon: Package, label: t("reports.team.created"), value: data.reduce((s, e) => s + e.ordersCreated, 0), color: "text-emerald-600", bg: "bg-emerald-100" },
                        { icon: CheckCircle2, label: t("reports.team.confirmed"), value: data.reduce((s, e) => s + e.confirmedOrders, 0), color: "text-blue-600", bg: "bg-blue-100" },
                        { icon: Truck, label: t("reports.common.delivered"), value: data.reduce((s, e) => s + e.deliveredOrders, 0), color: "text-amber-600", bg: "bg-amber-100" },
                    ].map((stat, i) => (
                        <div key={i} className="text-center p-3 rounded-xl bg-gray-50 border border-gray-100">
                            <div className={cn("w-8 h-8 rounded-lg mx-auto mb-2 flex items-center justify-center", stat.bg)}>
                                <stat.icon className={cn("w-4 h-4", stat.color)} />
                            </div>
                            <p className="text-xl font-bold text-foreground">{stat.value}</p>
                            <p className="text-[10px] text-muted">{stat.label}</p>
                        </div>
                    ))}
                </div>

                {/* Top 3 Podium */}
                <motion.div
                    variants={container}
                    initial="hidden"
                    animate="show"
                    className="grid grid-cols-3 gap-4 mb-6"
                >
                    {topPerformers.map((emp) => (
                        <motion.div
                            key={emp.userId}
                            variants={item}
                            className={cn(
                                "p-4 rounded-2xl text-white shadow-lg relative overflow-hidden",
                                `bg-gradient-to-br ${getMedalGradient(emp.rank)}`,
                                getMedalShadow(emp.rank)
                            )}
                        >
                            <div className="absolute top-2 right-2 opacity-20">
                                <Medal className="w-8 h-8" />
                            </div>

                            {/* Online indicator */}
                            {emp.isOnline && (
                                <div className="absolute top-2 left-2">
                                    <span className="w-2 h-2 rounded-full bg-white animate-pulse inline-block" />
                                </div>
                            )}

                            <div className="relative z-10">
                                <div className="text-xs font-bold opacity-90">#{emp.rank}</div>
                                <h4 className="text-lg font-bold mt-1 truncate">{emp.displayName}</h4>

                                <div className="mt-3 space-y-1.5">
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="opacity-80">{t("reports.team.actions")}</span>
                                        <span className="font-bold">{emp.totalActions}</span>
                                    </div>
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="opacity-80">{t("reports.team.createdShort")}</span>
                                        <span className="font-bold">{emp.ordersCreated}</span>
                                    </div>
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="opacity-80">{t("reports.team.avgDay")}</span>
                                        <span className="font-bold">{emp.avgActionsPerDay.toFixed(0)}</span>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </motion.div>

                {/* Other employees list */}
                {otherEmployees.length > 0 && (
                    <div className="space-y-2">
                        <h4 className="text-sm font-medium text-muted mb-2">{t("reports.team.others")}</h4>
                        {otherEmployees.map((emp, index) => (
                            <motion.div
                                key={emp.userId}
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: 0.3 + index * 0.05 }}
                                className="flex items-center gap-4 p-3 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors"
                            >
                                <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-sm font-bold text-gray-600 relative">
                                    {emp.rank}
                                    {emp.isOnline && (
                                        <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border border-white" />
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="font-semibold text-foreground truncate">{emp.displayName}</div>
                                    <div className="text-xs text-muted truncate">{emp.userEmail}</div>
                                </div>
                                <div className="flex items-center gap-6 text-sm">
                                    <div className="text-center">
                                        <span className="font-bold text-foreground">{emp.totalActions}</span>
                                        <span className="text-muted ml-1 text-xs">{t("reports.team.actions")}</span>
                                    </div>
                                    <div className="text-center hidden md:block">
                                        <span className="font-bold text-foreground">{emp.ordersCreated}</span>
                                        <span className="text-muted ml-1 text-xs">{t("reports.team.createdShort")}</span>
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                )}

                {/* Last updated */}
                {data[0]?.mostRecentAction && (
                    <div className="mt-4 pt-4 border-t border-gray-100 text-xs text-muted flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {t("reports.team.lastActivity", { when: formatDistanceToNow(data[0].mostRecentAction, { addSuffix: true, locale: language === "ar" ? arLocale : undefined }) })}
                    </div>
                )}
            </div>
        </motion.div>
    );
}
