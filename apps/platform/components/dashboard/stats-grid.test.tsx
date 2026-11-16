/// <reference types="vitest/globals" />
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { LanguageProvider } from "@/components/providers/language-provider";
import { StatsGrid } from "./stats-grid";

afterEach(cleanup);

const stats = { newOrders: 3, contactedOrders: 1, confirmedOrders: 1250, rejectedOrders: 570 };

function renderGrid(rejectedInPeriod: number | null, onCardClick = vi.fn()) {
    render(
        <LanguageProvider>
            <StatsGrid stats={stats} rejectedInPeriod={rejectedInPeriod} periodLabel="آخر 7 أيام" onCardClick={onCardClick} />
        </LanguageProvider>,
    );
    return onCardClick;
}

// Round 15 (board D2): every card says the period it counts.
describe("StatsGrid", () => {
    it("counts refused-at-the-door orders in the period, never the all-time total", () => {
        renderGrid(12);
        expect(document.querySelector('[data-stat="rejected"]')?.textContent).toBe("12");
        expect(document.querySelectorAll("h3")[2]?.textContent).toMatch(/مرفوض عند التوصيل.*آخر 7 أيام/);
        expect(document.body.textContent).not.toContain("570");
    });

    it("holds the rejected card's place while the period loads", () => {
        renderGrid(null);
        expect(document.querySelector('[data-stat="rejected"]')).toBeNull();
        expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
    });

    it("names the two work queues as now, with separators", () => {
        renderGrid(0);
        const titles = [...document.querySelectorAll("h3")].map((h) => h.textContent ?? "");
        expect(titles[0]).toMatch(/بانتظار المراجعة.*الآن/);
        expect(titles[1]).toMatch(/جاهز للتغليف.*الآن/);
        expect(document.body.textContent).toContain("1,250");
    });

    it("opens each card's orders", () => {
        const onCardClick = renderGrid(5);
        fireEvent.click(document.querySelectorAll("h3")[2] as HTMLElement);
        expect(onCardClick).toHaveBeenCalledWith("rejected");
    });
});
