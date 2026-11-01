"use client";

import { useLanguage } from "@/hooks/use-language";
import { motion } from "framer-motion";
import { StatusFlowMetrics } from "@/lib/analytics/reports-calculations";
import { ArrowDown, Zap } from "lucide-react";

interface StatusFlowDiagramProps {
    data: StatusFlowMetrics[];
}

const STATUS_COLORS: Record<string, string> = {
    new: "#3B82F6",
    contacted: "#8B5CF6",
    confirmed: "#10B981",
    cancelled: "#6B7280",
    no_response: "#F59E0B",
    in_transit: "#06B6D4",
    delivered: "#22C55E",
    rejected: "#EF4444",
    completed: "#14B8A6",
    return_pending: "#F97316",
    pending_checkout: "#A855F7",
};

export function StatusFlowDiagram({ data }: StatusFlowDiagramProps) {
    const { t } = useLanguage();
    if (!data.length) {
        return (
            <div className="pastel-card p-6 h-[400px] flex items-center justify-center">
                <p className="text-muted">{t("reports.pipeline.empty")}</p>
            </div>
        );
    }

    const totalOrders = data.reduce((sum, d) => sum + d.count, 0);
    // Delivered AND completed both count: `find` kept only the first of the two.
    const deliveredCount = data
        .filter(d => d.status === 'delivered' || d.status === 'completed')
        .reduce((sum, d) => sum + d.count, 0);
    const conversionRate = totalOrders > 0 ? (deliveredCount / totalOrders * 100) : 0;

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="pastel-card p-6 overflow-hidden relative"
        >
            {/* Background glow */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-indigo-500/10 to-purple-500/10 rounded-full blur-3xl" />

            <div className="relative z-10">
                <div className="flex items-start justify-between mb-6">
                    <div>
                        <h3 className="text-xl font-bold text-foreground flex items-center gap-2">
                            <div className="p-2 bg-indigo-100 dark:bg-indigo-500/20 rounded-xl text-indigo-600 dark:text-indigo-300">
                                <Zap className="w-5 h-5" />
                            </div>
                            {t("reports.pipeline.title")}
                        </h3>
                        <p className="text-sm text-muted mt-1">{t("reports.pipeline.subtitle")}</p>
                    </div>

                    {/* Conversion rate badge */}
                    <div className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-green-600 rounded-2xl text-white shadow-lg shadow-emerald-500/20">
                        <p className="text-xs opacity-80">{t("reports.pipeline.delivered")}</p>
                        <p className="text-xl font-bold">{conversionRate.toFixed(1)}%</p>
                    </div>
                </div>

                {/* Main content grid */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-12 gap-y-4">
                    {/* Status bars */}
                    <div className="contents">
                        {data.map((status, index) => {
                            const color = STATUS_COLORS[status.status] || "#64748B";
                            const maxCount = Math.max(...data.map(d => d.count), 1);
                            const width = (status.count / maxCount) * 100;

                            return (
                                <motion.div
                                    key={status.status}
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: index * 0.05 }}
                                    className="group"
                                >
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-sm font-medium text-foreground">{t(`reports.status.${status.status}`, status.label)}</span>
                                        <span className="text-sm text-muted">
                                            {status.count.toLocaleString()} <span className="text-xs">({status.percentage.toFixed(1)}%)</span>
                                        </span>
                                    </div>
                                    <div className="h-2 bg-gray-100 dark:bg-white/10 rounded-full overflow-hidden">
                                        <motion.div
                                            initial={{ width: 0 }}
                                            animate={{ width: `${width}%` }}
                                            transition={{ duration: 0.8, delay: index * 0.05 }}
                                            className="h-full rounded-full transition-all group-hover:brightness-110"
                                            style={{ backgroundColor: color }}
                                        />
                                    </div>
                                </motion.div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </motion.div>
    );
}
