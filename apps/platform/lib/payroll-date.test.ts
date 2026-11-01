import { describe, expect, it } from "vitest";
import { ar } from "date-fns/locale";
import { formatPayrollDate } from "./payroll-date";

describe("formatPayrollDate", () => {
    it("reads a day key without shifting the day", () => {
        expect(formatPayrollDate("2026-10-01", "MMM d")).toBe("Oct 1");
    });
    it("formats in Arabic", () => {
        expect(formatPayrollDate("2026-10-01", "d MMMM", ar)).toBe("1 أكتوبر");
    });
    it("shows a non-date as written and an empty value as empty", () => {
        expect(formatPayrollDate("not-a-date", "MMM d")).toBe("not-a-date");
        expect(formatPayrollDate(null, "MMM d")).toBe("");
    });
});
