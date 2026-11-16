"use client";

import { useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@scheniders/ui/dialog";
import { planName } from "@scheniders/shared/plans";
import { formatIQD } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import { toast } from "@/hooks/use-toast";
import { useApplyPlanChange, usePlanQuote, type BillingRefusal, type PlanQuote } from "@/hooks/use-plan-change";
import { formatBillingDate } from "./billing-format";
import { refusalMessage } from "./plan-refusal";
import type { PlanMode } from "./plan-picker";

/**
 * Confirms a plan switch with the database's own quote (change_plan with
 * p_apply false): what is taken from the wallet now, from when, and what the
 * month costs after. Confirming runs the same function with p_apply true.
 */
export function PlanChangeDialog({ plan, mode, onClose }: { plan: string | null; mode: PlanMode; onClose: () => void }) {
    const { t, language } = useLanguage();
    const quote = usePlanQuote(plan);
    const apply = useApplyPlanChange();
    const [refusal, setRefusal] = useState<BillingRefusal | null>(null);
    const name = planName(plan, language);

    const close = () => {
        setRefusal(null);
        onClose();
    };

    const result = quote.data;
    const shownRefusal = refusal ?? (result && !result.success ? result : null);
    const ready = result?.success ? result : null;
    const canConfirm = !!ready && ready.balance_ok && !refusal && !apply.isPending;

    const confirm = () => {
        if (!plan || !ready) return;
        apply.mutate(plan, {
            onSuccess: (res) => {
                if (!res.success) {
                    setRefusal(res);
                    return;
                }
                toast({ title: doneMessage(res, mode, t, language), variant: "success" });
                close();
            },
            onError: () => toast({ title: t("plans.dialog.error"), variant: "error" }),
        });
    };

    return (
        <Dialog open={plan !== null} onOpenChange={(open) => !open && close()}>
            <DialogContent className="max-w-md" data-testid="plan-change-dialog">
                <DialogHeader>
                    <DialogTitle>{t("plans.dialog.title", { plan: name })}</DialogTitle>
                    <DialogDescription className="sr-only">{t("plans.dialog.title", { plan: name })}</DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    {quote.isLoading ? (
                        <p className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            {t("plans.dialog.loading")}
                        </p>
                    ) : quote.isError ? (
                        <Warning>{t("plans.dialog.error")}</Warning>
                    ) : shownRefusal ? (
                        <Warning>{refusalMessage(shownRefusal, t, language)}</Warning>
                    ) : ready ? (
                        <QuoteBody quote={ready} mode={mode} />
                    ) : null}
                </div>

                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={confirm}
                        disabled={!canConfirm}
                        className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-foreground py-2.5 text-sm font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-50"
                        data-testid="plan-change-confirm"
                    >
                        {apply.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                        {t("plans.dialog.confirm")}
                    </button>
                    <button
                        type="button"
                        onClick={close}
                        className="flex-1 rounded-xl border border-(--card-border) py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted/40"
                    >
                        {t("plans.dialog.cancel")}
                    </button>
                </div>
            </DialogContent>
        </Dialog>
    );
}

function QuoteBody({ quote, mode }: { quote: PlanQuote; mode: PlanMode }) {
    const { t, language } = useLanguage();
    const plan = planName(quote.plan, language);
    const monthly = formatIQD(quote.monthly_iqd);
    const date = (iso: string | null) => (iso ? formatBillingDate(iso, language) : "");

    const lines: string[] = [];
    switch (quote.kind) {
        case "pick":
            lines.push(t(mode === "locked" ? "plans.dialog.pickLocked" : "plans.dialog.pick", { plan, amount: monthly }));
            break;
        case "keep":
            lines.push(t("plans.dialog.keep", { plan }));
            break;
        case "upgrade":
            lines.push(t("plans.dialog.upgrade", { plan, amount: formatIQD(quote.charge_now_iqd) }));
            if (quote.period_end) lines.push(t("plans.dialog.upgradeNext", { date: date(quote.period_end), amount: monthly }));
            break;
        case "downgrade":
            lines.push(t("plans.dialog.downgrade", { plan, date: date(quote.effective_at) }));
            lines.push(t("plans.dialog.downgradeNext", { amount: monthly }));
            break;
    }

    return (
        <>
            <div className="space-y-1.5">
                {lines.map((line) => (
                    <p key={line} className="text-sm font-medium text-foreground">{line}</p>
                ))}
            </div>
            <ul className="space-y-1 rounded-xl border border-(--card-border) bg-muted/20 p-3 text-xs text-muted-foreground">
                <li>{t("plans.dialog.fee", { amount: formatIQD(quote.order_fee_iqd) })}</li>
                {quote.seat_limit !== null && <li>{t("plans.dialog.seats", { used: quote.seats_used, limit: quote.seat_limit })}</li>}
                {quote.charge_now_iqd > 0 && <li>{t("plans.dialog.balance", { amount: formatIQD(quote.balance_iqd) })}</li>}
            </ul>
            {!quote.balance_ok && (
                <Warning>{t("plans.dialog.short", { amount: formatIQD(quote.charge_now_iqd - quote.balance_iqd) })}</Warning>
            )}
        </>
    );
}

export function Warning({ children }: { children: React.ReactNode }) {
    return (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30" role="alert">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <p className="text-sm text-amber-800 dark:text-amber-300">{children}</p>
        </div>
    );
}

function doneMessage(
    res: PlanQuote,
    mode: PlanMode,
    t: ReturnType<typeof useLanguage>["t"],
    language: ReturnType<typeof useLanguage>["language"],
): string {
    const plan = planName(res.plan, language);
    switch (res.kind) {
        case "pick":
            return t(mode === "locked" ? "plans.done.pickLocked" : "plans.done.pick", { plan });
        case "keep":
            return t("plans.done.keep", { plan });
        case "upgrade":
            return t("plans.done.upgrade", { plan });
        case "downgrade":
            return t("plans.done.downgrade", { plan, date: res.effective_at ? formatBillingDate(res.effective_at, language) : "" });
    }
}
