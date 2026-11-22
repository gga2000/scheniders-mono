import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { TrialReportFacts } from "@scheniders/shared/trial-report";

/*
 * Fermi B12 item 2: the report reaches the people the database lets read it
 * (the shop's admins and staff who may see its finances), on Home from the
 * trial's fifth day and on the trial-ended lock screen, and stays closed for
 * the rest of the day once closed.
 */

const state = vi.hoisted(() => ({
    tenant: { status: "trial", plan: "starter" } as null | { status: string; plan: string },
    canReveal: true,
    facts: undefined as undefined | Record<string, unknown>,
    asked: [] as boolean[],
}));

vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ tenantId: "shop-1" }) }));
vi.mock("@/hooks/use-tenant", () => ({ useTenant: () => ({ data: state.tenant }) }));
vi.mock("@/hooks/use-trial-report", () => ({
    useTrialReport: (enabled: boolean) => {
        state.asked.push(enabled);
        return { data: enabled ? state.facts : undefined };
    },
}));
vi.mock("@/components/providers/financial-visibility-provider", () => ({
    useFinancialVisibility: () => ({ revealed: false, canReveal: state.canReveal, toggle: () => {} }),
}));
vi.mock("@/hooks/use-language", () => ({ useLanguage: () => ({ t: (k: string) => k, language: "ar" }), useTextDir: () => "rtl" }));

const { TrialReportSlot } = await import("./trial-report-slot");

const facts = (extra: Partial<TrialReportFacts> = {}): TrialReportFacts => ({
    from_day: "2026-11-12",
    to_day: "2026-11-16",
    days: 5,
    elapsed_days: 5,
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

beforeEach(() => {
    state.tenant = { status: "trial", plan: "starter" };
    state.canReveal = true;
    state.facts = facts();
    state.asked = [];
    window.localStorage.clear();
});
afterEach(cleanup);

describe("the trial report on Home", () => {
    it("shows a shop on trial from its fifth day, not before", () => {
        render(<TrialReportSlot place="home" />);
        expect(screen.getByTestId("trial-report-card")).toBeTruthy();
        expect(screen.getByRole("link", { name: "trialReport.choosePlan" })).toBeTruthy();
        cleanup();
        state.facts = facts({ days: 4 });
        render(<TrialReportSlot place="home" />);
        expect(screen.queryByTestId("trial-report-card")).toBeNull();
    });

    it("is not read for a paying shop, the house tier, or staff who may not see the shop's finances", () => {
        state.tenant = { status: "active", plan: "starter" };
        render(<TrialReportSlot place="home" />);
        state.tenant = { status: "trial", plan: "internal" };
        render(<TrialReportSlot place="home" />);
        state.tenant = { status: "trial", plan: "starter" };
        state.canReveal = false;
        render(<TrialReportSlot place="home" />);
        expect(state.asked.every((asked) => asked === false)).toBe(true);
        expect(screen.queryByTestId("trial-report-card")).toBeNull();
    });

    it("stays closed for the rest of the day once closed, even after the page reloads", () => {
        render(<TrialReportSlot place="home" />);
        act(() => {
            fireEvent.click(screen.getByRole("button", { name: "trialReport.hideToday" }));
        });
        expect(screen.queryByTestId("trial-report-card")).toBeNull();
        cleanup();
        render(<TrialReportSlot place="home" />);
        expect(screen.queryByTestId("trial-report-card")).toBeNull();
    });
});

describe("the trial report on the lock screen", () => {
    it("shows once the trial ended, without a second pay button", () => {
        state.facts = facts({ days: 7, ended: true });
        render(<TrialReportSlot place="lock" lockReason="trial_ended" />);
        expect(screen.getByTestId("trial-report-card")).toBeTruthy();
        expect(screen.queryByRole("link", { name: "trialReport.choosePlan" })).toBeNull();
    });

    it("is not read for a month left unpaid", () => {
        state.tenant = { status: "active", plan: "starter" };
        render(<TrialReportSlot place="lock" lockReason="unpaid" />);
        expect(state.asked).toEqual([false]);
        expect(screen.queryByTestId("trial-report-card")).toBeNull();
    });
});
