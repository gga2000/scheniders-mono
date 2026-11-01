"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, CheckCircle, RefreshCw, Undo2, AlertTriangle, Package } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { useLanguage } from "@/hooks/use-language";
import type { OrderBreakdown, CountedOrderDetail, ReturnedAfterPayment, OrderBucket } from "@/types/salary";
import { formatPayrollDate } from "@/lib/payroll-date";

function fmtIQD(n: number) {
    return new Intl.NumberFormat("en-IQ").format(Math.round(n));
}

function fmtDate(d: string, isArabic: boolean) {
    return formatPayrollDate(d, isArabic ? "d MMM yyyy" : "MMM d, yyyy", isArabic ? ar : undefined);
}

const BUCKET_META: Record<OrderBucket, { labelKey: string; cls: string }> = {
    genuine: { labelKey: "payroll.breakdown.payable", cls: "bg-emerald-100 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400" },
    replacement: { labelKey: "payroll.breakdown.replacement", cls: "bg-amber-100 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400" },
    refund: { labelKey: "payroll.breakdown.refund", cls: "bg-rose-100 dark:bg-rose-900/20 text-rose-700 dark:text-rose-400" },
};

type Filter = "all" | OrderBucket;

const RENDER_CAP = 300;

interface OrderBreakdownModalProps {
    isOpen: boolean;
    onClose: () => void;
    employeeName: string;
    periodLabel: string;
    breakdown: OrderBreakdown;
    orderDetails: CountedOrderDetail[];
    returnedAfterPayment: ReturnedAfterPayment[];
    perOrderBonus: number;
}

