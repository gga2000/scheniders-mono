import { useState } from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { LanguageProvider } from "@/components/providers/language-provider";
import { useOrderStore } from "@/store/use-order-store";
import type { OrderFilters } from "@/types/order";

const stuck = vi.hoisted(() => ({ ids: [] as string[] }));
vi.mock("@/hooks/use-stuck-in-transit", () => ({
    useStuckInTransit: () => ({ since: new Map(), stuckIds: stuck.ids }),
}));

import { StuckTransitChip } from "./stuck-transit-chip";

function renderChip(initial: OrderFilters) {
    const seen = vi.fn();
    function Harness() {
        const [filters, setFilters] = useState(initial);
        return (
            <StuckTransitChip
                filters={filters}
                setFilters={(f) => { seen(f); setFilters(f); }}
            />
        );
    }
    render(<LanguageProvider><Harness /></LanguageProvider>);
    return seen;
}

describe("StuckTransitChip", () => {
    beforeEach(() => useOrderStore.getState().setFilterStuckTransit(false));
    afterEach(cleanup);

    it("stays hidden while nothing is stuck", () => {
        stuck.ids = [];
        renderChip({ status: "all" });
        expect(screen.queryByRole("button")).toBeNull();
    });

    it("shows the count and opens In transit across every date", () => {
        stuck.ids = ["a", "b", "c"];
        const setFilters = renderChip({ status: "all", dateFrom: "2026-11-01", dateTo: "2026-11-01" });
        const chip = screen.getByRole("button");
        expect(chip.textContent).toContain("3");
        fireEvent.click(chip);
        expect(setFilters).toHaveBeenCalledWith({ status: "in_transit", dateFrom: undefined, dateTo: undefined });
        expect(useOrderStore.getState().filterStuckTransit).toBe(true);
    });

    it("switches itself off when the tab leaves In transit", () => {
        stuck.ids = ["a"];
        useOrderStore.getState().setFilterStuckTransit(true);
        renderChip({ status: "confirmed" });
        expect(useOrderStore.getState().filterStuckTransit).toBe(false);
    });
});
