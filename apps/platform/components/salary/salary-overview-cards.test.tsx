import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LanguageProvider } from "@/components/providers/language-provider";
import { SalaryOverviewCards } from "./salary-overview-cards";
import { payrollBreakdown } from "../../stories/payroll-fixtures";

afterEach(cleanup);

describe("SalaryOverviewCards", () => {
    it("shows money owed and the period's orders in one strip", () => {
        localStorage.setItem("schneiders_language", "en");
        const onAdvancesClick = vi.fn();
        render(
            <LanguageProvider>
                <SalaryOverviewCards
                    totalDue={1878000}
                    employeeCount={3}
                    totalPendingAdvances={100000}
                    totalPendingPenalties={25000}
                    breakdown={payrollBreakdown}
                    projectedTotal={1933000}
                    inTransitOrders={55}
                    onAdvancesClick={onAdvancesClick}
                />
            </LanguageProvider>,
        );
        expect(screen.getByRole("region", { name: "Payroll summary" })).toBeTruthy();
        expect(screen.getByText("3 members on payroll")).toBeTruthy();
        expect(screen.getByText(`${payrollBreakdown.completedTotal} completed orders this period (all staff)`)).toBeTruthy();
        expect(screen.getByText(`${Math.round(payrollBreakdown.qualityScore * 100)}%`)).toBeTruthy();
        expect(screen.getByText(/If all 55 in-transit orders arrive/)).toBeTruthy();
        expect(screen.getByText("1,933,000 IQD")).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: /Active advances/ }));
        expect(onAdvancesClick).toHaveBeenCalledOnce();
    });
});
