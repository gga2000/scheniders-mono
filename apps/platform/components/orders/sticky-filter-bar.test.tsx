/// <reference types="vitest/globals" />
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach, onTestFinished } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { LanguageProvider } from "@/components/providers/language-provider";
import { StickyFilterBar } from "./sticky-filter-bar";

// jsdom has no ResizeObserver; the chip row watches its own width with one.
class FakeResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
}
beforeEach(() => vi.stubGlobal("ResizeObserver", FakeResizeObserver));
afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

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
        // Desktop: the five working queues in view, the rest behind «حالات أخرى».
        const chips = [...document.querySelectorAll<HTMLElement>("[data-chip]")];
        expect(chips.map((c) => c.dataset.chip)).toEqual(["all", "new", "contacted", "confirmed", "in_transit"]);
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

        fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
        const other = document.querySelector<HTMLElement>('[data-chip-menu="other"]');
        if (!other) throw new Error("no «حالات أخرى» trigger");
        expect(other.textContent ?? "").not.toMatch(/\d/);
        fireEvent.pointerDown(other, { button: 0, ctrlKey: false, pointerType: "mouse" });
        const statuses = await screen.findAllByRole("menuitem");
        expect(statuses).toHaveLength(11);
        for (const item of statuses) {
            expect(item.textContent ?? "").not.toMatch(/\d/);
            expect(item.hasAttribute("data-chip-count")).toBe(false);
        }
        fireEvent.click(statuses.find((c) => c.dataset.chip === "delivered") as HTMLElement);
        expect(setFilters).toHaveBeenCalledWith(expect.objectContaining({ status: "delivered" }));
    });

    it("renders the counts as data attributes when shown, with thousands separators", () => {
        renderBar({ statusCounts: { all: 1250, new: 9 } });
        expect(document.querySelector<HTMLElement>('[data-chip="new"]')?.dataset.chipCount).toBe("9");
        const all = document.querySelector<HTMLElement>('[data-chip="all"]');
        expect(all?.dataset.chipCount).toBe("1250");
        expect(all?.textContent).toContain("1,250");
    });

    it("holds the in-transit chip's place while its count loads, never showing a 0", () => {
        renderBar({ statusCounts: { all: 12, new: 9, in_transit: 0 }, transitCountPending: true });
        const transit = document.querySelector<HTMLElement>('[data-chip="in_transit"]');
        expect(transit?.hasAttribute("data-chip-count")).toBe(false);
        expect(transit?.getAttribute("aria-busy")).toBe("true");
        expect(transit?.textContent ?? "").not.toMatch(/\d/);
        // The other chips keep their numbers.
        expect(document.querySelector<HTMLElement>('[data-chip="new"]')?.dataset.chipCount).toBe("9");
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

describe("«حالات أخرى» menu (desktop)", () => {
    it("names the chosen status and its count on the trigger", () => {
        renderBar({ filters: { status: "delivered" }, statusCounts: { all: 12, delivered: 1250 } });
        const other = document.querySelector<HTMLElement>('[data-chip-menu="other"]');
        expect(other?.textContent).toContain("تم التوصيل");
        expect(other?.textContent).toContain("1,250");
        expect(other?.className).toContain("ring-2");
        // No chip in view reads as chosen.
        expect(document.querySelector('[data-chip="all"]')?.className).not.toContain("bg-primary");
    });

    it("reads «حالات أخرى» with no number while a working queue is chosen", () => {
        renderBar({ filters: { status: "new" }, statusCounts: { all: 12, new: 3, delivered: 9 } });
        const other = document.querySelector<HTMLElement>('[data-chip-menu="other"]');
        expect(other?.textContent).toBe("حالات أخرى");
    });

    it("lists every other status, each with its count", async () => {
        renderBar({ statusCounts: { all: 12, delivered: 9, no_response: 2 } });
        fireEvent.pointerDown(document.querySelector('[data-chip-menu="other"]') as HTMLElement, { button: 0, ctrlKey: false, pointerType: "mouse" });
        const items = await screen.findAllByRole("menuitem");
        expect(items.map((i) => i.dataset.chip)).toEqual([
            "pending_checkout", "delivered", "completed", "cancelled", "rejected", "refunds",
            "refunded", "refund_pending", "replacements", "suspended", "no_response",
        ]);
        expect(items.find((i) => i.dataset.chip === "delivered")?.dataset.chipCount).toBe("9");
    });

    it("is not on the phone, which keeps every chip in its row", () => {
        renderBar({ isMobile: true });
        expect(document.querySelectorAll("[data-chip]")).toHaveLength(16);
        expect(document.querySelector('[data-chip-menu="other"]')).toBeNull();
    });
});

describe("Prime queue chips slot", () => {
    it("sits right after «قيد التوصيل», and a status chip turns a Prime queue off", async () => {
        const { useOrderStore } = await import("@/store/use-order-store");
        useOrderStore.getState().setPrimeQueue("fix");
        renderBar({ primeQueueChips: <span data-testid="queue-slot" /> });
        const transit = document.querySelector('[data-chip="in_transit"]');
        expect(transit?.nextElementSibling?.getAttribute("data-testid")).toBe("queue-slot");
        // While a queue is on no status chip reads as chosen.
        expect(document.querySelector('[data-chip="all"]')?.className).not.toContain("bg-primary");
        fireEvent.click(document.querySelector('[data-chip="new"]') as HTMLElement);
        expect(useOrderStore.getState().primeQueue).toBeNull();
    });
});

describe("chip row edge cue", () => {
    it("fades and offers a scroll button only on a side that hides chips", () => {
        // A row twice as wide as its box, scrolled to the start: chips hide on the right only.
        vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockReturnValue(2400);
        vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(1200);
        const scrollBy = vi.fn();
        // jsdom has no scrollBy; this test adds it and takes it away again.
        const before = HTMLElement.prototype.scrollBy;
        HTMLElement.prototype.scrollBy = scrollBy;
        onTestFinished(() => { HTMLElement.prototype.scrollBy = before; });
        renderBar();
        expect(document.querySelector("[data-chip-row-scroll='left']")).toBeNull();
        const more = document.querySelector("[data-chip-row-scroll='right']") as HTMLButtonElement;
        expect(more).toBeTruthy();
        expect(document.querySelector("[data-chip-row]")?.className).toContain("mask-image");
        fireEvent.click(more);
        expect(scrollBy).toHaveBeenCalledWith({ left: 840, behavior: "smooth" });
    });

    it("shows no button when every chip fits", () => {
        renderBar();
        expect(document.querySelector("[data-chip-row-scroll]")).toBeNull();
        expect(document.querySelector("[data-chip-row]")?.className).not.toContain("mask-image");
    });
});
