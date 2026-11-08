"use client";

import { useState } from "react";
import { HandCoins, ShieldCheck } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@scheniders/ui/dialog";
import { useLanguage } from "@/hooks/use-language";
import { toast } from "@/hooks/use-toast";
import { useTillPayout } from "@/hooks/use-till";
import type { TillMember } from "@/hooks/use-shops";
import { formatIqd, parseDinars } from "@/lib/till/cart";
import { cn } from "@/lib/utils";
import { INK_BUTTON } from "./till-colors";
import { TillManagerDialog } from "./till-manager-dialog";

interface Props {
    sessionId: string;
    /** Managers pay out any amount; anyone else needs a manager's PIN above pinAbove. */
    isManager: boolean;
    /** The store's rule: a pay-out above this needs a manager's PIN (0 = every pay-out). */
    pinAbove: number;
    /** Managers with a PIN who can allow it on this till. */
    managers: TillMember[];
    onClose: () => void;
}

const AMOUNTS = [1_000, 2_000, 5_000, 10_000, 25_000] as const;
const REASONS = ["water", "delivery", "cleaning", "food", "supplies"] as const;

/** Cash taken out of the drawer for a shop cost. It is saved as an expense in Finances. */
export function TillPayoutDialog({ sessionId, isManager, pinAbove, managers, onClose }: Props) {
    const { t } = useLanguage();
    const payout = useTillPayout();
    // One id per open dialog, so a double tap or a retry saves one expense.
    const [clientId] = useState(() => crypto.randomUUID());
    const [amountText, setAmountText] = useState("");
    // A reason chip and the typed details are kept apart, so tapping a chip never fills the text box.
    const [reason, setReason] = useState<string | null>(null);
    const [detail, setDetail] = useState("");
    const note = [reason, detail.trim()].filter(Boolean).join(" · ");
    const amount = parseDinars(amountText);
    const ready = amount > 0 && note.trim().length > 0 && !payout.isPending;
    // The server has the last word (the rule may have changed); this only saves a round trip.
    const [limit, setLimit] = useState(pinAbove);
    const needsPin = !isManager && amount > limit;
    const [askManager, setAskManager] = useState(false);

    const save = (approvalId: string | null) =>
        payout.mutate(
            { sessionId, clientId, amount, note, approvalId },
            {
                onSuccess: (r) => {
                    if ("error" in r) {
                        setLimit(r.limit);
                        setAskManager(true);
                        return;
                    }
                    toast({ title: t("till.payout.saved", { amount: formatIqd(amount) }), variant: "success" });
                    onClose();
                },
                onError: () => toast({ title: t("till.payout.failed"), variant: "error" }),
            },
        );
    const submit = () => (needsPin ? setAskManager(true) : save(null));

    return (
        <>
        {/* The PIN pad replaces this dialog while it is open, so no second outline peeks out behind it. */}
        <Dialog open={!askManager} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="till-screen md:max-w-lg">
                <div className="flex flex-col gap-6">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-left">
                        <HandCoins className="h-5 w-5" aria-hidden="true" />
                        {t("till.payout.title")}
                    </DialogTitle>
                    <DialogDescription className="text-left" dir="auto">
                        {t("till.payout.subtitle")}
                    </DialogDescription>
                </DialogHeader>

                <div className="flex flex-col gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t("till.payout.amount")}</p>
                    <input
                        value={amountText}
                        onChange={(e) => setAmountText(e.target.value)}
                        inputMode="numeric"
                        placeholder="0"
                        aria-label={t("till.payout.amount")}
                        className="h-14 rounded-2xl border border-stone-400 dark:border-white/25 bg-transparent px-4 text-right text-2xl font-bold tabular-nums text-foreground outline-none focus:border-[var(--ink)]"
                    />
                    <div className="flex flex-wrap gap-2">
                        {AMOUNTS.map((a) => (
                            <button
                                key={a}
                                type="button"
                                onClick={() => setAmountText(formatIqd(a))}
                                className={cn(
                                    "h-11 rounded-xl border px-3 text-sm font-semibold tabular-nums",
                                    amount === a ? `border-transparent ${INK_BUTTON}` : "border-[var(--card-border)] text-foreground",
                                )}
                            >
                                {formatIqd(a)}
                            </button>
                        ))}
                    </div>
                    {needsPin && (
                        <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-800 dark:text-amber-300" dir="auto">
                            <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
                            {t("till.payout.needsPin", { limit: formatIqd(limit) })}
                        </p>
                    )}
                </div>

                <div className="flex flex-col gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t("till.payout.for")}</p>
                    <div className="flex flex-wrap gap-2">
                        {REASONS.map((r) => {
                            const label = t(`till.payout.reason.${r}`);
                            return (
                                <button
                                    key={r}
                                    type="button"
                                    onClick={() => setReason(reason === label ? null : label)}
                                    aria-pressed={reason === label}
                                    className={cn(
                                        "h-11 rounded-full border px-4 text-sm font-semibold",
                                        reason === label ? `border-transparent ${INK_BUTTON}` : "border-[var(--card-border)] text-foreground",
                                    )}
                                >
                                    {label}
                                </button>
                            );
                        })}
                    </div>
                    <input
                        value={detail}
                        onChange={(e) => setDetail(e.target.value.slice(0, 200))}
                        placeholder={reason ? t("till.payout.detailPlaceholder") : t("till.payout.notePlaceholder")}
                        aria-label={t("till.payout.for")}
                        className="h-12 rounded-2xl border border-stone-400 dark:border-white/25 bg-transparent px-4 text-sm text-foreground outline-none focus:border-[var(--ink)]"
                        dir="auto"
                    />
                </div>

                <button
                    type="button"
                    onClick={submit}
                    disabled={!ready}
                    className={cn("h-14 w-full rounded-2xl text-base font-bold", INK_BUTTON, "disabled:bg-[var(--card-border)] disabled:text-foreground/70 dark:disabled:bg-white/10 dark:disabled:text-white/70")}
                >
                    {payout.isPending
                        ? t("till.payout.saving")
                        : amount > 0
                          ? t(needsPin ? "till.payout.takeWithPin" : "till.payout.take", { amount: formatIqd(amount) })
                          : t("till.payout.title")}
                </button>
                </div>
            </DialogContent>
        </Dialog>
            {askManager && (
                <TillManagerDialog
                    sessionId={sessionId}
                    managers={managers}
                    reason={t("till.payout.askReason", { amount: formatIqd(amount) })}
                    maxOff={amount}
                    onApproved={(ok) => {
                        setAskManager(false);
                        save(ok.id);
                    }}
                    onClose={() => setAskManager(false)}
                />
            )}
        </>
    );
}
