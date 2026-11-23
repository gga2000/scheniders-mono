import type { TrialReportFacts } from "@scheniders/shared/trial-report";
import type { BillingLock } from "@/hooks/use-billing-lock";

/**
 * Where the merchant sees the trial report (Fermi B12 item 2, Ali's pick A,
 * 22 Nov): a card on Home from the trial's fifth day until the shop pays, and
 * the same card on the lock screen once the trial ended unpaid. A paying
 * shop, and a shop locked for an unpaid month, never see it.
 */
export type TrialReportPlace = "home" | "lock";

/** The trial day from which Home shows the report. */
export const TRIAL_REPORT_FROM_DAY = 5;

/** Whether the report is worth reading for: the shop is on trial (Home) or locked because its trial ended (lock screen). */
export function trialReportMayShow(place: TrialReportPlace, state: { tenantStatus: string | null; lockReason: BillingLock["reason"] }): boolean {
    return place === "home" ? state.tenantStatus === "trial" : state.lockReason === "trial_ended";
}

/** Whether the report shows, once its facts are read. */
export function trialReportShows(
    place: TrialReportPlace,
    state: { tenantStatus: string | null; lockReason: BillingLock["reason"]; facts: TrialReportFacts },
): boolean {
    if (!trialReportMayShow(place, state)) return false;
    // The lock screen shows it whatever the day: the trial is over.
    if (place === "lock") return true;
    return state.facts.days >= TRIAL_REPORT_FROM_DAY && !state.facts.ended;
}
