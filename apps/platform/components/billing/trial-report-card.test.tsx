import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { TrialReportFacts } from "@scheniders/shared/trial-report";

/*
 * Fermi B12 item 2, concept A: the merchant's trial report reads like the
 * team's WhatsApp copy, hides the lines that are 0, hides money until the
 * merchant shows it, and never says money was "saved".
 */

const state = vi.hoisted(() => ({ language: "ar" as "ar" | "en", revealed: false }));

vi.mock("@/hooks/use-language", () => ({
    useLanguage: () => ({ t: (k: string) => k, language: state.language }),
    useTextDir: () => (state.language === "ar" ? "rtl" : "ltr"),
}));
vi.mock("@/components/providers/financial-visibility-provider", () => ({
    useFinancialVisibility: () => ({ revealed: state.revealed, canReveal: true, toggle: () => {} }),
}));

const { TrialReportCard } = await import("./trial-report-card");

const facts = (extra: Partial<TrialReportFacts> = {}): TrialReportFacts => ({
    from_day: "2026-11-12",
    to_day: "2026-11-16",
    days: 5,
    elapsed_days: 5,
    trial_ends_at: "2026-11-19T09:00:00+00:00",
    ended: false,
    plan: "starter",
    orders: 23,
    delivered: 14,
    sales_iqd: 420_000,
    profit_iqd: 96_000,
    missing_cost_units: 0,
    with_courier_iqd: 210_000,
    with_courier_orders: 7,
    shield_flagged: 3,
    whatsapp_utility: 40,
    whatsapp_marketing: 5,
    prices: { plan_month_iqd: 9_000, per_delivered_iqd: 55, whatsapp_utility_iqd: 30, whatsapp_marketing_iqd: 80 },
    ...extra,
});

const show = (f = facts(), choosePlan = true, onHide = vi.fn()) =>
    render(<TrialReportCard facts={f} choosePlan={choosePlan} onHide={onHide} />);

beforeEach(() => {
    state.language = "ar";
    state.revealed = false;
});
afterEach(cleanup);

describe("the trial report card", () => {
    it("says the days, the lead and each line in the WhatsApp copy's words", () => {
        show();
        const card = screen.getByTestId("trial-report-card");
        expect(card.textContent).toContain("trialReport.title");
        expect(card.textContent).toContain("من 12 تشرين الثاني لليوم (5 أيام)");
        expect(card.textContent).toContain("بهالأسبوع:");
        expect(screen.getByTestId("trial-report-orders").textContent).toBe("طلباتك23");
        expect(screen.getByTestId("trial-report-delivered").textContent).toBe("الواصل14");
        expect(screen.getByTestId("trial-report-shield").textContent).toBe("Shield نبّه على3");
        expect(card.textContent).not.toMatch(/وفّر|وفر/);
    });

    it("hides money until the merchant shows it, like every money figure on Home", () => {
        show();
        expect(screen.getByTestId("trial-report-with_courier").textContent).toContain("••••••");
        expect(screen.getByTestId("trial-report-profit").textContent).toContain("••••••");
        cleanup();
        state.revealed = true;
        show();
        expect(screen.getByTestId("trial-report-with_courier").textContent).toContain("210,000");
        expect(screen.getByTestId("trial-report-profit").textContent).toContain("96,000");
    });

    it("shows the expected monthly cost openly: it is a price, not the shop's money", () => {
        show();
        const cost = screen.getByTestId("trial-report-cost");
        expect(cost.textContent).toContain("كلفتك الشهرية المتوقعة بهالحجم: تقريباً 23,220 د.ع");
        expect(cost.textContent).toContain("الباقة 9,000 + 55 × 84 طلب واصل + رسائل 9,600");
        expect(cost.querySelector("strong")?.textContent).toBe("تقريباً 23,220 د.ع");
    });

    it("leaves out the lines that are 0, and says so when there is no order yet", () => {
        show(facts({ delivered: 0, shield_flagged: 0, with_courier_iqd: 0 }));
        expect(screen.queryByTestId("trial-report-delivered")).toBeNull();
        expect(screen.queryByTestId("trial-report-shield")).toBeNull();
        expect(screen.queryByTestId("trial-report-with_courier")).toBeNull();
        cleanup();
        show(facts({ orders: 0, delivered: 0, shield_flagged: 0, with_courier_iqd: 0, profit_iqd: 0, whatsapp_utility: 0, whatsapp_marketing: 0 }));
        expect(screen.getByTestId("trial-report-card").textContent).toContain("ما صار عندك طلبات لهسه.");
        expect(screen.getByTestId("trial-report-cost").textContent).toContain("الباقة 9,000");
    });

    it("offers the plans on Home and hides for the day when closed; the lock screen has its own pay button", () => {
        const onHide = vi.fn();
        show(facts(), true, onHide);
        expect(screen.getByRole("link", { name: "trialReport.choosePlan" }).getAttribute("href")).toBe("/settings?section=billing");
        fireEvent.click(screen.getByRole("button", { name: "trialReport.hideToday" }));
        expect(onHide).toHaveBeenCalledTimes(1);
        cleanup();
        show(facts(), false);
        expect(screen.queryByRole("link", { name: "trialReport.choosePlan" })).toBeNull();
    });

    it("reads in English for a merchant who uses the app in English", () => {
        state.language = "en";
        show();
        const card = screen.getByTestId("trial-report-card");
        expect(card.textContent).toContain("From 12 Nov to today (5 days)");
        expect(card.textContent).toContain("This week:");
        expect(screen.getByTestId("trial-report-orders").textContent).toBe("Your orders23");
        expect(screen.getByTestId("trial-report-cost").textContent).toContain("Your expected monthly cost at this size: about 23,220 IQD");
    });
});
