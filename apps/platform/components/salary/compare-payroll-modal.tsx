"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X, TrendingUp, TrendingDown, ArrowRight } from "lucide-react";
import { format } from "date-fns";
import type { PayrollRecord } from "@/types/salary";

function fmtIQD(n: number) {
    return new Intl.NumberFormat("en-IQ").format(Math.round(n));
}

function fmtMonth(d: string) {
    try { return format(new Date(d + "T00:00:00"), "MMM yyyy"); } catch { return d; }
}

interface ComparePayrollModalProps {
    isOpen: boolean;
    onClose: () => void;
    recordA: PayrollRecord; // will be sorted to older
    recordB: PayrollRecord; // will be sorted to newer
    employeeName: string;
}

interface DiffRowProps {
    label: string;
    valueA: number;
    valueB: number;
    isCount?: boolean;
    isTotal?: boolean;
}

function DiffRow({ label, valueA, valueB, isCount = false, isTotal = false }: DiffRowProps) {
    const diff = valueB - valueA;
    const fmt = (n: number) => isCount ? String(n) : `${fmtIQD(n)} IQD`;

    return (
        <tr className={isTotal ? "border-t-2 border-[var(--card-border)] font-bold" : ""}>
            <td className={`py-2 pr-4 text-xs ${isTotal ? "text-foreground font-semibold" : "text-muted"}`}>
                {label}
            </td>
            <td className={`py-2 px-3 text-right text-xs tabular-nums ${isTotal ? "text-foreground font-bold" : "text-foreground"}`}>
                {fmt(valueA)}
            </td>
            <td className={`py-2 px-3 text-right text-xs tabular-nums ${isTotal ? "text-foreground font-bold" : "text-foreground"}`}>
                {fmt(valueB)}
            </td>
            <td className="py-2 pl-3 text-right text-xs tabular-nums w-28">
                {diff === 0 ? (
                    <span className="inline-flex items-center gap-0.5 text-muted">
                        <ArrowRight className="w-3 h-3" />
                        Same
                    </span>
                ) : diff > 0 ? (
                    <span className="inline-flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400 font-medium">
                        <TrendingUp className="w-3 h-3" />
                        +{fmt(diff)}
                    </span>
                ) : (
                    <span className="inline-flex items-center gap-0.5 text-rose-600 dark:text-rose-400 font-medium">
                        <TrendingDown className="w-3 h-3" />
                        {fmt(diff)}
                    </span>
                )}
            </td>
        </tr>
    );
}

export function ComparePayrollModal({
    isOpen,
    onClose,
    recordA,
    recordB,
    employeeName,
}: ComparePayrollModalProps) {
    // Always put the older record on the left
    const [older, newer] = recordA.period_end <= recordB.period_end
        ? [recordA, recordB]
        : [recordB, recordA];

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                        onClick={onClose}
                    />
                    <motion.div
                        initial={{ opacity: 0, scale: 0.96, y: 16 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.96, y: 16 }}
                        transition={{ duration: 0.2 }}
                        className="relative z-10 w-full max-w-lg bg-[var(--card-bg)] rounded-3xl shadow-2xl overflow-hidden"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--card-border)]">
                            <div>
                                <h2 className="text-sm font-semibold text-foreground">Period Comparison</h2>
                                <p className="text-xs text-muted">{employeeName}</p>
                            </div>
                            <button
                                onClick={onClose}
                                className="p-2 rounded-xl hover:bg-[var(--background)] text-muted hover:text-foreground transition-colors"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Table */}
                        <div className="px-6 py-4 overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-[var(--card-border)]">
                                        <th className="pb-2 text-left text-xs font-medium text-muted w-32">Metric</th>
                                        <th className="pb-2 px-3 text-right text-xs font-semibold text-foreground">
                                            {fmtMonth(older.period_end)}
                                        </th>
                                        <th className="pb-2 px-3 text-right text-xs font-semibold text-foreground">
                                            {fmtMonth(newer.period_end)}
                                        </th>
                                        <th className="pb-2 pl-3 text-right text-xs font-medium text-muted">Δ Change</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[var(--card-border)]">
                                    <DiffRow label="Orders" valueA={older.completed_orders_count} valueB={newer.completed_orders_count} isCount />
                                    <DiffRow label="Base Salary" valueA={older.base_salary} valueB={newer.base_salary} />
                                    <DiffRow label="Order Bonus" valueA={older.order_bonus} valueB={newer.order_bonus} />
                                    <DiffRow label="Perf. Bonuses" valueA={older.performance_bonuses_total} valueB={newer.performance_bonuses_total} />
                                    <DiffRow label="Gross Salary" valueA={older.gross_salary} valueB={newer.gross_salary} />
                                    <DiffRow label="Absence Deduction" valueA={older.absence_deduction} valueB={newer.absence_deduction} />
                                    <DiffRow label="Advances" valueA={older.advances_deducted} valueB={newer.advances_deducted} />
                                    <DiffRow label="Penalties" valueA={older.penalties_deducted} valueB={newer.penalties_deducted} />
                                    <DiffRow label="Net Salary" valueA={older.net_salary} valueB={newer.net_salary} isTotal />
                                </tbody>
                            </table>
                        </div>

                        {/* Footer */}
                        <div className="px-6 py-4 border-t border-[var(--card-border)] flex justify-end">
                            <button
                                onClick={onClose}
                                className="px-4 py-2 bg-[var(--ink)] text-white rounded-xl text-sm font-medium hover:opacity-90 transition-all"
                            >
                                Close
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
