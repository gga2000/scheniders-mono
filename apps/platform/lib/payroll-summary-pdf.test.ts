import { describe, it, expect } from "vitest";
import { generatePayrollSummaryPDF } from "./payroll-summary-pdf";

// Guards the jsPDF 4 + jspdf-autotable pairing: the summary must still render
// to a real PDF after a major upgrade of either library.
describe("generatePayrollSummaryPDF", () => {
    it("renders a PDF for an empty period", async () => {
        const blob = await generatePayrollSummaryPDF([], "2026-11-01", "2026-11-30");
        const head = new TextDecoder().decode(new Uint8Array(await blob.arrayBuffer()).slice(0, 5));
        expect(head).toBe("%PDF-");
        expect(blob.size).toBeGreaterThan(1000);
    });
});
