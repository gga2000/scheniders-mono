import { useState } from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { LanguageProvider } from "@/components/providers/language-provider";
import { useOrderStore } from "@/store/use-order-store";
import type { OrderFilters } from "@/types/order";

const lockTime = vi.hoisted(() => ({ ids: [] as string[] }));
vi.mock("@/hooks/use-lock-time-orders", () => ({
    useLockTimeOrders: () => lockTime.ids,
}));

import { LockTimeChip } from "./lock-time-chip";

function renderChip(initial: OrderFilters) {
    const seen = vi.fn();
    function Harness() {
        const [filters, setFilters] = useState(initial);
        return (
            <LockTimeChip
                filters={filters}
                setFilters={(f) => { seen(f); setFilters(f); }}
            />
        );
    }
    render(<LanguageProvider><Harness /></LanguageProvider>);
    return seen;
}

describe("LockTimeChip", () => {
    beforeEach(() => useOrderStore.getState().setFilterLockTime(false));
    afterEach(cleanup);

    it("stays hidden when no order came in while locked", () => {
        lockTime.ids = [];
        renderChip({ status: "all" });
        expect(screen.queryByRole("button")).toBeNull();
    });

    it("shows the count and opens All across every date", () => {
        lockTime.ids = ["a", "b"];
        const setFilters = renderChip({ status: "all", dateFrom: "2026-11-16", dateTo: "2026-11-16" });
        const chip = screen.getByRole("button");
        expect(chip.textContent).toContain("2");
        fireEvent.click(chip);
        expect(setFilters).toHaveBeenCalledWith({ status: "all", dateFrom: undefined, dateTo: undefined });
        expect(useOrderStore.getState().filterLockTime).toBe(true);
    });

    it("turns off on a second press", () => {
        lockTime.ids = ["a"];
        useOrderStore.getState().setFilterLockTime(true);
        renderChip({ status: "all" });
        fireEvent.click(screen.getByRole("button"));
        expect(useOrderStore.getState().filterLockTime).toBe(false);
    });

    it("switches itself off when a status tab is picked", () => {
        lockTime.ids = ["a"];
        useOrderStore.getState().setFilterLockTime(true);
        renderChip({ status: "confirmed" });
        expect(useOrderStore.getState().filterLockTime).toBe(false);
    });
});
