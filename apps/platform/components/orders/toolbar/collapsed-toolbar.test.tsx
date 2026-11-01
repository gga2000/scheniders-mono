/// <reference types="vitest/globals" />
// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { LanguageProvider } from "@/components/providers/language-provider";
import { CollapsedToolbar } from "./collapsed-toolbar";
import { getOrderStatusLabel } from "@/lib/order-status-labels";

afterEach(cleanup);

function show(over: Partial<React.ComponentProps<typeof CollapsedToolbar>> = {}) {
    const props: React.ComponentProps<typeof CollapsedToolbar> = {
        open: true, allSelected: false, selectedCount: 0, count: 12, status: undefined, previewing: false,
        onSelectAll: vi.fn(), setFilters: vi.fn(), onScannerOpen: vi.fn(), onReturnsOpen: vi.fn(),
        onCreateOpen: vi.fn(), onExpand: vi.fn(), ...over,
    };
    render(<LanguageProvider><CollapsedToolbar {...props} /></LanguageProvider>);
    return props;
}

describe("CollapsedToolbar", () => {
    it("renders nothing while the full toolbar is open", () => {
        show({ open: false });
        expect(document.querySelector("[data-orders-header-count]")).toBeNull();
    });

    it("hides a misleading count behind a dash", () => {
        show({ count: null });
        expect(document.querySelector("[data-orders-header-count]")?.textContent).toBe("—");
    });

    it("shows the filtered status by its label, not its raw key", () => {
        show({ status: "return_pending" });
        expect(screen.queryByText(/return_pending|return pending/)).toBeNull();
        const labels = [getOrderStatusLabel("return_pending", "en"), getOrderStatusLabel("return_pending", "ar")];
        expect(screen.getByText((text) => labels.includes(text))).toBeTruthy();
    });

    it("selects all from the checkbox", () => {
        const p = show({ allSelected: true });
        const selectAll = screen.getAllByRole("button", { pressed: true })[0];
        fireEvent.click(selectAll);
        expect(p.onSelectAll).toHaveBeenCalled();
    });
});
