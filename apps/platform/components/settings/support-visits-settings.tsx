"use client";

import { Headset, ShieldCheck } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useLanguage } from "@/hooks/use-language";
import { useStaffVisits } from "@/hooks/use-support";
import { isAdminRole } from "@/lib/permissions";
import { formatDate } from "@/lib/utils";
import type { StaffVisitAction } from "@/lib/support/schema";

/** One line per step; several staff tools do the same thing for the merchant. */
const ACTION_KEY: Record<StaffVisitAction, string> = {
    impersonate: "support.visits.action.storePage",
    support_view: "support.visits.action.viewed",
    extend_trial: "support.visits.action.extendTrial",
    convert_trial: "support.visits.action.subscribed",
    change_plan: "support.visits.action.changePlan",
    pause_tenant: "support.visits.action.paused",
    unpause_tenant: "support.visits.action.unpaused",
    suspend: "support.visits.action.suspended",
    bulk_suspend: "support.visits.action.suspended",
    reactivate: "support.visits.action.reactivated",
    top_up_wallet: "support.visits.action.topUp",
    top_up: "support.visits.action.topUp",
    bulk_top_up: "support.visits.action.topUp",
    pause_whatsapp: "support.visits.action.whatsappPaused",
    resume_whatsapp: "support.visits.action.whatsappResumed",
    support_reached_out: "support.visits.action.wroteFirst",
    support_shop_taken: "support.visits.action.owner",
};

/**
 * Every step our support team took on this shop, so the merchant knows who
 * touched their account and when. Shop admins only.
 */
export function SupportVisitsSettings() {
    const { t } = useLanguage();
    const { role } = useAuth();
    const isAdmin = isAdminRole(role);
    const visits = useStaffVisits(isAdmin);

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold tracking-tight text-foreground">{t("support.visits.title")}</h2>
                <p className="text-muted">{t("support.visits.subtitle")}</p>
            </div>

            <div className="pastel-card max-w-2xl p-6">
                {!isAdmin ? (
                    <p className="text-sm text-muted">{t("support.visits.adminsOnly")}</p>
                ) : visits.isLoading ? (
                    <div className="space-y-3">
                        {[0, 1, 2].map((i) => (
                            <div key={i} className="h-10 animate-pulse rounded-xl bg-[var(--card-bg-hover)]" />
                        ))}
                    </div>
                ) : visits.isError ? (
                    <p className="text-sm text-muted">{t("common.loadFailedHint")}</p>
                ) : (visits.data ?? []).length === 0 ? (
                    <div className="flex items-center gap-3 text-sm text-muted">
                        <ShieldCheck className="h-5 w-5 shrink-0 text-green-700" />
                        {t("support.visits.empty")}
                    </div>
                ) : (
                    <ul className="divide-y divide-[var(--card-border)]">
                        {(visits.data ?? []).map((visit) => (
                            <li key={`${visit.at}-${visit.action}`} className="flex items-center gap-3 py-3">
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--pastel-blue)]">
                                    <Headset className="h-4 w-4 text-blue-700" />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p dir="auto" className="text-sm font-medium text-foreground">
                                        {t(ACTION_KEY[visit.action])}
                                    </p>
                                    <p dir="auto" className="text-xs text-muted">
                                        {visit.staff ?? t("support.visits.team")}
                                    </p>
                                </div>
                                <span className="shrink-0 text-xs tabular-nums text-muted">{formatDate(visit.at)}</span>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}
