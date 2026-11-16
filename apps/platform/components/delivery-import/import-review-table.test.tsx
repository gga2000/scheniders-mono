import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LanguageProvider } from "@/components/providers/language-provider";
import type { MatchedRow, ParsedPDFRow } from "@/types/delivery-import";
import type { Order } from "@/types/order";
import { ImportReviewTable } from "./import-review-table";

/*
 * The review table builds labels from data (category, filter, match method)
 * and from amounts. On the Arabic page nothing may show a raw key or the old
 * English copy, and amounts keep Latin digits.
 */

function pdfRow(rowNumber: number, over: Partial<ParsedPDFRow> = {}): ParsedPDFRow {
    return {
        rowNumber,
        storeName: "shop",
        shipmentNumber: `S${rowNumber}`,
        address: "بغداد",
        phone: "07700000000",
        shipmentAmount: 25000,
        deliveryFee: 5000,
        netToMerchant: 20000,
        status: "تم التسليم",
        itemCount: 1,
        entryDate: "2026-11-15",
        notes: "",
        isNegative: false,
        isPriceChanged: false,
        isPartialDelivery: false,
        isReorder: false,
        ...over,
    };
}

const order = { order_id: "100001", customer_name: "علي", phone: "07700000000", price: 30000, status: "in_transit" } as Order;

const matches: MatchedRow[] = [
    { pdfRow: pdfRow(1), order, category: "amount_mismatch", matchDetails: "", matchedBy: "order_id" },
    { pdfRow: pdfRow(2), order: null, category: "not_found", matchDetails: "", matchedBy: "none" },
    { pdfRow: pdfRow(3), order: { ...order, status: "delivered" } as Order, category: "already_delivered", matchDetails: "", matchedBy: "phone" },
];

afterEach(cleanup);

function renderTable() {
    render(
        <LanguageProvider>
            <ImportReviewTable
                matches={matches}
                selectedRows={new Set()}
                onToggleRow={vi.fn()}
                onSelectAllClean={vi.fn()}
                onDeselectAll={vi.fn()}
                resolutions={new Map()}
                onResolve={vi.fn()}
                onClearResolution={vi.fn()}
                onBulkResolve={vi.fn()}
            />
        </LanguageProvider>,
    );
}

describe("ImportReviewTable in Arabic", () => {
    it("shows no raw keys or English labels, with the row options open", () => {
        renderTable();
        fireEvent.click(screen.getByText("S1"));
        fireEvent.click(screen.getByRole("button", { name: /إظهار 1/ }));
        const text = document.body.textContent ?? "";
        expect(text).not.toContain("deliveryImport.");
        for (const english of ["Clean Match", "Amount Mismatch", "Resolve This Row", "Skip this row", "PDF Data", "Export CSV", "Matched By"]) {
            expect(text).not.toContain(english);
        }
        expect(text).toContain("25,000");
        expect(text).not.toMatch(/[٠-٩]/);
    });
});
