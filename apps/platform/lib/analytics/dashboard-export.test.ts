import { describe, it, expect } from "vitest";
import { escapeCsvField, toCsv } from "./dashboard-export";

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
