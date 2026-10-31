"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Settings, History, TrendingUp, TrendingDown } from "lucide-react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { useLanguage } from "@/hooks/use-language";
import type { EffectiveSalaryRate } from "@/types/salary";
import type { SalaryConfigHistoryRow } from "@/hooks/use-salary-config";

function fmtIQD(n: number | null) {
    if (n === null) return "—";
    return new Intl.NumberFormat("en-IQ").format(Math.round(n));
}

interface SalaryConfigFormProps {
    isOpen: boolean;
    onClose: () => void;
    employeeName: string;
    employeeId: string;
    currentRate: EffectiveSalaryRate;
    onSubmit: (config: {
        base_monthly_salary: number;
        per_order_bonus: number;
        use_role_defaults: boolean;
    }) => Promise<void>;
    /** Loads the member's last rate changes when the form opens. */
    loadHistory: (employeeId: string) => Promise<SalaryConfigHistoryRow[]>;
}

export function SalaryConfigForm({
    isOpen,
    onClose,
    employeeName,
    employeeId,
    currentRate,
    onSubmit,
    loadHistory,
}: SalaryConfigFormProps) {
    const [baseSalary, setBaseSalary] = useState(currentRate.baseMonthlySalary);
    const [perOrderBonus, setPerOrderBonus] = useState(currentRate.perOrderBonus);
    const [useRoleDefaults, setUseRoleDefaults] = useState(currentRate.source === "role_default");
    const [loading, setLoading] = useState(false);
    const [history, setHistory] = useState<SalaryConfigHistoryRow[]>([]);
    const [historyOpen, setHistoryOpen] = useState(false);
    const [historyFailed, setHistoryFailed] = useState(false);

    const { t, language } = useLanguage();

    useEffect(() => {
        if (isOpen) {
            setBaseSalary(currentRate.baseMonthlySalary);
            setPerOrderBonus(currentRate.perOrderBonus);
            setUseRoleDefaults(currentRate.source === "role_default");
            setHistoryOpen(false);
            setHistory([]);
            setHistoryFailed(false);
            loadHistory(employeeId).then(setHistory, () => setHistoryFailed(true));
        }
    }, [isOpen, currentRate, employeeId, loadHistory]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            await onSubmit({
                base_monthly_salary: baseSalary,
                per_order_bonus: perOrderBonus,
                use_role_defaults: useRoleDefaults,
            });
            onClose();
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-50 flex items-center justify-center">
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                    onClick={onClose}
                />
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    className="relative z-10 w-full max-w-md bg-[var(--card-bg)] rounded-3xl shadow-2xl mx-4 max-h-[90vh] overflow-y-auto"
                >
                    <div className="flex items-center justify-between p-6 border-b border-[var(--card-border)]">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-[var(--pastel-pink)] flex items-center justify-center">
                                <Settings className="w-5 h-5 text-rose-700" />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold text-foreground">{t("payroll.config.title")}</h2>
                                <p className="text-xs text-muted">{employeeName}</p>
                            </div>
                        </div>
                        <button onClick={onClose} className="p-2 rounded-xl hover:bg-[var(--background)] transition-colors">
                            <X className="w-5 h-5 text-muted" />
                        </button>
                    </div>

                    <form onSubmit={handleSubmit} className="p-6 space-y-5">
                        {/* Use role defaults toggle */}
                        <div className="flex items-center gap-3 p-4 bg-[var(--background)] rounded-xl border border-[var(--card-border)]">
                            <input
                                type="checkbox"
                                id="useRoleDefaults"
                                checked={useRoleDefaults}
                                onChange={e => setUseRoleDefaults(e.target.checked)}
                                className="w-4 h-4 rounded"
                            />
                            <label htmlFor="useRoleDefaults" className="text-sm text-foreground">
                                {t("payroll.config.useDefaults")}
                            </label>
                        </div>

                        <div className={useRoleDefaults ? "opacity-40 pointer-events-none" : ""}>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-foreground mb-2">
                                        {t("payroll.config.base")}
                                    </label>
                                    <input
                                        type="number"
                                        value={baseSalary || ""}
                                        onChange={e => setBaseSalary(parseFloat(e.target.value) || 0)}
                                        min={0}
                                        placeholder="850000"
                                        className="w-full px-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--ink)]/30 transition-all"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-foreground mb-2">
                                        {t("payroll.config.perOrder")}
                                    </label>
                                    <input
                                        type="number"
                                        value={perOrderBonus || ""}
                                        onChange={e => setPerOrderBonus(parseFloat(e.target.value) || 0)}
                                        min={0}
                                        placeholder="500"
                                        className="w-full px-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--ink)]/30 transition-all"
                                    />
                                    <p className="text-xs text-muted mt-1.5">
                                        {t("payroll.config.perOrderHint")}
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-3 pt-2">
                            <button
                                type="button"
                                onClick={onClose}
                                className="flex-1 px-4 py-3 bg-[var(--background)] text-foreground rounded-xl font-medium hover:bg-[var(--card-border)] transition-colors"
                            >
                                {t("payroll.config.cancel")}
                            </button>
                            <button
                                type="submit"
                                disabled={loading}
                                className="flex-1 px-4 py-3 bg-[var(--ink)] text-white rounded-xl font-medium hover:opacity-90 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {loading ? (
                                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                ) : (
                                    t("payroll.config.save")
                                )}
                            </button>
                        </div>
                    </form>

                    {historyFailed && (
                        <p role="alert" className="text-xs text-rose-600">{t("payroll.config.historyFailed")}</p>
                    )}
                    {/* Change history */}
                    {history.length > 0 && (
                        <div className="px-6 pb-6">
                            <button
                                onClick={() => setHistoryOpen(v => !v)}
                                className="flex items-center gap-2 text-xs font-medium text-muted hover:text-foreground transition-colors mb-3"
                            >
                                <History className="w-3.5 h-3.5" />
                                {t("payroll.config.history", { count: history.length })}
                                <span className="ml-auto">{historyOpen ? "▲" : "▼"}</span>
                            </button>
                            {historyOpen && (
                                <div className="space-y-2">
                                    {history.map(row => {
                                        const baseUp = row.new_base_salary !== null && row.old_base_salary !== null && row.new_base_salary > row.old_base_salary;
                                        const baseDown = row.new_base_salary !== null && row.old_base_salary !== null && row.new_base_salary < row.old_base_salary;
                                        return (
                                            <div key={row.id} className="p-3 bg-[var(--background)] rounded-xl text-xs space-y-1">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-muted">
                                                        {format(new Date(row.created_at), "MMM d, yyyy · HH:mm", { locale: language === "ar" ? ar : undefined })}
                                                    </span>
                                                    {baseUp && <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />}
                                                    {baseDown && <TrendingDown className="w-3.5 h-3.5 text-rose-500" />}
                                                </div>
                                                {(row.old_base_salary !== row.new_base_salary) && (
                                                    <div className="flex items-center gap-1.5 text-foreground">
                                                        <span className="text-muted line-through">{fmtIQD(row.old_base_salary)}</span>
                                                        <span>→</span>
                                                        <span className="font-medium">{t("payroll.config.baseSuffix", { amount: fmtIQD(row.new_base_salary) })}</span>
                                                    </div>
                                                )}
                                                {(row.old_per_order !== row.new_per_order) && (
                                                    <div className="flex items-center gap-1.5 text-foreground">
                                                        <span className="text-muted line-through">{fmtIQD(row.old_per_order)}</span>
                                                        <span>→</span>
                                                        <span className="font-medium">{t("payroll.config.orderSuffix", { amount: fmtIQD(row.new_per_order) })}</span>
                                                    </div>
                                                )}
                                                {row.note && <p className="text-muted italic">{row.note}</p>}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
