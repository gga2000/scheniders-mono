"use client";

import Link from "next/link";
import { Hourglass } from "lucide-react";
import { useTenant } from "@/hooks/use-tenant";
import { useLanguage } from "@/hooks/use-language";
import { isBillingExempt } from "@/lib/billing-exempt";
import { BILLING_SETTINGS_PATH } from "@/lib/billing/lock-routes";
import { daysUntil } from "@/components/settings/billing/billing-format";

/**
 * The trial countdown in the top bar (handoff A1): always in view while the
 * free trial runs, so its end is never a surprise. Opens the billing page.
 * Once the trial has ended the lock line takes over.
 */
export function TrialChip() {
    const { t } = useLanguage();
    const { data: tenant } = useTenant();
    if (!tenant || tenant.status !== "trial" || isBillingExempt(tenant.plan) || !tenant.trial_ends_at) return null;
    const daysLeft = trialDaysLeft(tenant.trial_ends_at);
    if (daysLeft === null) return null;
    return (
        <Link
            href={BILLING_SETTINGS_PATH}
            data-testid="trial-chip"
            className="ml-2 inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-100 transition-colors dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
        >
            <Hourglass className="h-3.5 w-3.5" />
            {t("billing.trialChip", { left: t("billing.trial.daysLeft", { count: daysLeft }) })}
        </Link>
    );
}

/** Whole days left in a running trial (today counts as one), or null once it has ended. */
function trialDaysLeft(trialEndsAt: string): number | null {
    return Date.parse(trialEndsAt) > Date.now() ? daysUntil(trialEndsAt) : null;
}
