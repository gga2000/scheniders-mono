// @vitest-environment jsdom
// Trust history: steady high scores sit on a raised axis (50–100) as a line, and the
// months before the first score say "Not scored yet" instead of staying blank.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("@/hooks/use-language", () => ({
    useLanguage: () => ({ language: "en", t: (key: string) => key }),
}));
vi.mock("@/hooks/use-customer-trust", () => ({
    useTrustScoreBreakdown: () => ({ data: { items: [], tier: "gold" } }),
    useTrustAuditLog: () => ({ data: { events: [] } }),
}));

import { TrustHistoryCard } from "./trust-history-card";

beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-11-15T12:00:00Z")); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

const months = ["2026-06", "2026-07", "2026-08", "2026-09", "2026-10"].map((month) => ({ month, avg_score: 90, event_count: 1 }));

function renderCard(data: { month: string; avg_score: number; event_count: number }[]) {
    return render(<TrustHistoryCard data={data} phone="07701234567" score={100} blocked={false} scored />);
}

describe("TrustHistoryCard history chart", () => {
    it("raises the axis to 50 for steady high scores and draws a line, not bars", () => {
        const { container } = renderCard([...months, { month: "2026-11", avg_score: 100, event_count: 1 }]);
        const figure = container.querySelector("figure") as HTMLElement;
        const axis = figure.firstElementChild as HTMLElement;
        expect([...axis.children].map((label) => label.textContent)).toEqual(["100", "75", "50"]);
        expect(figure.querySelectorAll("svg line")).toHaveLength(5);
        expect(screen.getByText("Nov: 100")).toBeTruthy();
    });

    it("labels the months before the first score in the 1-year view", () => {
        renderCard(months);
        expect(screen.getAllByText("customers.trust.notScored").length).toBeGreaterThan(0);
        expect(screen.getByText("Dec: customers.trust.notScored")).toBeTruthy();
        expect(screen.getByText("Jun: 90")).toBeTruthy();
    });

    it("keeps the axis from 0 once a month falls below 50", () => {
        const { container } = renderCard([{ month: "2026-09", avg_score: 40, event_count: 1 }, { month: "2026-10", avg_score: 70, event_count: 1 }]);
        const axis = container.querySelector("figure")?.firstElementChild as HTMLElement;
        expect([...axis.children].map((label) => label.textContent)).toEqual(["100", "50", "0"]);
    });
});
