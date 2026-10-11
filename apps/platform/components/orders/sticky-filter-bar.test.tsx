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
