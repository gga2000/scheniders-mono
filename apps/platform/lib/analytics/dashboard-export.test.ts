import { describe, it, expect } from "vitest";
import { buildDashboardCsv, escapeCsvField, toCsv } from "./dashboard-export";
import { liveDashboardMetrics } from "./__fixtures__/dashboard-metrics";

/**
 * COM-D1. City and product names reach this file from order records — outside
 * data — so the export is an injection surface, not just a formatting problem.
 */
describe("CSV escaping", () => {
    it("THE RISK: neutralises a formula without changing what the reader sees", () => {
        // Opened in Excel, this would execute rather than display.
        expect(escapeCsvField("=cmd|'/c calc'!A1")).toBe("'=cmd|'/c calc'!A1");
        expect(escapeCsvField("+1234")).toBe("'+1234");
        expect(escapeCsvField("-1+1")).toBe("'-1+1");
        expect(escapeCsvField("@SUM(A1)")).toBe("'@SUM(A1)");
    });

    it("quotes fields containing commas, quotes or newlines", () => {
        expect(escapeCsvField("Baghdad, Karrada")).toBe('"Baghdad, Karrada"');
        expect(escapeCsvField('He said "hi"')).toBe('"He said ""hi"""');
        expect(escapeCsvField("line1\nline2")).toBe('"line1\nline2"');
    });

    it("leaves ordinary Arabic city names untouched", () => {
        expect(escapeCsvField("بغداد")).toBe("بغداد");
    });

    it("renders null and undefined as empty, not as the words", () => {
        expect(escapeCsvField(null)).toBe("");
        expect(escapeCsvField(undefined)).toBe("");
    });

    it("joins rows with CRLF so Excel reads them as rows", () => {
        expect(toCsv([["a", "b"], [1, 2]])).toBe("a,b\r\n1,2");
    });
});

/**
 * IQD has no minor unit. Product revenue is allocated proportionally by line
 * price, so it arrives fractional; the UI hides that via formatIQD's
 * maximumFractionDigits: 0. The export must agree with the screen it came from.
 */
describe("money in the export", () => {
    it("THE RISK: writes whole IQD, not the raw fraction the screen never showed", () => {
        const csv = buildDashboardCsv(liveDashboardMetrics(), {
            range: "all",
            includeFinancials: true,
            generatedAt: new Date("2026-09-09T00:00:00Z"),
        });
        expect(csv).toContain("73721144");
        expect(csv).not.toContain("73721144.2");
    });

    it("still omits money entirely when the viewer lacks VIEW_FINANCIALS", () => {
        const csv = buildDashboardCsv(liveDashboardMetrics(), {
            range: "all",
            includeFinancials: false,
            generatedAt: new Date("2026-09-09T00:00:00Z"),
        });
        expect(csv).not.toContain("73721144");
        expect(csv).toContain("Financial figures omitted");
    });
});
