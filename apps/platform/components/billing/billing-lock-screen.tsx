"use client";

import Link from "next/link";
import { ArrowLeftRight, Lock, PackageCheck } from "lucide-react";
import { planName } from "@scheniders/shared/plans";
import { formatIQD } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import type { BillingLock } from "@/hooks/use-billing-lock";
import { ContactSupportButton } from "@/components/support/contact-support-button";
import { BILLING_SETTINGS_PATH } from "@/lib/billing/lock-routes";
import { BillingLockPay, billingLockMessage, billingLockTitleKey } from "./billing-lock-pay";
import { TrialReportSlot } from "./trial-report-slot";

/**
 * What a billing-locked shop sees on a page it cannot use (handoff A1). The
 * sidebar stays, so orders, shipping and paying are one click away, and the
 * support chat opens with the lock attached; nothing the shop owns is hidden
 * or deleted. A trial that ended shows its trial report under it (Fermi B12
 * item 2), so the shop sees what its trial did before it pays.
 */
export function BillingLockScreen({ lock }: { lock: BillingLock }) {
    const { t, language } = useLanguage();
    const { title, body } = billingLockMessage(t, lock);
    const amount = formatIQD(lock.price_iqd);

    return (
        <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4 p-6" data-testid="billing-lock-screen">
            <div className="pastel-card w-full max-w-md p-8 text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/40">
                    <Lock className="h-7 w-7 text-amber-700 dark:text-amber-300" />
                </div>
                <h2 className="mb-2 text-xl font-bold text-foreground">{title}</h2>
                <p className="mb-2 text-sm text-muted-foreground">{body}</p>
                {lock.previous_store && (
                    <p className="mb-2 text-sm text-muted-foreground" data-testid="billing-lock-previous-store">
                        {t("billing.lock.previousStoreHelp")}
                    </p>
                )}
                <p className="mb-1 text-sm font-medium tabular-nums text-foreground" data-testid="billing-lock-price">
                    {lock.plan
                        ? t("billing.lock.planPrice", { plan: planName(lock.plan, language), amount })
                        : t("billing.lock.price", { amount })}
                </p>
                {lock.can_pay ? (
                    <Link
                        href={BILLING_SETTINGS_PATH}
                        className="mb-6 inline-flex items-center gap-1.5 text-xs font-semibold text-purple-700 hover:underline dark:text-purple-300"
                    >
                        <ArrowLeftRight className="h-3.5 w-3.5" />
                        {t("billing.lock.changePlan")}
                    </Link>
                ) : (
                    <div className="mb-6" />
                )}
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
                    errorCode={billingLockTitleKey(lock)}
                    errorMessage={`${title} ${body}`}
                />
                <p className="mt-4 text-xs text-muted-foreground">{t("billing.lock.stillOpen")}</p>
            </div>
            <TrialReportSlot place="lock" lockReason={lock.reason} className="w-full max-w-md" />
        </div>
    );
}
