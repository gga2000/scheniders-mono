"use client";

import { useTenant } from "@/hooks/use-tenant";
import { Suspense } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Clock, Lock, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import { isBillingExempt } from "@/lib/billing-exempt";
import { useTrialOrderCap, useTrialOrderCount } from "@/hooks/use-billing";
import { ContactSupportButton } from "@/components/support/contact-support-button";
import { useBillingLock } from "@/hooks/use-billing-lock";
import { isOpenWhileLocked } from "@/lib/billing/lock-routes";
import { BillingLockPay, billingLockMessage } from "./billing-lock-pay";

/** Orders left in the trial at which the banner starts warning. */
const ORDERS_LEFT_WARNING = 10;

function computeDaysLeft(trialEndsAt: string | null): number | null {
    if (!trialEndsAt) return null;
    return Math.max(0, Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
}

export function TrialBanner() {
    const router = useRouter();
    const { t } = useLanguage();
    const pathname = usePathname();

    const { data: tenant } = useTenant();
    const inTrial = tenant?.status === "trial" && !isBillingExempt(tenant?.plan);
    const { data: lock } = useBillingLock(!!tenant && !isBillingExempt(tenant.plan));
    const { data: ordersUsed } = useTrialOrderCount(inTrial);
    const { data: orderCap } = useTrialOrderCap(tenant?.plan ?? null, inTrial);

    if (!tenant) return null;

    // The house tier is never billed, so no billing nag or lockout applies to it.
    // This is the overlay that locked the operator out of their own dashboard.
    if (isBillingExempt(tenant.plan)) return null;

    // Locked (handoff A1): the trial ended or the month is unpaid. On the
    // pages that stay open this line says so, the billing section included
    // (it is how many store orders are left); every other page shows the
    // lock screen (BillingLockGate) with the same words.
    if (lock?.locked) {
        const { title, body } = billingLockMessage(t, lock);
        const line = (
            <div className="bg-amber-500 text-white px-4 py-2 flex items-center justify-center gap-3 text-sm" data-testid="billing-lock-banner">
                <Lock className="w-4 h-4 shrink-0" />
                <span className="font-medium">{title}. {body}</span>
                <BillingLockPay lock={lock} compact />
            </div>
        );
        // Settings is open only on its billing section, where the shop pays.
        if (pathname === "/settings") {
            return (
                <Suspense fallback={null}>
                    <OnBillingSection>{line}</OnBillingSection>
                </Suspense>
            );
        }
        return isOpenWhileLocked(pathname, null) ? line : null;
    }

    // The other lines stay off settings: the billing section is where they point.
    if (pathname?.includes("/settings")) return null;

    const daysLeft = computeDaysLeft(tenant.trial_ends_at);
    const isTrialExpired = tenant.status === "trial" && daysLeft !== null && daysLeft <= 0;
    const isSuspended = tenant.status === "suspended";
    const isCancelled = tenant.status === "cancelled";
    const ordersLeft = orderCap && orderCap > 0 && ordersUsed != null ? Math.max(0, orderCap - ordersUsed) : null;
    // The trial ends after its days or its order cap, whichever comes first, so
    // the warning fires on whichever is about to run out.
    const isOrdersWarning = tenant.status === "trial" && ordersLeft !== null && ordersLeft <= ORDERS_LEFT_WARNING;
    const isTrialWarning = tenant.status === "trial" && daysLeft !== null && daysLeft <= 3 && daysLeft > 0;

    // Suspended / Cancelled — full block overlay
    if (isSuspended || isCancelled) {
        return (
            <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6">
                <div className="bg-white rounded-2xl p-8 max-w-md text-center shadow-2xl">
                    <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
                        <XCircle className="w-7 h-7 text-red-600" />
                    </div>
                    <h2 className="text-xl font-bold text-gray-900 mb-2">
                        {isSuspended ? t("billing.suspendedTitle") : t("billing.cancelledTitle")}
                    </h2>
                    <p className="text-gray-600 text-sm mb-6">
                        {isSuspended
                            ? t("billing.suspendedBody")
                            : t("billing.cancelledBody")}
                    </p>
                    <button
                        onClick={() => router.push("/settings")}
                        className="w-full py-3 rounded-xl bg-gray-900 text-white font-semibold hover:bg-gray-800 transition-colors"
                    >
                        {t("billing.goToBilling")}
                    </button>
                    <ContactSupportButton
                        className="mt-3 w-full justify-center border-gray-300 bg-white py-3 text-gray-900"
                        errorCode={isSuspended ? "billing.suspendedBody" : "billing.cancelledBody"}
                        errorMessage={isSuspended ? t("billing.suspendedBody") : t("billing.cancelledBody")}
                    />
                </div>
            </div>
        );
    }

    // The trial date has passed but the lock is not read yet: say nothing
    // rather than flash a message the lock line replaces a moment later.
    if (isTrialExpired) return null;

    // Trial warning — last 3 days, or last orders of the trial cap
    if (isTrialWarning || isOrdersWarning) {
        const urgent = (isTrialWarning && daysLeft !== null && daysLeft <= 1) || (ordersLeft !== null && ordersLeft <= 3);
        const message = isOrdersWarning && ordersLeft !== null
            ? t("billing.trialOrdersLeft").replace("{n}", String(ordersLeft)).replace("{cap}", String(orderCap))
            : daysLeft === 1
                ? t("billing.trialEndsTomorrow")
                : t("billing.trialDaysLeft").replace("{n}", String(daysLeft));
        return (
            <div className={cn(
                "px-4 py-2 flex items-center justify-center gap-3 text-sm",
                urgent
                    ? "bg-amber-500 text-white"
                    : "bg-amber-100 text-amber-800"
            )}>
                <Clock className="w-4 h-4 shrink-0" />
                <span>{message}</span>
                <button
                    onClick={() => router.push("/settings")}
                    className={cn(
                        "px-3 py-1 rounded-lg text-xs font-semibold transition-colors",
                        urgent
                            ? "bg-white text-amber-700 hover:bg-amber-50"
                            : "bg-amber-700 text-white hover:bg-amber-800"
                    )}
                >
                    {t("billing.viewPlans")}
                </button>
            </div>
        );
    }

    return null;
}

/** Its children on the billing section of settings only (read for a locked shop on /settings only). */
function OnBillingSection({ children }: { children: React.ReactNode }) {
    const section = useSearchParams().get("section");
    return isOpenWhileLocked("/settings", section) ? <>{children}</> : null;
}
