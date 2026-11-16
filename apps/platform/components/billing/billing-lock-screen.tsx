"use client";

import Link from "next/link";
import { Lock, PackageCheck } from "lucide-react";
import { formatIQD } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import type { BillingLock } from "@/hooks/use-billing-lock";
import { ContactSupportButton } from "@/components/support/contact-support-button";
import { BillingLockPay, billingLockMessage } from "./billing-lock-pay";

/**
 * What a billing-locked shop sees on a page it cannot use (handoff A1). The
 * sidebar stays, so orders, shipping and paying are one click away, and the
 * support chat opens with the lock attached; nothing the shop owns is hidden
 * or deleted.
 */
export function BillingLockScreen({ lock }: { lock: BillingLock }) {
    const { t } = useLanguage();
    const { title, body } = billingLockMessage(t, lock);

    return (
        <div className="flex min-h-[70vh] items-center justify-center p-6" data-testid="billing-lock-screen">
            <div className="pastel-card w-full max-w-md p-8 text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/40">
                    <Lock className="h-7 w-7 text-amber-700 dark:text-amber-300" />
                </div>
                <h2 className="mb-2 text-xl font-bold text-foreground">{title}</h2>
                <p className="mb-2 text-sm text-muted-foreground">{body}</p>
                <p className="mb-6 text-sm font-medium tabular-nums text-foreground">
                    {t("billing.lock.price", { amount: formatIQD(lock.price_iqd) })}
                </p>
                <BillingLockPay lock={lock} />
                <Link
                    href="/orders"
                    className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-(--card-border) py-3 text-sm font-semibold text-foreground hover:bg-muted/40 transition-colors"
                >
                    <PackageCheck className="h-4 w-4" />
                    {t("billing.lock.goToOrders")}
                </Link>
                <ContactSupportButton
                    className="mt-3 w-full justify-center rounded-xl py-3"
                    errorCode={lock.reason === "unpaid" ? "billing.lock.titleUnpaid" : "billing.lock.titleTrial"}
                    errorMessage={`${title} ${body}`}
                />
                <p className="mt-4 text-xs text-muted-foreground">{t("billing.lock.stillOpen")}</p>
            </div>
        </div>
    );
}