export function OrderBreakdownModal({
    isOpen,
    onClose,
    employeeName,
    periodLabel,
    breakdown,
    orderDetails,
    returnedAfterPayment,
    perOrderBonus,
}: OrderBreakdownModalProps) {
    const { t, language } = useLanguage();
    const isArabic = language === "ar";
    const [filter, setFilter] = useState<Filter>("all");

    const filtered = useMemo(
        () => (filter === "all" ? orderDetails : orderDetails.filter(o => o.bucket === filter)),
        [orderDetails, filter]
    );
    const shown = filtered.slice(0, RENDER_CAP);
    const qualityPct = Math.round(breakdown.qualityScore * 100);

    if (!isOpen) return null;

    const tabs: { key: Filter; label: string; count: number }[] = [
        { key: "all", label: t("payroll.breakdown.all"), count: breakdown.completedTotal },
        { key: "genuine", label: t("payroll.breakdown.payable"), count: breakdown.genuine },
        { key: "replacement", label: t("payroll.breakdown.replacements"), count: breakdown.replacements },
        { key: "refund", label: t("payroll.breakdown.refunds"), count: breakdown.refunds },
    ];

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-50 flex items-center justify-center">
                <motion.div
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                    onClick={onClose}
                />
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    className="relative z-10 w-full max-w-2xl bg-[var(--card-bg)] rounded-3xl shadow-2xl mx-4 max-h-[88vh] flex flex-col"
                >
                    {/* Header */}
                    <div className="p-5 border-b border-[var(--card-border)] shrink-0 flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-[var(--background)] flex items-center justify-center">
                                <Package className="w-5 h-5 text-foreground" />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold text-foreground">{t("payroll.breakdown.title")}</h2>
                                <p className="text-xs text-muted">{employeeName} · {periodLabel}</p>
                            </div>
                        </div>
                        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[var(--background)] text-muted hover:text-foreground transition-colors">
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Summary stat row */}
                    <div className="px-5 py-4 border-b border-[var(--card-border)] shrink-0 grid grid-cols-2 sm:grid-cols-5 gap-2">
                        <Stat label={t("payroll.breakdown.completed")} value={breakdown.completedTotal} icon={<CheckCircle className="w-3.5 h-3.5" />} />
                        <Stat label={t("payroll.breakdown.payable")} value={breakdown.genuine} tone="emerald" />
                        <Stat label={t("payroll.breakdown.replacements")} value={breakdown.replacements} tone="amber" icon={<RefreshCw className="w-3.5 h-3.5" />} />
                        <Stat label={t("payroll.breakdown.refunds")} value={breakdown.refunds} tone="rose" icon={<Undo2 className="w-3.5 h-3.5" />} />
                        <Stat
                            label={t("payroll.breakdown.quality")}
                            valueText={breakdown.completedTotal > 0 ? `${qualityPct}%` : "—"}
                            tone={qualityPct >= 90 ? "emerald" : qualityPct >= 70 ? "amber" : "rose"}
                        />
                    </div>

                    {/* Payable math hint */}
                    {(breakdown.replacements > 0 || breakdown.refunds > 0) && (
                        <div className="mx-5 mt-3 flex items-start gap-2 p-2.5 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-xs text-muted shrink-0">
                            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-500" />
                            <span>
                                {t("payroll.breakdown.excluded", {
                                    total: breakdown.replacements + breakdown.refunds,
                                    replacements: breakdown.replacements,
                                    refunds: breakdown.refunds,
                                    genuine: breakdown.genuine,
                                    bonus: fmtIQD(perOrderBonus),
                                })}
                            </span>
                        </div>
                    )}

                    {/* Filter tabs */}
                    <div className="px-5 pt-3 shrink-0">
                        <div className="flex bg-[var(--background)] rounded-xl p-0.5 border border-[var(--card-border)] w-fit">
                            {tabs.map(tab => (
                                <button
                                    key={tab.key}
                                    onClick={() => setFilter(tab.key)}
                                    className={cn(
                                        "px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap",
                                        filter === tab.key ? "bg-[var(--ink)] text-white" : "text-muted hover:text-foreground"
                                    )}
                                >
                                    {tab.label} ({tab.count})
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Order list */}
                    <div className="flex-1 overflow-y-auto px-5 py-3 space-y-1">
                        {shown.length === 0 ? (
                            <p className="text-xs text-muted text-center py-8">{t("payroll.breakdown.empty")}</p>
                        ) : (
                            shown.map(o => (
                                <div key={o.id} className="flex items-center justify-between gap-3 py-2 px-3 rounded-xl bg-[var(--background)] text-sm">
                                    <div className="min-w-0">
                                        <p className="font-medium text-foreground truncate">
                                            #{o.orderId} <span className="text-muted font-normal">· {o.customerName}</span>
                                        </p>
                                        <p className="text-xs text-muted">
                                            {o.completedAt
                                                ? t("payroll.breakdown.completedOn", { date: fmtDate(o.completedAt, isArabic) })
                                                : fmtDate(o.createdAt, isArabic)}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <span className="text-xs text-muted tabular-nums">{fmtIQD(o.amount)} IQD</span>
                                        <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", BUCKET_META[o.bucket].cls)}>
                                            {t(BUCKET_META[o.bucket].labelKey)}
                                        </span>
                                    </div>
                                </div>
                            ))
                        )}
                        {filtered.length > RENDER_CAP && (
                            <p className="text-xs text-muted text-center py-2">
                                {t("payroll.breakdown.capped", { cap: RENDER_CAP, total: filtered.length })}
                            </p>
                        )}
                    </div>

                    {/* Returned after payment */}
                    {returnedAfterPayment.length > 0 && (
                        <div className="border-t border-[var(--card-border)] px-5 py-3 shrink-0 max-h-44 overflow-y-auto bg-rose-50/40 dark:bg-rose-900/5">
                            <div className="flex items-center gap-2 mb-2">
                                <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
                                <p className="text-xs font-semibold text-rose-600 dark:text-rose-400 uppercase tracking-wide">
                                    {t("payroll.breakdown.returnedTitle", { count: returnedAfterPayment.length })}
                                </p>
                            </div>
                            <p className="text-xs text-muted mb-2">
                                {t("payroll.breakdown.returnedHint")}
                            </p>
                            <div className="space-y-1">
                                {returnedAfterPayment.slice(0, 50).map(r => (
                                    <div key={r.id} className="flex items-center justify-between gap-2 text-xs py-1">
                                        <span className="text-foreground truncate">#{r.orderId} · {r.customerName}</span>
                                        <span className="text-muted shrink-0">{fmtDate(r.createdAt, isArabic)}</span>
                                    </div>
                                ))}
                                {returnedAfterPayment.length > 50 && (
                                    <p className="text-xs text-muted pt-1">{t("payroll.breakdown.more", { count: returnedAfterPayment.length - 50 })}</p>
                                )}
                            </div>
                        </div>
                    )}
                </motion.div>
            </div>
        </AnimatePresence>
    );
}

function Stat({
    label,
    value,
    valueText,
    tone = "default",
    icon,
}: {
    label: string;
    value?: number;
    valueText?: string;
    tone?: "default" | "emerald" | "amber" | "rose";
    icon?: React.ReactNode;
}) {
    const toneCls = {
        default: "text-foreground",
        emerald: "text-emerald-600 dark:text-emerald-400",
        amber: "text-amber-600 dark:text-amber-400",
        rose: "text-rose-600 dark:text-rose-400",
    }[tone];
    return (
        <div className="bg-[var(--background)] rounded-xl px-3 py-2 border border-[var(--card-border)]">
            <p className="text-xs text-muted leading-none mb-1 flex items-center gap-1">{icon}{label}</p>
            <p className={cn("text-base font-bold tabular-nums leading-none", toneCls)}>
                {valueText ?? value}
            </p>
        </div>
    );
}
