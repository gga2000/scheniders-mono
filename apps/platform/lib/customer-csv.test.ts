import { describe, expect, it } from "vitest";
import { csvCell, csvDate, csvPhone, toCsv } from "./customer-csv";

describe("customer CSV export", () => {
    it("neutralises values Excel would run as a formula", () => {
        expect(csvCell("=HYPERLINK(\"x\")")).toBe("\"'=HYPERLINK(\"\"x\"\")\"");
        expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
        expect(csvCell("-1+2")).toBe("'-1+2");
    });

    it("keeps a +964 phone as data", () => {
        expect(csvCell("+9647701234567")).toBe("+9647701234567");
    });

    it("quotes commas, quotes and newlines", () => {
        expect(csvCell("Baghdad, Karrada")).toBe("\"Baghdad, Karrada\"");
        expect(csvCell("line\nbreak")).toBe("\"line\nbreak\"");
    });

    it("writes every stored phone shape as one +964 number", () => {
        expect(csvPhone("07701234567")).toBe("+9647701234567");
        expect(csvPhone("+9647701234567")).toBe("+9647701234567");
        expect(csvPhone("7701234567")).toBe("+9647701234567");
        expect(csvPhone(null)).toBe("");
    });

    it("formats dates and rows", () => {
        expect(csvDate("2026-10-30T08:00:00Z")).toBe("2026-10-30");
        expect(toCsv([["a", 1], [null, "b"]])).toBe("a,1\n,b");
    });
});
