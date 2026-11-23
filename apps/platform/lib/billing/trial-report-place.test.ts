import { describe, expect, it } from "vitest";
import type { TrialReportFacts } from "@scheniders/shared/trial-report";
import { trialReportMayShow, trialReportShows } from "./trial-report-place";

/*
 * Fermi B12 item 2, Ali's pick A (22 Nov): Home shows the trial report from
 * the trial's fifth day until the shop pays; the lock screen shows it once the
 * trial ended unpaid. A paying shop and a month-unpaid lock never do.
 */

const facts = (extra: Partial<TrialReportFacts> = {}): TrialReportFacts => ({
    from_day: "2026-11-12",
    to_day: "2026-11-16",
    days: 5,
    elapsed_days: 4.5,
    trial_ends_at: "2026-11-19T09:00:00+00:00",
    ended: false,
    plan: "starter",
    orders: 3,
    delivered: 1,
    sales_iqd: 30_000,
    profit_iqd: 9_000,
    missing_cost_units: 0,
    with_courier_iqd: 0,
    with_courier_orders: 0,
    shield_flagged: 0,
    whatsapp_utility: 0,
    whatsapp_marketing: 0,
    prices: null,
    ...extra,
});

describe("where the trial report shows", () => {
    it("Home: a shop on trial, from its fifth day", () => {
        const home = (days: number, tenantStatus: string | null = "trial") =>
            trialReportShows("home", { tenantStatus, lockReason: null, facts: facts({ days }) });
        expect(home(4)).toBe(false);
        expect(home(5)).toBe(true);
        expect(home(7)).toBe(true);
        // Free days added by staff: still on trial, still shown.
        expect(home(12)).toBe(true);
    });

    it("Home: never once the shop pays, and not for a trial that already ended", () => {
        expect(trialReportShows("home", { tenantStatus: "active", lockReason: null, facts: facts({ days: 6 }) })).toBe(false);
        expect(trialReportShows("home", { tenantStatus: "trial", lockReason: null, facts: facts({ days: 7, ended: true }) })).toBe(false);
        // The house tier is passed as no status.
        expect(trialReportShows("home", { tenantStatus: null, lockReason: null, facts: facts({ days: 6 }) })).toBe(false);
    });

    it("lock screen: a trial that ended, whatever its day; never a month left unpaid", () => {
        expect(trialReportShows("lock", { tenantStatus: "trial", lockReason: "trial_ended", facts: facts({ days: 2, ended: true }) })).toBe(true);
        expect(trialReportShows("lock", { tenantStatus: "active", lockReason: "unpaid", facts: facts({ days: 40, ended: true }) })).toBe(false);
        expect(trialReportShows("lock", { tenantStatus: "trial", lockReason: null, facts: facts() })).toBe(false);
    });

    it("is not read at all where it cannot show", () => {
        expect(trialReportMayShow("home", { tenantStatus: "active", lockReason: null })).toBe(false);
        expect(trialReportMayShow("home", { tenantStatus: "trial", lockReason: null })).toBe(true);
        expect(trialReportMayShow("lock", { tenantStatus: "active", lockReason: "unpaid" })).toBe(false);
        expect(trialReportMayShow("lock", { tenantStatus: "trial", lockReason: "trial_ended" })).toBe(true);
    });
});
