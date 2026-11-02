import { useState } from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { LanguageProvider } from "@/components/providers/language-provider";
import { useOrderStore } from "@/store/use-order-store";
import type { OrderFilters } from "@/types/order";

const unchecked = vi.hoisted(() => ({ ids: [] as string[] }));
vi.mock("@/hooks/use-payment-unchecked", () => ({
    usePaymentUnchecked: () => unchecked.ids,
}));

import { PaymentUncheckedChip } from "./payment-unchecked-chip";

function renderChip(initial: OrderFilters) {
    const seen = vi.fn();
    function Harness() {
        const [filters, setFilters] = useState(initial);
        return (
            <PaymentUncheckedChip
                filters={filters}
                setFilters={(f) => { seen(f); setFilters(f); }}
            />
        );
    }
    render(<LanguageProvider><Harness /></LanguageProvider>);
    return seen;
}

describe("PaymentUncheckedChip", () => {
    beforeEach(() => useOrderStore.getState().setFilterPaymentUnchecked(false));
    afterEach(cleanup);

    it("stays hidden while every payment is checked", () => {
        unchecked.ids = [];
        renderChip({ status: "all" });
        expect(screen.queryByRole("button")).toBeNull();
    });

    it("shows the count and opens All across every date", () => {
        unchecked.ids = ["a", "b", "c"];
        const setFilters = renderChip({ status: "all", dateFrom: "2026-11-01", dateTo: "2026-11-01" });
        const chip = screen.getByRole("button");
        expect(chip.textContent).toContain("3");
        fireEvent.click(chip);
        expect(setFilters).toHaveBeenCalledWith({ status: "all", dateFrom: undefined, dateTo: undefined });
        expect(useOrderStore.getState().filterPaymentUnchecked).toBe(true);
    });

    it("switches itself off when a status tab is picked", () => {
        unchecked.ids = ["a"];
        useOrderStore.getState().setFilterPaymentUnchecked(true);
        renderChip({ status: "confirmed" });
        expect(useOrderStore.getState().filterPaymentUnchecked).toBe(false);
    });
});
