"use client";

import { useLanguage } from "@/hooks/use-language";
import { motion } from "framer-motion";
import { ContactAttemptMetrics } from "@/lib/analytics/reports-calculations";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";
import { MessageCircle, TrendingDown, Zap } from "lucide-react";

interface ContactHeatmapProps {
    data: ContactAttemptMetrics[];
}

const container = {
    hidden: { opacity: 0 },
    show: {
        opacity: 1,
        transition: { staggerChildren: 0.1 }
    }
};

const item = {
    hidden: { scale: 0.8, opacity: 0 },
    show: { scale: 1, opacity: 1 }
};

export function ContactHeatmap({ data }: ContactHeatmapProps) {
    const { t } = useLanguage();
    // Best-converting bucket, among buckets with orders (needs 2+ to be a comparison).
    const populated = data.filter(d => d.count > 0);
    const best = populated.length > 1
        ? populated.reduce((top, d) => (d.confirmationRate > top.confirmationRate ? d : top))
        : null;
    const totalCount = data.reduce((sum, d) => sum + d.count, 0);

    // Calculate the best performing bucket
    const bestBucket = data.reduce((best, curr) =>
        curr.confirmationRate > best.confirmationRate ? curr : best
        , { confirmationRate: 0, label: '', attempts: 0, count: 0, color: '' });

    const pieData = data.map(d => ({
        name: d.label,
        value: d.count,
        color: d.color,
        confirmationRate: d.confirmationRate,
    }));

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="pastel-card p-6 h-full overflow-hidden relative"
        >
            {/* Background decoration */}
            <div className="absolute -top-10 -right-10 w-40 h-40 bg-gradient-to-br from-violet-500/10 to-purple-500/10 rounded-full blur-2xl" />

            <div className="relative z-10">
                <div className="flex items-start justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-violet-100 rounded-xl text-violet-600">
                            <MessageCircle className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-foreground">{t("reports.contact.title")}</h3>
                            <p className="text-xs text-muted">{t("reports.contact.subtitle")}</p>
                        </div>
                    </div>
                </div>

                {/* Main grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Pie Chart */}
                    <div className="relative h-[200px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={pieData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={50}
                                    outerRadius={80}
                                    paddingAngle={3}
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
                                                <div className="bg-white/95 backdrop-blur shadow-lg border border-border p-3 rounded-xl text-xs">
                                                    <p className="font-bold mb-1">{d.name}</p>
                                                    <p>Orders: {d.value}</p>
                                                    <p>Confirmation: {d.confirmationRate.toFixed(0)}%</p>
                                                </div>
                                            );
                                        }
                                        return null;
                                    }}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                        {/* Center stat */}
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <span className="text-2xl font-bold text-foreground">{totalCount}</span>
                            <span className="text-xs text-muted">{t("reports.contact.orders")}</span>
                        </div>
                    </div>

                    {/* Cards grid */}
                    <motion.div
                        variants={container}
                        initial="hidden"
                        animate="show"
                        className="grid grid-cols-2 gap-3"
                    >
                        {data.map((d) => (
                            <motion.div
                                key={d.attempts}
                                variants={item}
                                className="p-3 rounded-xl border-2 transition-all hover:scale-[1.02] cursor-pointer"
                                style={{
                                    borderColor: `${d.color}40`,
                                    backgroundColor: `${d.color}10`
                                }}
                            >
                                <div
                                    className="text-xs font-bold mb-1"
                                    style={{ color: d.color }}
                                >
                                    {t(`reports.contact.bucket.${d.attempts}`, d.label)}
                                </div>
                                <div className="text-xl font-bold text-foreground">{d.count}</div>
                                <div className="flex items-center gap-1 mt-1">
                                    <span className="text-[10px] text-muted">{t("reports.contact.conv")}</span>
                                    <span
                                        className="text-xs font-bold"
                                        style={{ color: d.confirmationRate >= 50 ? '#22C55E' : '#F59E0B' }}
                                    >
                                        {d.confirmationRate.toFixed(0)}%
                                    </span>
                                </div>
                            </motion.div>
                        ))}
                    </motion.div>
                </div>

                {/* Insight: derived from the buckets, only when there is something to compare */}
                {best && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.5 }}
                        className="mt-6 p-4 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-2xl"
                    >
                        <div className="flex items-start gap-3">
                            <div className="p-1.5 bg-amber-100 rounded-lg text-amber-600">
                                <Zap className="w-4 h-4" />
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-amber-900">{t("reports.common.insight")}</p>
                                <p className="text-xs text-amber-700 mt-0.5">
                                    {t("reports.contact.insight", { label: t(`reports.contact.bucket.${best.attempts}`, best.label), pct: best.confirmationRate.toFixed(0) })}
                                </p>
                            </div>
                        </div>
                    </motion.div>
                )}
            </div>
        </motion.div>
    );
}
