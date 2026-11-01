"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import type { EmployeePayrollData } from "@/types/salary";

export type PaymentMethod = "cash" | "zain_cash" | "qi_card";

export const PAYMENT_METHODS: { value: PaymentMethod; labelKey: string; icon: string }[] = [
    { value: "cash", labelKey: "payroll.method.cash", icon: "💵" },
    { value: "zain_cash", labelKey: "payroll.method.zainCash", icon: "📱" },
    { value: "qi_card", labelKey: "payroll.method.qiCard", icon: "💳" },
];

/** Mark paid: the ledger, how much to hand over now (all or part), method and note. */
export function ConfirmPayrollDialog({
    isOpen,
    data,
    onConfirm,
    onClose,
    onPreview,
}: {
    isOpen: boolean;
    data: EmployeePayrollData | null;
    /** amountPaid is null when the full net is paid. */
    onConfirm: (notes: string, paymentMethod: PaymentMethod, amountPaid: number | null) => void;
    onClose: () => void;
    onPreview?: () => void;
}) {
    const [notes, setNotes] = useState("");
    const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
    // Digits typed into "Pay now"; empty = the full net. The parent keys this dialog by member.
    const [amountText, setAmountText] = useState("");
    const { t } = useLanguage();

    if (!isOpen || !data) return null;

    function fmtIQD(n: number) {
        return new Intl.NumberFormat("en-IQ").format(Math.round(n));
    }

    const { calculation } = data;
    const name = data.employee.displayName || data.employee.email.split("@")[0];
    const carriedOver = Math.max(
        0,
        calculation.absenceDeduction + calculation.advancesTotal + calculation.penaltiesTotal - calculation.grossSalary - calculation.carriedIn,
    );
    const iqd = t("common.iqd");
    const net = Math.round(calculation.netSalary);
    const payNow = amountText === "" ? net : Number(amountText);
    const tooMuch = payNow > net;
    const stillOwed = tooMuch ? 0 : net - payNow;
    const amountPaid = stillOwed > 0 ? payNow : null;

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
                    className="relative z-10 w-full max-w-md bg-[var(--card-bg)] rounded-3xl shadow-2xl mx-4"
                >
                    <div className="p-6 border-b border-[var(--card-border)]">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                                <CheckCircle className="w-5 h-5 text-emerald-600" />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold text-foreground">{t("payroll.confirm.title")}</h2>
                                <p className="text-xs text-muted">{name}</p>
                            </div>
                        </div>
                    </div>

                    <div className="p-6 space-y-4">
                        {/* Breakdown summary */}
                        <div className="bg-[var(--background)] rounded-xl p-4 space-y-2">
                            {[
                                { label: t("payroll.line.base"), value: calculation.baseSalary, sign: "" },
                                { label: t("payroll.line.orderBonus", { count: calculation.completedOrdersCount }), value: calculation.orderBonus, sign: "+" },
                                { label: t("payroll.line.performanceBonuses"), value: calculation.performanceBonusesTotal, sign: "+" },
                                { label: t("payroll.card.carriedInLine"), value: calculation.carriedIn, sign: "+" },
                                { label: t("payroll.line.absence"), value: calculation.absenceDeduction, sign: "−" },
                                { label: t("payroll.line.advances"), value: calculation.advancesTotal, sign: "−" },
                                { label: t("payroll.line.penalties"), value: calculation.penaltiesTotal, sign: "−" },
                            ]
                                .filter(item => item.value > 0)
                                .map(item => (
                                    <div key={item.label} className="flex justify-between text-sm">
                                        <span className="text-muted">{item.label}</span>
                                        <span className="font-medium text-foreground tabular-nums">
                                            {item.sign}{fmtIQD(item.value)} {iqd}
                                        </span>
                                    </div>
                                ))}
                            <div className="border-t border-[var(--card-border)] pt-2 flex justify-between">
                                <span className="font-semibold text-foreground">{t("payroll.line.netPayable")}</span>
                                <span className="font-bold text-emerald-600 tabular-nums">
                                    {fmtIQD(calculation.netSalary)} {iqd}
                                </span>
                            </div>
                            {carriedOver > 0 && (
                                <p className="text-xs text-amber-700 dark:text-amber-400 pt-1 border-t border-[var(--card-border)]">
                                    {t("payroll.confirm.carryOver", { amount: fmtIQD(carriedOver), currency: iqd })}
                                </p>
                            )}
                            {calculation.orderBreakdown.replacements + calculation.orderBreakdown.refunds > 0 && (
                                <p className="text-xs text-muted pt-1 border-t border-[var(--card-border)]">
                                    {t("payroll.confirm.excluded", {
                                        total: calculation.orderBreakdown.completedTotal,
                                        replacements: calculation.orderBreakdown.replacements,
                                        refunds: calculation.orderBreakdown.refunds,
                                    })}
                                </p>
                            )}
                        </div>

                        {/* Pay now: the full net by default, or part of it; the rest joins the next payroll. */}
                        {net > 0 && (
                            <div>
                                <label htmlFor="payroll-pay-now" className="block text-sm font-medium text-foreground mb-2">{t("payroll.confirm.payNow")}</label>
                                <div className="flex items-center gap-2">
                                    <div className="relative flex-1">
                                        <input
                                            id="payroll-pay-now"
                                            type="text"
                                            inputMode="numeric"
                                            value={fmtIQD(payNow)}
                                            onChange={e => setAmountText(e.target.value.replace(/[^0-9]/g, "").replace(/^0+(?=\d)/, "") || "0")}
                                            aria-invalid={tooMuch}
                                            aria-describedby="payroll-pay-now-hint"
                                            className={cn(
                                                "w-full ps-4 pe-14 py-3 bg-[var(--background)] border rounded-xl text-foreground font-semibold tabular-nums focus:outline-none focus:ring-2 focus:ring-[var(--ink)]/20",
                                                tooMuch ? "border-rose-400" : "border-[var(--card-border)]",
                                            )}
                                        />
                                        <span className="pointer-events-none absolute end-4 top-1/2 -translate-y-1/2 text-xs text-muted">{iqd}</span>
                                    </div>
                                    {amountPaid !== null && (
                                        <button
                                            type="button"
                                            onClick={() => setAmountText("")}
                                            className="px-3 py-3 rounded-xl border border-[var(--card-border)] text-xs font-medium text-muted hover:text-foreground"
                                        >
                                            {t("payroll.confirm.payAll")}
                                        </button>
                                    )}
                                </div>
                                <p id="payroll-pay-now-hint" className={cn("text-xs mt-1.5", tooMuch ? "text-rose-600" : stillOwed > 0 ? "text-amber-700 dark:text-amber-400" : "text-muted")}>
                                    <bdi>
                                        {tooMuch
                                            ? t("payroll.confirm.tooMuch", { amount: fmtIQD(net), currency: iqd })
                                            : stillOwed > 0
                                                ? t("payroll.confirm.stillOwed", { amount: fmtIQD(stillOwed), currency: iqd })
                                                : t("payroll.confirm.payNowHint")}
                                    </bdi>
                                </p>
                            </div>
                        )}

                        {/* Payment method */}
                        <div>
                            <label className="block text-sm font-medium text-foreground mb-2">{t("payroll.confirm.paymentMethod")}</label>
                            <div className="flex gap-2">
                                {PAYMENT_METHODS.map(m => (
                                    <button
                                        key={m.value}
                                        onClick={() => setPaymentMethod(m.value)}
                                        className={cn(
                                            "flex-1 flex flex-col items-center gap-1 py-2.5 rounded-xl border text-xs font-medium transition-all",
                                            paymentMethod === m.value
                                                ? "bg-[var(--ink)] text-white border-[var(--ink)]"
                                                : "bg-[var(--background)] text-muted border-[var(--card-border)] hover:text-foreground"
                                        )}
                                    >
                                        <span className="text-base">{m.icon}</span>
                                        {t(m.labelKey)}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-foreground mb-2">{t("payroll.confirm.notes")}</label>
                            <input
                                type="text"
                                value={notes}
                                onChange={e => setNotes(e.target.value)}
                                placeholder={t("payroll.confirm.notesPlaceholder")}
                                className="w-full px-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground placeholder:text-[var(--foreground-muted)] focus:outline-none focus:ring-2 focus:ring-emerald-500/30 transition-all"
                            />
                        </div>

                        <p className="text-xs text-muted bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-xl p-3">
                            {t("payroll.confirm.warning")}
                        </p>

                        <div className="flex gap-3">
                            <button
                                onClick={onClose}
                                className="flex-1 px-4 py-3 bg-[var(--background)] text-foreground rounded-xl font-medium hover:bg-[var(--card-border)] transition-colors"
                            >
                                {t("common.cancel")}
                            </button>
                            {onPreview && (
                                <button
                                    onClick={onPreview}
                                    className="flex-1 px-4 py-3 bg-[var(--background)] border border-[var(--card-border)] text-foreground rounded-xl font-medium hover:border-[var(--ink)] transition-all flex items-center justify-center gap-2"
                                >
                                    <Eye className="w-4 h-4" />
                                    {t("payroll.confirm.preview")}
                                </button>
                            )}
                            <button
                                onClick={() => onConfirm(notes, paymentMethod, amountPaid)}
                                disabled={tooMuch}
                                className="flex-1 px-4 py-3 bg-emerald-500 text-white rounded-xl font-medium hover:bg-emerald-600 transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                <CheckCircle className="w-4 h-4" />
                                {amountPaid === null ? t("payroll.confirm.submit") : t("payroll.confirm.submitPart")}
                            </button>
                        </div>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
