"use client";

import { useTenant } from "@/hooks/use-tenant";
import { useRouter, usePathname } from "next/navigation";
import { Clock, AlertTriangle, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import { isBillingExempt } from "@/lib/billing-exempt";

function computeDaysLeft(trialEndsAt: string | null): number | null {
    if (!trialEndsAt) return null;
    return Math.max(0, Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
}

export function TrialBanner() {
    const router = useRouter();
    const { t } = useLanguage();
    const pathname = usePathname();

    const { data: tenant } = useTenant();

    if (!tenant) return null;

    // The house tier is never billed, so no billing nag or lockout applies to it.
    // This is the overlay that locked the operator out of their own dashboard.
    if (isBillingExempt(tenant.plan)) return null;

    // Don't show on settings/billing page (they're already there)
    if (pathname?.includes("/settings")) return null;

    const daysLeft = computeDaysLeft(tenant.trial_ends_at);
    const isTrialExpired = tenant.status === "trial" && daysLeft !== null && daysLeft <= 0;
    const isSuspended = tenant.status === "suspended";
    const isCancelled = tenant.status === "cancelled";
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
                </div>
            </div>
        );
    }

    // Trial expired — banner with strong CTA
    if (isTrialExpired) {
        return (
            <div className="bg-red-600 text-white px-4 py-2.5 flex items-center justify-center gap-3 text-sm">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span className="font-medium">{t("billing.trialExpired")}</span>
                <button
                    onClick={() => router.push("/settings")}
                    className="px-3 py-1 rounded-lg bg-white text-red-700 text-xs font-semibold hover:bg-red-50 transition-colors"
                >
                    {t("billing.choosePlan")}
                </button>
            </div>
        );
    }

    // Trial warning — last 3 days
    if (isTrialWarning) {
        return (
            <div className={cn(
                "px-4 py-2 flex items-center justify-center gap-3 text-sm",
                daysLeft! <= 1
                    ? "bg-amber-500 text-white"
                    : "bg-amber-100 text-amber-800"
            )}>
                <Clock className="w-4 h-4 shrink-0" />
                <span>
                    {daysLeft === 1
                        ? t("billing.trialEndsTomorrow")
                        : t("billing.trialDaysLeft").replace("{n}", String(daysLeft))}
                </span>
                <button
                    onClick={() => router.push("/settings")}
                    className={cn(
                        "px-3 py-1 rounded-lg text-xs font-semibold transition-colors",
                        daysLeft! <= 1
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
