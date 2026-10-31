import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { LanguageProvider } from "@/components/providers/language-provider";
import { EmployeePayrollCard } from "./employee-payroll-card";
import { payrollEmployees } from "../../stories/payroll-fixtures";
import type { EmployeePayrollData } from "@/types/salary";

afterEach(cleanup);

const noop = async () => undefined;

function renderCard(data: EmployeePayrollData) {
    localStorage.setItem("schneiders_language", "en");
    render(
        <LanguageProvider>
            <EmployeePayrollCard
                data={data}
                globalPeriodStart="2026-10-01"
                globalPeriodEnd="2026-10-31"
                onAddAdvance={noop}
                onAddPenalty={noop}
                onAddBonus={noop}
                onMarkAsPaid={() => undefined}
                onVoidPayment={noop}
                onUpdateConfig={noop}
                onPeriodOverride={() => undefined}
                onClearPeriodOverride={() => undefined}
                onHide={() => undefined}
                loadConfigHistory={async () => []}
                hasOverride={false}
            />
        </LanguageProvider>,
    );
}

describe("EmployeePayrollCard ledger", () => {
    it("shows the paid order bonus and lists replacements/refunds as not counted, not as deductions", () => {
        renderCard(payrollEmployees[0]);
        expect(screen.getByText("+212,000")).toBeTruthy();
        expect(screen.queryByText("−6,000")).toBeNull();
        expect(screen.getByText(/Not counted: 6 replacements, 4 refunds/)).toBeTruthy();
        // Before deductions = base + paid order bonus + bonuses = what the payslip calls gross.
        expect(screen.getByText("862,000")).toBeTruthy();
    });

    it("uses the kept share of a partly refunded order", () => {
        const base = payrollEmployees[1];
        const partial: EmployeePayrollData = {
            ...base,
            calculation: { ...base.calculation, orderBonus: 140500, grossSalary: 690500, netSalary: 665500 },
        };
        renderCard(partial);
        expect(screen.getByText("+140,500")).toBeTruthy();
        expect(screen.getByText(/140\.5×1,000/)).toBeTruthy();
    });

    it("translates the role", () => {
        renderCard(payrollEmployees[2]);
        expect(screen.getByText("Employee")).toBeTruthy();
    });
});
