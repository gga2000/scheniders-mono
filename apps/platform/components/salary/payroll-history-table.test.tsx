import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LanguageProvider } from "@/components/providers/language-provider";
import { PayrollHistoryTable } from "./payroll-history-table";
import { payrollEmployees, payrollHistory } from "../../stories/payroll-fixtures";

afterEach(cleanup);

const names = new Map(payrollEmployees.map((e) => [e.employee.id, e.employee.displayName ?? e.employee.email]));

/** Month titles of the calendar cards (the month filter's options repeat the same words). */
function calendarMonths() {
    return screen.queryAllByText(/^\w+ 2026$/).filter((el) => el.tagName === "P").map((el) => el.textContent);
}

function renderTable() {
    localStorage.setItem("schneiders_language", "en");
    render(
        <LanguageProvider>
            <PayrollHistoryTable records={payrollHistory} loading={false} failed={false} onVoid={async () => ({ error: null })} employeeNames={names} />
        </LanguageProvider>,
    );
}

describe("PayrollHistoryTable calendar", () => {
    it("opens on the month of the latest payment and lists that month's payments", () => {
        renderTable();
        fireEvent.click(screen.getByTitle("Calendar"));
        // Latest fixture payments are on 30 September 2026; August is shown beside it.
        expect(calendarMonths()).toEqual(["August 2026", "September 2026"]);
        expect(screen.getByText("3 paid")).toBeTruthy();
        // The voided August record is not listed; two paid ones are.
        expect(screen.getByText("2 paid")).toBeTruthy();
    });

    it("moves to earlier months", () => {
        renderTable();
        fireEvent.click(screen.getByTitle("Calendar"));
        fireEvent.click(screen.getByRole("button", { name: "Earlier months" }));
        expect(calendarMonths()).toEqual(["July 2026", "August 2026"]);
    });
});
