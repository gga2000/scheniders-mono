"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { formatIQD, cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, DollarSign, Timer, AlertCircle, Award } from "lucide-react";
import type { QCItem, QCReasonCategory } from "@/types/product";
import { autoTagReason } from "./qc-constants";
import { useLanguage } from "@/components/providers/language-provider";

type TimeRange = 14 | 30 | 90;

interface QCAnalyticsTabProps {
    items: QCItem[];
}

function SectionCard({
    title,
    subtitle,
    children,
    icon: Icon,
    accent,
}: {
    title: string;
    subtitle?: string;
    children: React.ReactNode;
    icon?: any;
    accent?: string;
}) {
    return (
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] shadow-[var(--card-shadow)] rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-4">
                {Icon && (
                    <div className={cn("p-2 rounded-lg", accent || "bg-amber-500/10 text-amber-600")}>
                        <Icon className="w-4 h-4" />
                    </div>
                )}
                <div>
                    <h3 className="text-sm font-bold">{title}</h3>
                    {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
                </div>
            </div>
            {children}
        </div>
    );
}

function IntakeChart({ items, days }: { items: QCItem[]; days: number }) {
    const data = useMemo(() => {
        const now = Date.now();
        const DAY = 1000 * 60 * 60 * 24;
        return Array.from({ length: days }, (_, i) => {
            const dayStart = now - (days - 1 - i) * DAY;
            const dayEnd = dayStart + DAY;
            const dayItems = items.filter((it) => {
                const t = new Date(it.created_at).getTime();
                return t >= dayStart && t < dayEnd;
            });
            const writeOffs = dayItems.filter((i) => i.status === "written_off").length;
            const restocks = dayItems.filter((i) => i.status === "restocked").length;
            return {
                date: new Date(dayStart),
                total: dayItems.length,
                writeOffs,
                restocks,
            };
        });
    }, [items, days]);

    const max = Math.max(...data.map((d) => d.total), 1);
    const W = 600;
    const H = 180;
    const step = W / Math.max(data.length - 1, 1);

    const linePoints = data.map((d, i) => `${i * step},${H - (d.total / max) * (H - 20) - 10}`).join(" ");
    const areaPoints = `0,${H} ${linePoints} ${W},${H}`;

    return (
        <div className="w-full">
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-44">
                <defs>
                    <linearGradient id="intake-gradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.35" />
                        <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
                    </linearGradient>
                </defs>
                {/* Grid lines */}
                {[0.25, 0.5, 0.75].map((t) => (
                    <line
                        key={t}
                        x1="0"
                        y1={H * t}
                        x2={W}
                        y2={H * t}
                        stroke="currentColor"
                        strokeDasharray="2 4"
                        className="text-[var(--card-border)]"
                    />
                ))}
                <polygon points={areaPoints} fill="url(#intake-gradient)" />
                <polyline points={linePoints} fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                {data.map((d, i) => (
                    <g key={i}>
                        <circle cx={i * step} cy={H - (d.total / max) * (H - 20) - 10} r={d.total > 0 ? 3 : 0} fill="#f59e0b" />
                    </g>
                ))}
            </svg>
            <div className="flex justify-between text-[10px] text-muted mt-1 px-1">
                <span>{data[0]?.date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
                <span>{data[Math.floor(data.length / 2)]?.date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
                <span>{data[data.length - 1]?.date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
            </div>
        </div>
    );
}

function ResolutionDonut({ items }: { items: QCItem[] }) {
    const { t } = useLanguage();
    const counts = useMemo(() => {
        const resolved = items.filter((i) => ["restocked", "written_off", "returned_to_supplier"].includes(i.status));
        return {
            restocked: resolved.filter((i) => i.status === "restocked").length,
            writtenOff: resolved.filter((i) => i.status === "written_off").length,
            returned: resolved.filter((i) => i.status === "returned_to_supplier").length,
            total: resolved.length,
        };
    }, [items]);

    const total = counts.total || 1;
    const segments = [
        { label: t("qc.analytics.legend.restocked"), value: counts.restocked, color: "#10b981" },
        { label: t("qc.analytics.legend.writtenOff"), value: counts.writtenOff, color: "#f43f5e" },
        { label: t("qc.analytics.legend.returned"), value: counts.returned, color: "#8b5cf6" },
    ];
    const R = 60;
    const C = 2 * Math.PI * R;
    let offset = 0;

    return (
        <div className="flex items-center gap-5">
            <svg viewBox="0 0 160 160" className="w-32 h-32 -rotate-90">
                <circle cx="80" cy="80" r={R} fill="none" stroke="var(--card-border)" strokeWidth="16" />
                {segments.map((seg) => {
                    if (seg.value === 0) return null;
                    const length = (seg.value / total) * C;
                    const circle = (
                        <circle
                            key={seg.label}
                            cx="80"
                            cy="80"
                            r={R}
                            fill="none"
                            stroke={seg.color}
                            strokeWidth="16"
                            strokeDasharray={`${length} ${C - length}`}
                            strokeDashoffset={-offset}
                            strokeLinecap="butt"
                        />
                    );
                    offset += length;
                    return circle;
                })}
            </svg>
            <div className="space-y-2 flex-1">
                {segments.map((seg) => (
                    <div key={seg.label} className="flex items-center gap-2 text-sm">
                        <span className="w-3 h-3 rounded" style={{ background: seg.color }} />
                        <span className="font-medium">{seg.label}</span>
                        <span className="ml-auto tabular-nums font-bold">{seg.value}</span>
                        <span className="text-xs text-muted w-10 text-right">
                            {total > 0 ? Math.round((seg.value / total) * 100) : 0}%
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}

function TopBarList({
    data,
    accent = "#f59e0b",
}: {
    data: { label: string; value: number; sub?: string }[];
    accent?: string;
}) {
    const { t } = useLanguage();
    const max = Math.max(...data.map((d) => d.value), 1);
    if (data.length === 0) return <p className="text-sm text-muted italic">{t("qc.analytics.noData")}</p>;
    return (
        <ul className="space-y-2">
            {data.map((d, i) => (
                <li key={i}>
                    <div className="flex items-center justify-between text-xs mb-1">
                        <span className="font-medium text-foreground truncate max-w-[75%]">{d.label}</span>
                        <span className="font-bold tabular-nums">{d.value}</span>
                    </div>
                    <div className="h-2 bg-[var(--background)] rounded-full overflow-hidden">
                        <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${(d.value / max) * 100}%` }}
                            transition={{ duration: 0.5, delay: i * 0.05 }}
                            className="h-full rounded-full"
                            style={{ background: accent }}
                        />
                    </div>
                    {d.sub && <p className="text-[10px] text-muted mt-0.5">{d.sub}</p>}
                </li>
            ))}
        </ul>
    );
}

export function QCAnalyticsTab({ items }: QCAnalyticsTabProps) {
    const { t } = useLanguage();
    const [range, setRange] = useState<TimeRange>(30);

    const scoped = useMemo(() => {
        const cutoff = Date.now() - range * 24 * 60 * 60 * 1000;
        return items.filter((i) => new Date(i.created_at).getTime() >= cutoff);
    }, [items, range]);

    const resolved = scoped.filter((i) => ["restocked", "written_off", "returned_to_supplier"].includes(i.status));
    const writtenOff = scoped.filter((i) => i.status === "written_off");
    const writtenOffValue = writtenOff.reduce((s, i) => s + (i.product?.cost || 0) * i.quantity, 0);
    const writeoffRate = resolved.length > 0 ? Math.round((writtenOff.length / resolved.length) * 100) : 0;

    // Top products
    const byProduct: Record<string, { name: string; count: number }> = {};
    for (const i of scoped) {
        const name = i.product?.name || t("qc.unknownProduct");
        if (!byProduct[i.product_id]) byProduct[i.product_id] = { name, count: 0 };
        byProduct[i.product_id].count += 1;
    }
    const topProducts = Object.values(byProduct)
        .sort((a, b) => b.count - a.count)
        .slice(0, 5)
        .map((p) => ({ label: p.name, value: p.count }));

    // Top reasons
    const byReason: Record<string, number> = {};
    for (const i of scoped) {
        const cat = i.reason_category || autoTagReason(i.reason);
        byReason[cat] = (byReason[cat] || 0) + 1;
    }
    const topReasons = Object.entries(byReason)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([cat, count]) => ({
            label: t(`qc.reason.${cat as QCReasonCategory}`),
            value: count,
        }));

    // Resolution time histogram (bucketed hours: <4h, 4-12h, 12-24h, 1-3d, 3-7d, >7d)
    const buckets = [
        { label: t("qc.analytics.bucket.lt4h"), min: 0, max: 4 },
        { label: t("qc.analytics.bucket.4to12h"), min: 4, max: 12 },
        { label: t("qc.analytics.bucket.12to24h"), min: 12, max: 24 },
        { label: t("qc.analytics.bucket.1to3d"), min: 24, max: 72 },
        { label: t("qc.analytics.bucket.3to7d"), min: 72, max: 168 },
        { label: t("qc.analytics.bucket.gt7d"), min: 168, max: Infinity },
    ];
    const histogram = buckets.map((b) => {
        const count = resolved.filter((i) => {
            if (!i.resolved_at) return false;
            const hours = (new Date(i.resolved_at).getTime() - new Date(i.created_at).getTime()) / (1000 * 60 * 60);
            return hours >= b.min && hours < b.max;
        }).length;
        return { label: b.label, value: count };
    });

    // Inspector leaderboard
    const byInspector: Record<string, { count: number; totalHours: number }> = {};
    for (const i of resolved) {
        if (!i.resolved_by) continue;
        if (!byInspector[i.resolved_by]) byInspector[i.resolved_by] = { count: 0, totalHours: 0 };
        byInspector[i.resolved_by].count += 1;
        if (i.resolved_at) {
            byInspector[i.resolved_by].totalHours +=
                (new Date(i.resolved_at).getTime() - new Date(i.created_at).getTime()) / (1000 * 60 * 60);
        }
    }
    const leaderboard = Object.entries(byInspector)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 5)
        .map(([id, stats]) => ({
            label: t("qc.analytics.inspectorLabel", { id: id.slice(0, 8) }),
            value: stats.count,
            sub: t("qc.analytics.inspectorAvg", { hours: Math.round(stats.totalHours / stats.count) }),
        }));

    // Avg resolution
    const avgResolution =
        resolved.length > 0
            ? Math.round(
                  resolved
                      .filter((i) => i.resolved_at)
                      .reduce((s, i) => s + (new Date(i.resolved_at!).getTime() - new Date(i.created_at).getTime()) / (1000 * 60 * 60), 0) /
                      resolved.filter((i) => i.resolved_at).length
              )
            : 0;

    return (
        <div className="space-y-4">
            {/* Range selector */}
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold">{t("qc.analytics.title")}</h2>
                <div className="flex items-center p-1 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl">
                    {([14, 30, 90] as TimeRange[]).map((r) => (
                        <button
                            key={r}
                            onClick={() => setRange(r)}
                            className={cn(
                                "px-3 py-1 rounded-lg text-xs font-medium transition",
                                range === r ? "bg-[var(--ink)] text-white" : "text-muted hover:text-foreground"
                            )}
                        >
                            {t("qc.analytics.rangeShort", { days: r })}
                        </button>
                    ))}
                </div>
            </div>

            {/* Top financial callouts */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <SectionCard title={t("qc.analytics.writeOffLoss")} icon={DollarSign} accent="bg-rose-500/10 text-rose-600">
                    <p className="text-2xl font-bold tabular-nums">{formatIQD(writtenOffValue)}</p>
                    <p className="text-xs text-muted mt-1">{t("qc.analytics.writeOffLossSub", { count: writtenOff.length })}</p>
                </SectionCard>
                <SectionCard title={t("qc.analytics.writeOffRate")} icon={writeoffRate > 30 ? TrendingUp : TrendingDown} accent={writeoffRate > 30 ? "bg-rose-500/10 text-rose-600" : "bg-emerald-500/10 text-emerald-600"}>
                    <p className="text-2xl font-bold tabular-nums">{writeoffRate}%</p>
                    <p className="text-xs text-muted mt-1">{t("qc.analytics.writeOffRateSub")}</p>
                </SectionCard>
                <SectionCard title={t("qc.analytics.avgResolution")} icon={Timer} accent="bg-violet-500/10 text-violet-600">
                    <p className="text-2xl font-bold tabular-nums">{t("qc.analytics.avgResolutionValue", { hours: avgResolution })}</p>
                    <p className="text-xs text-muted mt-1">{t("qc.analytics.avgResolutionSub")}</p>
                </SectionCard>
            </div>

            {/* Intake trend + resolution donut */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                <div className="lg:col-span-2">
                    <SectionCard title={t("qc.analytics.intakeTrend")} subtitle={t("qc.analytics.intakeTrendSub", { days: range })} icon={TrendingUp}>
                        <IntakeChart items={scoped} days={range} />
                    </SectionCard>
                </div>
                <SectionCard title={t("qc.analytics.resolutionMix")} subtitle={t("qc.analytics.resolutionMixSub")} icon={AlertCircle}>
                    <ResolutionDonut items={scoped} />
                </SectionCard>
            </div>

            {/* Top products + top reasons */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <SectionCard title={t("qc.analytics.topProducts")} subtitle={t("qc.analytics.topProductsSub")} icon={AlertCircle} accent="bg-orange-500/10 text-orange-600">
                    <TopBarList data={topProducts} accent="#f97316" />
                </SectionCard>
                <SectionCard title={t("qc.analytics.topReasons")} subtitle={t("qc.analytics.topReasonsSub")} icon={AlertCircle} accent="bg-rose-500/10 text-rose-600">
                    <TopBarList data={topReasons} accent="#f43f5e" />
                </SectionCard>
            </div>

            {/* Histogram + leaderboard */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <SectionCard title={t("qc.analytics.resolutionTime")} subtitle={t("qc.analytics.resolutionTimeSub")} icon={Timer} accent="bg-violet-500/10 text-violet-600">
                    <TopBarList data={histogram} accent="#8b5cf6" />
                </SectionCard>
                <SectionCard title={t("qc.analytics.leaderboard")} subtitle={t("qc.analytics.leaderboardSub")} icon={Award} accent="bg-emerald-500/10 text-emerald-600">
                    <TopBarList data={leaderboard} accent="#10b981" />
                </SectionCard>
            </div>
        </div>
    );
}
