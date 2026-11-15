"use client";

import { CreditCard, Loader2, Trash2 } from "lucide-react";
import { Switch } from "@scheniders/ui/switch";
import { cn, formatIQD } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import { toast } from "@/hooks/use-toast";
import { QI_REFILL_MAX_FAILURES, useQiSavedCard, useQiTopup } from "@/hooks/use-qi-topup";
import { REFILL_AMOUNTS } from "@/lib/qi/refill";

/** Last four digits of Qi's masked card number (e.g. 521372******8582). */
function lastFour(maskedPan: string | null): string | null {
    const digits = maskedPan?.match(/(\d{4})$/);
    return digits ? digits[1] : null;
}

/** Qi's card network names, as shops know them. */
const CARD_BRANDS: Record<string, string> = { VISA: "Visa", MASTER_CARD: "Mastercard" };

/**
 * The store's saved Qi card: auto refill on or off, how much it adds, and a
 * way to remove the card. Shows nothing until a card is saved (the shop saves
 * one by paying a top-up with "save this card" on).
 */
export function QiAutoRefill() {
    const { t } = useLanguage();
    const { enabled } = useQiTopup();
    const { card, update, remove } = useQiSavedCard();
    if (!enabled || !card) return null;

    const ending = lastFour(card.masked_pan);
    const brand = (card.payment_system && CARD_BRANDS[card.payment_system]) ?? t("billing.qi.card.card");
    const stopped = !card.auto_refill && card.failures >= QI_REFILL_MAX_FAILURES;
    const busy = update.isPending || remove.isPending;
    const failed = () => toast.error(t("billing.qi.card.failed"));

    return (
        <div className="space-y-3 rounded-xl border border-(--card-border) p-4" data-testid="qi-auto-refill">
            <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                    <CreditCard className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">{t("billing.qi.card.title")}</p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                        {ending ? t("billing.qi.card.ending", { brand, digits: ending }) : t("billing.qi.card.saved")}
                    </p>
                </div>
                <Switch
                    checked={card.auto_refill}
                    disabled={busy}
                    onCheckedChange={(on) => update.mutate({ autoRefill: on }, { onError: failed })}
                    aria-label={t("billing.qi.card.title")}
                    data-testid="qi-auto-refill-switch"
                />
            </div>

            {stopped && (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                    {t("billing.qi.card.stopped")}
                </p>
            )}

            {card.auto_refill && (
                <>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                        {t("billing.qi.card.body", { below: formatIQD(card.refill_below_iqd), amount: formatIQD(card.refill_amount_iqd) })}
                    </p>
                    <div className="flex flex-wrap gap-2">
                        {REFILL_AMOUNTS.map((a) => (
                            <button
                                key={a}
                                type="button"
                                disabled={busy}
                                onClick={() => update.mutate({ refillAmount: a }, { onError: failed })}
                                className={cn(
                                    "rounded-lg px-3 py-1.5 text-xs font-medium tabular-nums transition-colors disabled:opacity-50",
                                    card.refill_amount_iqd === a ? "bg-green-600 text-white" : "border border-(--card-border) hover:bg-muted/30",
                                )}
                            >
                                {formatIQD(a)}
                            </button>
                        ))}
                    </div>
                </>
            )}

            <button
                type="button"
                disabled={busy}
                onClick={() => remove.mutate(undefined, { onError: failed })}
                className="flex items-center gap-1.5 text-xs font-medium text-red-600 hover:underline disabled:opacity-50"
                data-testid="qi-remove-card"
            >
                {remove.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                {t("billing.qi.card.remove")}
            </button>
        </div>
    );
}
