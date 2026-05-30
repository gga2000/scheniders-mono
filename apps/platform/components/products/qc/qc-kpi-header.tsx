"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { formatIQD, cn } from "@/lib/utils";
import {
    ShieldAlert,
    DollarSign,
    TrendingDown,
    Timer,
    AlertTriangle,
    Flame,
    TrendingUp,
} from "lucide-react";
import type { QCItem, QCReasonCategory } from "@/types/product";
import { useLanguage } from "@/components/providers/language-provider";

interface QCKpiHeaderProps {
    items: QCItem[];
    onKpiClick?: (kpi: "pending" | "value" | "writeoffRate" | "resolutionTime" | "overdue" | "topReason") => void;
}

function SparklineSvg({ values, color = "#f59e0b" }: { values: number[]; color?: string }) {
    if (values.length === 0) return null;
    const max = Math.max(...values, 1);
    const w = 80;
    const h = 24;
    const step = w / Math.max(values.length - 1, 1);
    const points = values.map((v, i) => `${i * step},${h - (v / max) * h}`).join(" ");
    const area = `0,${h} ${points} ${w},${h}`;
    return (
        <svg width={w} height={h} className="overflow-visible">
            <defs>
                <linearGradient id={`spark-${color}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity="0.3" />
                    <stop offset="100%" stopColor={color} stopOpacity="0" />
                </linearGradient>
            </defs>
            <polygon points={area} fill={`url(#spark-${color})`} />
            <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

function KpiCard({
    label,
    value,
    sub,
    icon: Icon,
    tint,
    trend,
    onClick,
    accent,
}: {
    label: string;
    value: string | number;
    sub?: React.ReactNode;
    icon: any;
    tint: string;
    trend?: number[];
    onClick?: () => void;
    accent?: "emerald" | "amber" | "rose" | "blue" | "violet";
}) {
    const accentColor = {
        emerald: "#10b981",
        amber: "#f59e0b",
        rose: "#f43f5e",
        blue: "#3b82f6",
        violet: "#8b5cf6",
    }[accent || "amber"];

    return (
        <motion.button
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.98 }}
            onClick={onClick}
            className="group relative text-left bg-[var(--card-bg)] border border-[var(--card-border)] shadow-[var(--card-shadow)] rounded-2xl p-4 overflow-hidden hover:shadow-lg transition-all"
        >
            <div className={cn("absolute -top-6 -right-6 w-24 h-24 rounded-full blur-2xl opacity-40", tint)} />
            <div className="relative flex items-start justify-between gap-3 mb-2">
                <div className={cn("p-2 rounded-xl", tint)}>
                    <Icon className="w-4 h-4" style={{ color: accentColor }} />
                </div>
                {trend && trend.length > 0 && (
                    <div className="opacity-80">
                        <SparklineSvg values={trend} color={accentColor} />
                    </div>
                )}
            </div>
            <div className="relative">
                <p className="text-xs font-medium text-muted uppercase tracking-wider">{label}</p>
                <p className="text-2xl font-bold mt-0.5 tabular-nums">{value}</p>
                {sub && <div className="mt-1 text-xs">{sub}</div>}
            </div>
        </motion.button>
    );
}

export function QCKpiHeader({ items, onKpiClick }: QCKpiHeaderProps) {
    const { t } = useLanguage();
    const stats = useMemo(() => {
        const now = Date.now();
        const DAY = 1000 * 60 * 60 * 24;

        const pending = items.filter((i) => i.status === "pending_inspection" || i.status === "in_inspection");
        const resolved = items.filter((i) => i.status === "restocked" || i.status === "written_off" || i.status === "returned_to_supplier");
        const writtenOff = items.filter((i) => i.status === "written_off");

        const pendingValue = pending.reduce((s, i) => s + (i.product?.cost || 0) * i.quantity, 0);

        // 7-day intake sparkline
        const intake7d: number[] = Array.from({ length: 7 }, (_, i) => {
            const dayStart = now - (6 - i) * DAY;
            const dayEnd = dayStart + DAY;
            return items.filter((it) => {
                const t = new Date(it.created_at).getTime();
                return t >= dayStart && t < dayEnd;
            }).length;
        });

        // Write-off rate: last 30d resolved
        const thirty = now - 30 * DAY;
        const resolvedRecent = resolved.filter((i) => i.resolved_at && new Date(i.resolved_at).getTime() >= thirty);
        const writtenOffRecent = writtenOff.filter((i) => i.resolved_at && new Date(i.resolved_at).getTime() >= thirty);
        const writeoffRate = resolvedRecent.length > 0 ? Math.round((writtenOffRecent.length / resolvedRecent.length) * 100) : 0;

        // Write-off trend (7 days)
        const writeoffTrend: number[] = Array.from({ length: 7 }, (_, i) => {
            const dayStart = now - (6 - i) * DAY;
            const dayEnd = dayStart + DAY;
            return writtenOff.filter((it) => {
                if (!it.resolved_at) return false;
                const t = new Date(it.resolved_at).getTime();
                return t >= dayStart && t < dayEnd;
            }).length;
        });

        // Avg resolution (hours)
        const resolutionTimes = resolved
            .filter((i) => i.resolved_at)
            .map((i) => (new Date(i.resolved_at!).getTime() - new Date(i.created_at).getTime()) / (1000 * 60 * 60));
        const avgResolution = resolutionTimes.length > 0 ? Math.round(resolutionTimes.reduce((a, b) => a + b, 0) / resolutionTimes.length) : 0;

        // Overdue (pending > 7d)
        const overdue = pending.filter((i) => now - new Date(i.created_at).getTime() > 7 * DAY);

        // Top reason (last 7d intake)
        const sevenAgo = now - 7 * DAY;
        const recentIntake = items.filter((i) => new Date(i.created_at).getTime() >= sevenAgo);
        const reasonCounts: Record<string, number> = {};
        for (const i of recentIntake) {
            const r = i.reason_category || "other";
            reasonCounts[r] = (reasonCounts[r] || 0) + 1;
        }
        const topReason = Object.entries(reasonCounts).sort((a, b) => b[1] - a[1])[0];

        return {
            pending,
            pendingCount: pending.length,
            pendingValue,
            intake7d,
            writeoffRate,
            writeoffTrend,
            avgResolution,
            overdueCount: overdue.length,
            topReason,
        };
    }, [items]);

    return (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <KpiCard
                label={t("qc.kpi.pending")}
                value={stats.pendingCount}
                sub={<span className="text-muted">{t("qc.kpi.pendingSub")}</span>}
                icon={ShieldAlert}
                tint="bg-amber-500/10"
                trend={stats.intake7d}
                accent="amber"
                onClick={() => onKpiClick?.("pending")}
            />
            <KpiCard
                label={t("qc.kpi.valueAtRisk")}
                value={formatIQD(stats.pendingValue)}
                sub={<span className="text-muted">{t("qc.kpi.valueAtRiskSub", { count: stats.pendingCount })}</span>}
                icon={DollarSign}
                tint="bg-blue-500/10"
                accent="blue"
                onClick={() => onKpiClick?.("value")}
            />
            <KpiCard
                label={t("qc.kpi.writeOffRate")}
                value={`${stats.writeoffRate}%`}
                sub={
                    <span className={cn("font-medium", stats.writeoffRate > 30 ? "text-rose-600" : "text-emerald-600")}>
                        {stats.writeoffRate > 30 ? t("qc.kpi.writeOffAbove") : t("qc.kpi.writeOffOnTarget")}
                    </span>
                }
                icon={TrendingDown}
                tint="bg-rose-500/10"
                trend={stats.writeoffTrend}
                accent="rose"
                onClick={() => onKpiClick?.("writeoffRate")}
            />
            <KpiCard
                label={t("qc.kpi.avgResolution")}
                value={`${stats.avgResolution}h`}
                sub={<span className="text-muted">{t("qc.kpi.avgResolutionSub")}</span>}
                icon={Timer}
                tint="bg-violet-500/10"
                accent="violet"
                onClick={() => onKpiClick?.("resolutionTime")}
            />
            <KpiCard
                label={t("qc.kpi.overdue")}
                value={stats.overdueCount}
                sub={
                    <span className={stats.overdueCount > 0 ? "text-rose-600 font-medium" : "text-emerald-600"}>
                        {stats.overdueCount > 0 ? t("qc.kpi.overdueSub") : t("qc.kpi.overdueNone")}
                    </span>
                }
                icon={AlertTriangle}
                tint="bg-orange-500/10"
                accent="rose"
                onClick={() => onKpiClick?.("overdue")}
            />
            <KpiCard
                label={t("qc.kpi.topReason")}
                value={stats.topReason ? t(`qc.reason.${stats.topReason[0] as QCReasonCategory}`) : "—"}
                sub={
                    stats.topReason ? (
                        <span className="inline-flex items-center gap-1 text-muted">
                            <Flame className="w-3 h-3 text-orange-500" /> {t("qc.kpi.topReasonSub", { count: stats.topReason[1] })}
                        </span>
                    ) : (
                        <span className="text-muted">{t("qc.kpi.noData")}</span>
                    )
                }
                icon={TrendingUp}
                tint="bg-emerald-500/10"
                accent="emerald"
                onClick={() => onKpiClick?.("topReason")}
            />
        </div>
    );
}
