/// <reference types="vitest/globals" />
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { LanguageProvider } from "@/components/providers/language-provider";
import type { DateRangeKey } from "@/lib/analytics/dashboard-calculations";
import type { GovernoratePeriod, GovPeriod } from "@/lib/analytics/dashboard-bento";
import { GovernorateCard } from "./governorate-card";

const period = (counts: [string, number][]): GovernoratePeriod => ({
    counts: new Map(counts),
    total: counts.reduce((s, [, n]) => s + n, 0),
    previousTotal: 0,
    deltaPct: null,
});

vi.mock("@/hooks/use-dashboard-order-facts", () => ({
    useTrendFacts: () => ({ data: [], isError: false, refetch: vi.fn() }),
}));
vi.mock("@/lib/analytics/dashboard-bento", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/analytics/dashboard-bento")>()),
    governoratePeriods: (): Record<GovPeriod, GovernoratePeriod> => ({
        today: period([]),
        "7d": period([["BGD", 3], ["KOT", 1]]),
        "30d": period([["BGD", 103], ["KOT", 15], ["DYL", 12]]),
    }),
}));
vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });

afterEach(cleanup);

const pressed = () => document.querySelector('button[aria-pressed="true"]')?.textContent ?? "";
const tab = (label: RegExp) => {
    const button = [...document.querySelectorAll("button[aria-pressed]")].find((b) => label.test(b.textContent ?? ""));
    if (!button) throw new Error(`no tab ${label}`);
    return button;
};
const ui = (range: DateRangeKey) => <LanguageProvider><GovernorateCard range={range} /></LanguageProvider>;

// Round 15: the card used to sit on its own 7-day tab under a 30-day chip.
describe("GovernorateCard", () => {
    it("opens on the dashboard's period, with All on the longest it has", () => {
        const { rerender } = render(ui("30d"));
        expect(pressed()).toMatch(/^30 يوم/);
        rerender(ui("today"));
        expect(pressed()).toMatch(/^اليوم/);
        rerender(ui("all"));
        expect(pressed()).toMatch(/^30 يوم/);
    });

    it("keeps a tab picked on the card until the chip changes", () => {
        const { rerender } = render(ui("30d"));
        fireEvent.click(tab(/^7 أيام/));
        expect(pressed()).toMatch(/^7 أيام/);
        rerender(ui("30d"));
        expect(pressed()).toMatch(/^7 أيام/);
        rerender(ui("today"));
        expect(pressed()).toMatch(/^اليوم/);
    });

    it("names each governorate by its own name, not its capital", () => {
        render(ui("30d"));
        expect(document.body.textContent).toContain("واسط");
        expect(document.body.textContent).toContain("ديالى");
        expect(document.body.textContent).not.toMatch(/الكوت|بعقوبة/);
    });
});
