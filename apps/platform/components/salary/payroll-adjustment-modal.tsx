"use client";

import { useState } from "react";
import { TrendingDown, AlertCircle, Star } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@scheniders/ui/dialog";
import { useLanguage } from "@/hooks/use-language";
import { cn } from "@/lib/utils";

export type PayrollAdjustmentKind = "advance" | "penalty" | "bonus";

const KIND_STYLE: Record<PayrollAdjustmentKind, {
    Icon: React.ElementType;
    iconBox: string;
    iconColor: string;
    ring: string;
    submit: string;
    reasonRequired: boolean;
}> = {
    advance: {
        Icon: TrendingDown,
        iconBox: "bg-amber-100 dark:bg-amber-900/30",
        iconColor: "text-amber-600",
        ring: "focus:ring-amber-500/30",
        submit: "bg-amber-500 hover:bg-amber-600",
        reasonRequired: false,
    },
    penalty: {
        Icon: AlertCircle,
        iconBox: "bg-rose-100 dark:bg-rose-900/30",
        iconColor: "text-rose-600",
        ring: "focus:ring-rose-500/30",
        submit: "bg-rose-500 hover:bg-rose-600",
        reasonRequired: true,
    },
    bonus: {
        Icon: Star,
        iconBox: "bg-violet-100 dark:bg-violet-900/30",
        iconColor: "text-violet-600",
        ring: "focus:ring-violet-500/30",
        submit: "bg-violet-500 hover:bg-violet-600",
        reasonRequired: false,
    },
};

interface PayrollAdjustmentModalProps {
    kind: PayrollAdjustmentKind;
    isOpen: boolean;
    onClose: () => void;
    employeeName: string;
    onSubmit: (amount: number, reason: string) => Promise<void>;
}

const INPUT_BASE =
    "w-full px-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground placeholder:text-muted focus:outline-none focus:ring-2 transition-all";

/** One form for the three pay adjustments: salary advance, penalty, performance bonus. */
export function PayrollAdjustmentModal({ kind, isOpen, onClose, employeeName, onSubmit }: PayrollAdjustmentModalProps) {
    const { t } = useLanguage();
    const [amount, setAmount] = useState(0);
    const [reason, setReason] = useState("");
    const [loading, setLoading] = useState(false);
    const style = KIND_STYLE[kind];
    const canSubmit = amount > 0 && (!style.reasonRequired || reason.trim().length > 0);

    function reset() {
        setAmount(0);
        setReason("");
    }

    function handleClose() {
        reset();
        onClose();
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!canSubmit) return;
        setLoading(true);
        try {
            await onSubmit(amount, reason.trim());
            handleClose();
        } finally {
            setLoading(false);
        }
    }

    return (
        <Dialog open={isOpen} onOpenChange={open => { if (!open) handleClose(); }}>
            <DialogContent className="md:max-w-md" aria-describedby={undefined}>
                <DialogHeader>
                    <div className="flex items-center gap-3">
                        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", style.iconBox)}>
                            <style.Icon className={cn("w-5 h-5", style.iconColor)} />
                        </div>
                        <div className="text-left">
                            <DialogTitle>{t(`payroll.adjust.${kind}.title`)}</DialogTitle>
                            <DialogDescription>{employeeName}</DialogDescription>
                        </div>
                    </div>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label htmlFor={`adjust-${kind}-amount`} className="block text-sm font-medium text-foreground mb-2">
                            {t("payroll.adjust.amount")} *
                        </label>
                        <input
                            id={`adjust-${kind}-amount`}
                            type="number"
                            inputMode="numeric"
                            step={1}
                            min={1}
                            required
                            value={amount || ""}
                            onChange={e => setAmount(Math.max(0, Math.round(Number(e.target.value) || 0)))}
                            placeholder={t(`payroll.adjust.${kind}.amountExample`)}
                            className={cn(INPUT_BASE, style.ring)}
                        />
                    </div>
                    <div>
                        <label htmlFor={`adjust-${kind}-reason`} className="block text-sm font-medium text-foreground mb-2">
                            {t("payroll.adjust.reason")}{style.reasonRequired ? " *" : ""}
                        </label>
                        <input
                            id={`adjust-${kind}-reason`}
                            type="text"
                            value={reason}
                            required={style.reasonRequired}
                            onChange={e => setReason(e.target.value)}
                            placeholder={t(`payroll.adjust.${kind}.reasonExample`)}
                            className={cn(INPUT_BASE, style.ring)}
                        />
                    </div>

                    <DialogFooter className="gap-3 pt-2">
                        <button
                            type="button"
                            onClick={handleClose}
                            className="flex-1 px-4 py-3 bg-[var(--background)] text-foreground rounded-xl font-medium hover:bg-[var(--card-border)] transition-colors"
                        >
                            {t("common.cancel")}
                        </button>
                        <button
                            type="submit"
                            disabled={loading || !canSubmit}
                            className={cn(
                                "flex-1 px-4 py-3 text-white rounded-xl font-medium transition-all disabled:opacity-50 flex items-center justify-center gap-2",
                                style.submit,
                            )}
                        >
                            {loading
                                ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                : t(`payroll.adjust.${kind}.submit`)}
                        </button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
