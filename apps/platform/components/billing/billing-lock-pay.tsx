"use client";

import { useRouter } from "next/navigation";
import { Loader2, Wallet } from "lucide-react";
import { cn, formatIQD } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import { toast } from "@/hooks/use-toast";
import { usePayBillingLock, type BillingLock } from "@/hooks/use-billing-lock";
import { BILLING_PAY_PATH } from "@/lib/billing/lock-routes";

/**
 * The one action a locked shop needs: pay the month from the wallet when it
 * holds enough, otherwise top it up (a top-up that covers the month unlocks
 * the shop by itself). Staff who are not the shop's admin are told who can.
 */
export function BillingLockPay({ lock, compact = false }: { lock: BillingLock; compact?: boolean }) {
    const { t } = useLanguage();
    const router = useRouter();
    const pay = usePayBillingLock();

    if (!lock.can_pay) {
        return <p className={cn("text-xs", compact ? "opacity-90" : "text-muted-foreground")}>{t("billing.lock.askOwner")}</p>;
    }

    const canCover = lock.balance_iqd !== null && lock.balance_iqd >= lock.price_iqd;
    const base = compact
        ? "px-3 py-1 rounded-lg text-xs font-semibold"
        : "w-full py-3 rounded-xl text-sm font-semibold";

    if (!canCover) {
        return (
            <button
                type="button"
                onClick={() => router.push(BILLING_PAY_PATH)}
                className={cn(base, "inline-flex items-center justify-center gap-2 bg-foreground text-background hover:opacity-90 transition-opacity")}
            >
                <Wallet className="w-4 h-4" />
                {t("billing.lock.topUp")}
            </button>
        );
    }

    return (
        <button
            type="button"
            disabled={pay.isPending}
            onClick={() =>
                pay.mutate(undefined, {
                    onSuccess: (unlocked) =>
                        unlocked
                            ? toast({ title: t("billing.lock.paid"), variant: "success" })
                            : toast({ title: t("billing.lock.payFailed"), variant: "error" }),
                    onError: () => toast({ title: t("billing.lock.payError"), variant: "error" }),
                })
            }
            className={cn(base, "inline-flex items-center justify-center gap-2 bg-foreground text-background hover:opacity-90 transition-opacity disabled:opacity-60")}
        >
            {pay.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wallet className="w-4 h-4" />}
            {t("billing.lock.payFromWallet", { amount: formatIQD(lock.price_iqd) })}
        </button>
    );
}

/** The lock line: why, and how many store orders are left before it pauses. */
export function billingLockMessage(t: (key: string, vars?: Record<string, string | number>) => string, lock: BillingLock): { title: string; body: string } {
    const title = t(lock.reason === "unpaid" ? "billing.lock.titleUnpaid" : "billing.lock.titleTrial");
    const left = lock.orders_left ?? 0;
    const body = left > 0 ? t("billing.lock.ordersLeft", { count: left }) : t("billing.lock.paused");
    return { title, body };
}
