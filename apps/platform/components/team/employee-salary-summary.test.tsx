import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { LanguageProvider } from "@/components/providers/language-provider";
import { EmployeeSalarySummary } from "./employee-salary-summary";

afterEach(cleanup);

function renderIn(language: "en" | "ar") {
    localStorage.setItem("schneiders_language", language);
    render(
        <LanguageProvider>
            <EmployeeSalarySummary
                rate={{ baseMonthlySalary: 750000, perOrderBonus: 1000, source: "employee_config" }}
                pending={[{ id: "a1", kind: "advance", amount: 100000, reason: null }]}
                onEdit={() => undefined}
            />
        </LanguageProvider>,
    );
}

describe("EmployeeSalarySummary", () => {
    it("uses the same currency label as /salaries, with the sign inside the amount", () => {
        renderIn("ar");
        expect(screen.getByText("750,000 د.ع")).toBeTruthy();
        expect(screen.getByText("−100,000 د.ع")).toBeTruthy();
        cleanup();
        renderIn("en");
        expect(screen.getByText("750,000 IQD")).toBeTruthy();
    });
});
