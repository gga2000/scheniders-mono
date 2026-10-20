/// <reference types="vitest/globals" />
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { LanguageProvider } from "@/components/providers/language-provider";
import { StickyFilterBar } from "./sticky-filter-bar";

afterEach(cleanup);

const renderBar = (props: Partial<Parameters<typeof StickyFilterBar>[0]> = {}) => {
    const setFilterDueToday = vi.fn();
    render(
        <LanguageProvider>
            <StickyFilterBar
                filters={{ status: "all" }}
                setFilters={() => {}}
                statusCounts={{}}
                showFilters={false}
                setShowFilters={() => {}}
                hasActiveFilters={false}
                groupBy="none"
                setGroupBy={() => {}}
                setFilterDueToday={setFilterDueToday}
                {...props}
            />
        </LanguageProvider>,
    );
    return { setFilterDueToday };
};

describe("counts hidden", () => {
    const products = Array.from({ length: 10 }, (_, i) => ({ name: `Product ${String.fromCharCode(65 + i)}`, count: 7 + i }));

    it("renders no number in the status chips, the product chips or the overflow menu; chips stay clickable", async () => {
        const setFilters = vi.fn();
        render(
            <LanguageProvider>
                <StickyFilterBar
                    filters={{ status: "all" }}
                    setFilters={setFilters}
                    statusCounts={{ all: 12, new: 3, delivered: 9 }}
                    productsInView={products}
                    showFilters={false}
                    setShowFilters={() => {}}
                    hasActiveFilters={false}
                    groupBy="none"
                    setGroupBy={() => {}}
                    showSubFilters
                    countsHidden
                />
            </LanguageProvider>,
        );
        const chips = [...document.querySelectorAll<HTMLElement>("[data-chip]")];
        expect(chips).toHaveLength(16);
        for (const chip of chips) {
            expect(chip.textContent ?? "").not.toMatch(/\d/);
            expect(chip.hasAttribute("data-chip-count")).toBe(false);
        }
        for (const chip of document.querySelectorAll<HTMLElement>("[data-product-chip]")) {
            expect(chip.textContent?.replace(chip.dataset.productChip ?? "", "") ?? "").not.toMatch(/\d/);
        }

        const more = screen.getByText(/\+2/).closest("button");
        if (!more) throw new Error("no overflow trigger");
        fireEvent.pointerDown(more, { button: 0, ctrlKey: false, pointerType: "mouse" });
        const items = await screen.findAllByRole("menuitem");
        expect(items).toHaveLength(2);
        for (const item of items) {
            expect((item.textContent ?? "").replace(/Product [A-Z]/, "")).not.toMatch(/\d/);
        }

        fireEvent.click(chips.find((c) => c.dataset.chip === "delivered") as HTMLElement);
        expect(setFilters).toHaveBeenCalledWith(expect.objectContaining({ status: "delivered" }));
    });

    it("renders the counts as data attributes when shown", () => {
        renderBar({ statusCounts: { all: 12, delivered: 9 } });
        expect(document.querySelector<HTMLElement>('[data-chip="delivered"]')?.dataset.chipCount).toBe("9");
        expect(document.querySelector<HTMLElement>('[data-chip="all"]')?.dataset.chipCount).toBe("12");
    });

    it("keeps the due-today toggle reachable while its badge is hidden", () => {
        renderBar({ dueTodayCount: 0, dueTodayCountHidden: true });
        const chip = screen.getByRole("button", { name: "مجدولة اليوم" });
        expect(chip.querySelector('[data-badge="due-today"]')).toBeNull();
    });

    it("hides the risk badge", () => {
        renderBar({ totalRiskCount: 5, riskCountHidden: true });
        expect(document.querySelector('[data-badge="risk"]')).toBeNull();
        cleanup();
        renderBar({ totalRiskCount: 5 });
        expect(document.querySelector('[data-badge="risk"]')?.textContent).toBe("5");
    });
});

describe("due-today filter chip", () => {
    it("stays hidden while nothing has come due", () => {
        renderBar({ dueTodayCount: 0 });
        expect(screen.queryByRole("button", { name: "مجدولة اليوم" })).toBeNull();
    });

    it("shows the queue size once orders come due", () => {
        renderBar({ dueTodayCount: 4 });
        const chip = screen.getByRole("button", { name: "مجدولة اليوم" });
        expect(chip.textContent).toContain("4");
    });

    it("toggles the filter on and back off", () => {
        const { setFilterDueToday } = renderBar({ dueTodayCount: 4, filterDueToday: false });
        fireEvent.click(screen.getByRole("button", { name: "مجدولة اليوم" }));
        expect(setFilterDueToday).toHaveBeenCalledWith(true);

        cleanup();
        const second = renderBar({ dueTodayCount: 4, filterDueToday: true });
        fireEvent.click(screen.getByRole("button", { name: "مجدولة اليوم" }));
        expect(second.setFilterDueToday).toHaveBeenCalledWith(false);
    });

    it("stays reachable while on, even after the queue empties, so it can be switched off", () => {
        renderBar({ dueTodayCount: 0, filterDueToday: true });
        expect(screen.getByRole("button", { name: "مجدولة اليوم" })).toBeTruthy();
    });
});
