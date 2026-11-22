"use client";

import { useState, useSyncExternalStore } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useTenant } from "@/hooks/use-tenant";
import { useTrialReport } from "@/hooks/use-trial-report";
import type { BillingLock } from "@/hooks/use-billing-lock";
import { useFinancialVisibility } from "@/components/providers/financial-visibility-provider";
import { isBillingExempt } from "@/lib/billing-exempt";
import { trialReportMayShow, trialReportShows, type TrialReportPlace } from "@/lib/billing/trial-report-place";
import {
    hideTrialReportToday,
    isTrialReportHiddenToday,
    readTrialReportHiddenDay,
    subscribeTrialReportHidden,
} from "@/lib/billing/trial-report-hidden";
import { TrialReportCard } from "./trial-report-card";

/**
 * The trial report where it belongs (lib/billing/trial-report-place.ts), for
 * the people the database lets read it: the shop's admins and staff who may
 * see its finances. Hidden for the rest of the day once the merchant closes it.
 */
export function TrialReportSlot({
    place,
    lockReason = null,
    className,
}: {
    place: TrialReportPlace;
    /** The lock screen's reason; Home has none. */
    lockReason?: BillingLock["reason"];
    className?: string;
}) {
    const { tenantId } = useAuth();
    const { data: tenant } = useTenant();
    const { canReveal } = useFinancialVisibility();
    const tenantStatus = tenant && !isBillingExempt(tenant.plan) ? tenant.status : null;
    const { data: facts } = useTrialReport(canReveal && trialReportMayShow(place, { tenantStatus, lockReason }));
    const hiddenDay = useSyncExternalStore(
        subscribeTrialReportHidden,
        () => (tenantId ? readTrialReportHiddenDay(tenantId) : null),
        () => null,
    );
    const [closed, setClosed] = useState(false);

    if (!tenantId || !facts || closed || isTrialReportHiddenToday(hiddenDay)) return null;
    if (!trialReportShows(place, { tenantStatus, lockReason, facts })) return null;

    return (
        <TrialReportCard
            facts={facts}
            choosePlan={place === "home"}
            className={className}
            onHide={() => {
                setClosed(true);
                hideTrialReportToday(tenantId);
            }}
        />
    );
}
