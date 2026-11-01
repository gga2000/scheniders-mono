"use client";

import { useLanguage } from "@/hooks/use-language";
import { motion } from "framer-motion";
import { RejectionReasonMetrics } from "@/lib/analytics/reports-calculations";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";
import { XOctagon, MapPin, AlertCircle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { foldTail, seriesColor } from "@/lib/analytics/chart-categories";

interface RejectionBreakdownProps {
    data: RejectionReasonMetrics[];
}


export function RejectionBreakdown({ data }: RejectionBreakdownProps) {
    const { t } = useLanguage();
    // The calculator keys a reason-less rejection as "Unknown".
    const reasonLabel = (reason: string | undefined) =>
        reason === "Unknown" ? t("reports.reason.unknown") : (reason ?? "");
    const total = data.reduce((sum, d) => sum + d.count, 0);

    if (data.length === 0) {
        return (
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="pastel-card p-6 h-full bg-gradient-to-br from-emerald-50 dark:from-emerald-500/10 to-green-50 dark:to-green-500/10 border-emerald-200 dark:border-emerald-500/30"
            >
                <div className="flex flex-col items-center justify-center h-full text-center py-8">
                    <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center mb-4">
                        <CheckCircle2 className="w-8 h-8 text-emerald-600 dark:text-emerald-300" />
                    </div>
                    <h3 className="text-xl font-bold text-emerald-900 dark:text-emerald-300">{t("reports.rejection.none")}</h3>
                    <p className="text-sm text-emerald-700 dark:text-emerald-300 mt-2">{t("reports.rejection.noneDesc")}</p>
                </div>
            </motion.div>
        );
    }

    // Top five reasons plus one neutral "Other": the donut and the list show the same rows.
    const rows = foldTail(data, 5, tail => ({
        reason: t("reports.common.other"),
        count: tail.reduce((sum, r) => sum + r.count, 0),
        percentage: tail.reduce((sum, r) => sum + r.percentage, 0),
        topCity: undefined,
    }));
    const hasOther = rows.length !== data.length;
    const pieData = rows.map((d, i) => ({
        name: d.reason === "Unknown" ? t("reports.reason.unknown") : d.reason,
        value: d.count,
        percentage: d.percentage,
        topCity: d.topCity,
        color: seriesColor(i, rows.length, hasOther),
    }));

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="pastel-card p-6 h-full overflow-hidden relative"
        >
            {/* Background decoration */}
            <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-gradient-to-br from-rose-500/10 to-red-500/10 rounded-full blur-3xl" />

            <div className="relative z-10">
                <div className="flex items-start justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-rose-100 dark:bg-rose-500/20 rounded-xl text-rose-600 dark:text-rose-300">
                            <XOctagon className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-foreground">{t("reports.rejection.title")}</h3>
                            <p className="text-xs text-muted">{t("reports.rejection.total", { n: total })}</p>
                        </div>
                    </div>

                    {/* Total badge */}
                    <div className="px-3 py-1.5 bg-rose-100 dark:bg-rose-500/20 rounded-full">
                        <span className="text-sm font-bold text-rose-700 dark:text-rose-300">{total}</span>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Donut Chart */}
                    <div className="relative h-[220px]" role="img" aria-label={`${t("reports.rejection.title")}: ${pieData.map(d => `${d.name} ${d.value}`).join(", ")}`}>
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={pieData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={90}
                                    paddingAngle={2}
                                    dataKey="value"
                                    stroke="none"
                                >
                                    {pieData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Pie>
                                <Tooltip
                                    content={({ active, payload }) => {
                                        if (active && payload && payload.length) {
                                            const d = payload[0].payload;
                                            return (
                                                <div className="bg-white/95 dark:bg-neutral-900/95 backdrop-blur shadow-lg border border-border p-3 rounded-xl text-xs">
                                                    <p className="font-bold mb-1">{d.name}</p>
                                                    <p>{t("reports.common.count")}: {d.value} ({d.percentage.toFixed(1)}%)</p>
                                                    {d.topCity && <p>{t("reports.common.topCity")}: {d.topCity}</p>}
                                                </div>
                                            );
                                        }
                                        return null;
                                    }}
                                />
                            </PieChart>
                        </ResponsiveContainer>

                        {/* Center info */}
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <span className="text-3xl font-bold text-rose-600 dark:text-rose-300">{total}</span>
                            <span className="text-xs text-muted">{t("reports.rejection.rejections")}</span>
                        </div>
                    </div>

                    {/* Legend & Details */}
                    <div className="space-y-2 max-h-[220px] overflow-y-auto scrollbar-hide">
                        {rows.map((item, index) => (
                            <motion.div
                                key={item.reason}
                                initial={{ opacity: 0, x: 10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: index * 0.05 }}
                                className="p-3 rounded-xl bg-gray-50 dark:bg-white/5 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors border border-transparent hover:border-gray-200 dark:hover:border-white/20"
                            >
                                <div className="flex items-center gap-3">
                                    <div
                                        className="w-3 h-3 rounded-full flex-shrink-0"
                                        style={{ backgroundColor: seriesColor(index, rows.length, hasOther) }}
                                    />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-foreground truncate" title={item.reason}>{item.reason === "Unknown" ? t("reports.reason.unknown") : item.reason}</p>
                                        {item.topCity && (
                                            <p className="text-xs text-muted flex items-center gap-1 mt-0.5">
                                                <MapPin className="w-3 h-3" />
                                                {item.topCity}
                                            </p>
                                        )}
                                    </div>
                                    <div className="text-right flex-shrink-0">
                                        <p className="text-sm font-bold text-foreground">{item.count}</p>
                                        <p className="text-[10px] text-muted">{item.percentage.toFixed(0)}%</p>
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </div>

                {/* Warning insight */}
                {data.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                        className="mt-6 p-4 bg-gradient-to-r from-rose-50 dark:from-rose-500/10 to-red-50 dark:to-red-500/10 border border-rose-200 dark:border-rose-500/30 rounded-2xl"
                    >
                        <div className="flex items-start gap-3">
                            <div className="p-1.5 bg-rose-100 dark:bg-rose-500/20 rounded-lg text-rose-600 dark:text-rose-300">
                                <AlertCircle className="w-4 h-4" />
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-rose-900 dark:text-rose-300">{t("reports.rejection.topIssue", { reason: reasonLabel(data[0]?.reason) })}</p>
                                <p className="text-xs text-rose-700 dark:text-rose-300 mt-0.5">
                                    {data[0]?.topCity
                                        ? t("reports.rejection.topIssueCity", { pct: data[0].percentage.toFixed(0), city: data[0].topCity })
                                        : t("reports.rejection.topIssueDesc", { pct: data[0]?.percentage.toFixed(0) ?? "0" })}
                                </p>
                            </div>
                        </div>
                    </motion.div>
                )}
            </div>
        </motion.div>
    );
}
