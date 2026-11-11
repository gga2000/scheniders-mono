import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { DeliveryImport } from "@/types/delivery-import";

/* Undo puts orders back, so it must ask first and only run on the second press. */

const rollbackImport = vi.fn(async () => true);
const imp = {
    id: "imp-1",
    receipt_number: "52399154",
    payment_date: "2026-11-11",
    receiving_agent: null,
    total_orders: 14,
    total_amount: 100000,
    processed_count: 14,
    skipped_count: 0,
    failed_count: 0,
    status: "confirmed",
    imported_by: null,
    confirmed_by: null,
    created_at: "2026-11-11T10:00:00Z",
    confirmed_at: null,
    pdf_filename: null,
} as unknown as DeliveryImport;

vi.mock("@/hooks/use-delivery-history", () => ({
    useDeliveryHistory: () => ({
        imports: [imp],
        isLoading: false,
        error: null,
        completeImport: vi.fn(),
        rollbackImport,
    }),
}));

const { DeliveryHistory } = await import("./delivery-history");

afterEach(() => {
    cleanup();
    rollbackImport.mockClear();
});

function openUndoConfirm() {
    render(<DeliveryHistory />);
    fireEvent.click(screen.getByText("Receipt #52399154"));
    fireEvent.click(screen.getByRole("button", { name: /undo import/i }));
    return screen.getByRole("alertdialog");
}

describe("DeliveryHistory undo", () => {
    it("asks before undoing and Keep cancels", () => {
        openUndoConfirm();
        expect(rollbackImport).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole("button", { name: "Keep" }));
        expect(screen.queryByRole("alertdialog")).toBeNull();
        expect(rollbackImport).not.toHaveBeenCalled();
    });

    it("undoes the receipt on confirm", async () => {
        const dialog = openUndoConfirm();
        fireEvent.click(within(dialog).getByRole("button", { name: "Undo import" }));
        await vi.waitFor(() => expect(rollbackImport).toHaveBeenCalledWith("imp-1"));
    });
});
